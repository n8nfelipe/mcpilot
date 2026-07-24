use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::oneshot;

type PendingMap = Arc<Mutex<HashMap<String, oneshot::Sender<BridgeResponse>>>>;

struct BridgeState {
    child: Option<Child>,
    pending: PendingMap,
    watcher: Option<RecommendedWatcher>,
}

#[derive(Serialize, Deserialize, Clone)]
struct BridgeRequest {
    id: String,
    #[serde(rename = "type")]
    type_: String,
    #[serde(default)]
    params: serde_json::Value,
}

#[derive(Serialize, Deserialize, Clone)]
struct BridgeResponse {
    id: Option<String>,
    #[serde(rename = "type")]
    type_: String,
    #[serde(default)]
    data: serde_json::Value,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    error: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    event: Option<String>,
}

fn bridge_dir() -> String {
    let dev_path = std::path::PathBuf::from(
        std::env::var("CARGO_MANIFEST_DIR").unwrap_or_else(|_| String::from(".")),
    )
    .join("mcp-bridge");
    if dev_path.join("bridge.js").exists() {
        return dev_path.to_string_lossy().to_string();
    }
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.join("mcp-bridge")))
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| "mcp-bridge".to_string())
}

fn spawn_bridge() -> Result<Child, String> {
    Command::new("node")
        .arg("bridge.js")
        .current_dir(bridge_dir())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .spawn()
        .map_err(|e| format!("Failed to start bridge: {}", e))
}

fn uuid() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    format!("r{}", nanos)
}

#[tauri::command]
async fn bridge_send(
    _app: AppHandle,
    state: tauri::State<'_, Mutex<BridgeState>>,
    cmd_type: String,
    params: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let id = uuid();

    let (tx, rx) = oneshot::channel();
    {
        let s = state.lock().map_err(|e| e.to_string())?;
        s.pending.lock().map_err(|e| e.to_string())?.insert(id.clone(), tx);
    }

    let req = BridgeRequest {
        id: id.clone(),
        type_: cmd_type,
        params,
    };
    let req_str = serde_json::to_string(&req).map_err(|e| e.to_string())?;

    {
        let mut s = state.lock().map_err(|e| e.to_string())?;
        let child = s.child.as_mut().ok_or("Bridge not started")?;
        let stdin = child.stdin.as_mut().ok_or("Bridge stdin unavailable")?;
        writeln!(stdin, "{}", req_str).map_err(|e| format!("Bridge write error: {}", e))?;
        stdin.flush().map_err(|e| format!("Bridge flush error: {}", e))?;
    }

    let resp = rx.await.map_err(|_| "Bridge response dropped".to_string())?;

    if resp.type_ == "error" {
        return Err(resp.error.unwrap_or_else(|| "Unknown error".to_string()));
    }

    Ok(resp.data)
}

#[tauri::command]
fn bridge_stop(state: tauri::State<'_, Mutex<BridgeState>>) -> Result<(), String> {
    let mut s = state.lock().map_err(|e| e.to_string())?;
    if let Some(mut child) = s.child.take() {
        let _ = child.kill();
        let _ = child.wait();
    }
    Ok(())
}

#[tauri::command]
fn start_watching(
    app: AppHandle,
    state: tauri::State<'_, Mutex<BridgeState>>,
    dir: String,
) -> Result<(), String> {
    let mut s = state.lock().map_err(|e| e.to_string())?;
    let path: PathBuf = dir.into();

    if !path.exists() {
        return Err(format!("Directory does not exist: {}", path.display()));
    }

    let app_clone = app.clone();
    let mut watcher = RecommendedWatcher::new(
        move |res: Result<Event, notify::Error>| {
            if let Ok(event) = res {
                if matches!(event.kind, EventKind::Modify(_) | EventKind::Create(_) | EventKind::Remove(_)) {
                    let _ = app_clone.emit("server-code-changed", serde_json::json!({}));
                }
            }
        },
        Config::default(),
    )
    .map_err(|e| format!("Failed to create watcher: {}", e))?;

    watcher
        .watch(&path, RecursiveMode::Recursive)
        .map_err(|e| format!("Failed to start watching: {}", e))?;

    s.watcher = Some(watcher);
    Ok(())
}

#[tauri::command]
fn stop_watching(state: tauri::State<'_, Mutex<BridgeState>>) -> Result<(), String> {
    let mut s = state.lock().map_err(|e| e.to_string())?;
    s.watcher.take();
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .setup(|app| {
            let mut child = spawn_bridge().expect("Failed to start MCP bridge");
            let stdout = child.stdout.take().expect("Bridge stdout missing");
            let pending: PendingMap = Arc::new(Mutex::new(HashMap::new()));
            let reader_pending = pending.clone();
            let app_handle = app.handle().clone();

            std::thread::spawn(move || {
                let reader = BufReader::new(stdout);
                for line in reader.lines() {
                    match line {
                        Ok(line) => {
                            let trimmed = line.trim().to_string();
                            if trimmed.is_empty() {
                                continue;
                            }
                            match serde_json::from_str::<BridgeResponse>(&trimmed) {
                                Ok(resp) => {
                                    if let Some(ref resp_id) = resp.id {
                                        let mut map = reader_pending.lock().unwrap();
                                        if let Some(tx) = map.remove(resp_id) {
                                            let _ = tx.send(resp.clone());
                                            continue;
                                        }
                                    }
                                    if resp.type_ == "event" {
                                        let _ = app_handle.emit("bridge-event", resp.clone());
                                    }
                                }
                                Err(e) => {
                                    eprintln!("[bridge] parse error: {} line: {}", e, trimmed);
                                }
                            }
                        }
                        Err(e) => {
                            eprintln!("[bridge] read error: {}", e);
                            break;
                        }
                    }
                }
                let _ = app_handle.emit(
                    "bridge-event",
                    serde_json::json!({"type": "event", "event": "bridge_exited"}),
                );
            });

            app.manage(Mutex::new(BridgeState {
                child: Some(child),
                pending,
                watcher: None,
            }));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![bridge_send, bridge_stop, start_watching, stop_watching])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
