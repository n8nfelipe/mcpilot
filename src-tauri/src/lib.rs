use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_opener::OpenerExt;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::sync::oneshot;
use tokio::time::{timeout, Duration};

type PendingMap = Arc<Mutex<HashMap<String, oneshot::Sender<BridgeResponse>>>>;
type AuthPendingMap = Arc<Mutex<HashMap<String, oneshot::Sender<String>>>>;

const BRIDGE_REQUEST_TIMEOUT: Duration = Duration::from_secs(30);
const OAUTH_CALLBACK_TIMEOUT: Duration = Duration::from_secs(300);

struct BridgeState {
    child: Option<Child>,
    pending: PendingMap,
    auth_pending: AuthPendingMap,
    alive: Arc<AtomicBool>,
    watchers: HashMap<String, RecommendedWatcher>,
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

struct OAuthCallback {
    code: Option<String>,
    state: Option<String>,
    error: Option<String>,
    error_description: Option<String>,
}

fn bridge_dir(app: &AppHandle) -> String {
    let dev_path = std::path::PathBuf::from(
        std::env::var("CARGO_MANIFEST_DIR").unwrap_or_else(|_| String::from(".")),
    )
    .join("mcp-bridge");
    if dev_path.join("bridge.js").exists() {
        return dev_path.to_string_lossy().to_string();
    }
    if let Ok(resource_dir) = app.path().resource_dir() {
        let p = resource_dir.join("mcp-bridge");
        if p.join("bridge.bundle.cjs").exists() {
            return p.to_string_lossy().to_string();
        }
    }
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.join("mcp-bridge")))
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| "mcp-bridge".to_string())
}

fn spawn_bridge(app: &AppHandle) -> Result<Child, String> {
    let executable_name = if cfg!(windows) {
        "mcp-bridge.exe"
    } else {
        "mcp-bridge"
    };
    let bundled_bridge = std::env::current_exe()
        .ok()
        .and_then(|path| path.parent().map(|parent| parent.join(executable_name)))
        .filter(|path| path.exists())
        .or_else(|| {
            app.path()
                .resource_dir()
                .ok()
                .map(|path| path.join(executable_name))
                .filter(|path| path.exists())
        });
    if let Some(executable) = bundled_bridge {
        return Command::new(executable)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()
            .map_err(|e| format!("Failed to start bundled bridge: {}", e));
    }
    let dir = bridge_dir(app);
    let entry = if std::path::Path::new(&dir)
        .join("bridge.bundle.cjs")
        .exists()
    {
        "bridge.bundle.cjs"
    } else {
        "bridge.js"
    };
    Command::new("node")
        .arg(entry)
        .current_dir(&dir)
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
        .unwrap_or_default()
        .as_nanos();
    format!("r{}", nanos)
}

fn response_data(resp: BridgeResponse) -> Result<serde_json::Value, String> {
    if resp.type_ == "error" {
        return Err(resp.error.unwrap_or_else(|| "Unknown error".to_string()));
    }
    Ok(resp.data)
}

fn remote_uses_oauth(cmd_type: &str, params: &serde_json::Value) -> bool {
    if cmd_type != "connect_sse" {
        return false;
    }
    !params
        .get("headers")
        .and_then(serde_json::Value::as_object)
        .is_some_and(|headers| {
            headers
                .keys()
                .any(|key| key.eq_ignore_ascii_case("authorization"))
        })
}

async fn receive_oauth_callback(
    listener: tokio::net::TcpListener,
) -> Result<OAuthCallback, String> {
    let (mut stream, _) = listener.accept().await.map_err(|e| e.to_string())?;
    let mut buffer = vec![0_u8; 16 * 1024];
    let size = stream.read(&mut buffer).await.map_err(|e| e.to_string())?;
    let request = String::from_utf8_lossy(&buffer[..size]);
    let target = request
        .lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        .ok_or("Invalid OAuth callback request")?;
    let callback_url = url::Url::parse(&format!("http://127.0.0.1{}", target))
        .map_err(|e| format!("Invalid OAuth callback URL: {}", e))?;

    if callback_url.path() != "/oauth/callback" {
        return Err("Invalid OAuth callback path".to_string());
    }

    let mut code = None;
    let mut state = None;
    let mut error = None;
    let mut error_description = None;
    for (key, value) in callback_url.query_pairs() {
        match key.as_ref() {
            "code" => code = Some(value.into_owned()),
            "state" => state = Some(value.into_owned()),
            "error" => error = Some(value.into_owned()),
            "error_description" => error_description = Some(value.into_owned()),
            _ => {}
        }
    }

    let successful = code.is_some() && error.is_none();
    let title = if successful {
        "Authentication complete"
    } else {
        "Authentication failed"
    };
    let message = if successful {
        "You can close this window and return to MCPilot."
    } else {
        "Return to MCPilot to review the authentication error."
    };
    let body = format!(
        "<!doctype html><html><head><meta charset=\"utf-8\"><title>{}</title></head><body><h1>{}</h1><p>{}</p></body></html>",
        title, title, message
    );
    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        body.len(), body
    );
    stream
        .write_all(response.as_bytes())
        .await
        .map_err(|e| e.to_string())?;

    Ok(OAuthCallback {
        code,
        state,
        error,
        error_description,
    })
}

fn bridge_error(message: &str) -> BridgeResponse {
    BridgeResponse {
        id: None,
        type_: "error".to_string(),
        data: serde_json::Value::Null,
        error: Some(message.to_string()),
        event: None,
    }
}

fn fail_pending(pending: &PendingMap, auth_pending: &AuthPendingMap, message: &str) {
    if let Ok(mut map) = pending.lock() {
        for (_, tx) in map.drain() {
            let _ = tx.send(bridge_error(message));
        }
    }
    if let Ok(mut map) = auth_pending.lock() {
        map.clear();
    }
}

fn start_bridge(app: &AppHandle, state: &mut BridgeState) -> Result<(), String> {
    let mut child = spawn_bridge(app)?;
    let stdout = match child.stdout.take() {
        Some(stdout) => stdout,
        None => {
            let _ = child.kill();
            let _ = child.wait();
            return Err("Bridge stdout unavailable".to_string());
        }
    };
    let pending: PendingMap = Arc::new(Mutex::new(HashMap::new()));
    let auth_pending: AuthPendingMap = Arc::new(Mutex::new(HashMap::new()));
    let alive = Arc::new(AtomicBool::new(true));
    let reader_pending = pending.clone();
    let reader_auth_pending = auth_pending.clone();
    let reader_alive = alive.clone();
    let app_handle = app.clone();

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
                            if resp.event.as_deref() == Some("oauth_required") {
                                let connection_id = resp
                                    .data
                                    .get("connectionId")
                                    .and_then(serde_json::Value::as_str);
                                let authorization_url = resp
                                    .data
                                    .get("authorizationUrl")
                                    .and_then(serde_json::Value::as_str);
                                if let (Some(connection_id), Some(authorization_url)) =
                                    (connection_id, authorization_url)
                                {
                                    if let Ok(mut map) = reader_auth_pending.lock() {
                                        if let Some(tx) = map.remove(connection_id) {
                                            let _ = tx.send(authorization_url.to_string());
                                        }
                                    }
                                }
                            }
                            if let Some(ref resp_id) = resp.id {
                                if let Ok(mut map) = reader_pending.lock() {
                                    if let Some(tx) = map.remove(resp_id) {
                                        let _ = tx.send(resp.clone());
                                        continue;
                                    }
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
        reader_alive.store(false, Ordering::Release);
        fail_pending(
            &reader_pending,
            &reader_auth_pending,
            "Bridge process exited",
        );
        let _ = app_handle.emit(
            "bridge-event",
            serde_json::json!({"type": "event", "event": "bridge_exited"}),
        );
    });

    state.child = Some(child);
    state.pending = pending;
    state.auth_pending = auth_pending;
    state.alive = alive;
    Ok(())
}

fn stop_bridge(state: &mut BridgeState, message: &str) {
    state.alive.store(false, Ordering::Release);
    if let Some(mut child) = state.child.take() {
        let _ = child.kill();
        let _ = child.wait();
    }
    fail_pending(&state.pending, &state.auth_pending, message);
}

fn restart_bridge_inner(app: &AppHandle, state: &mut BridgeState) -> Result<(), String> {
    stop_bridge(state, "Bridge restarted");
    start_bridge(app, state)
}

fn ensure_bridge(app: &AppHandle, state: &mut BridgeState) -> Result<(), String> {
    let process_alive = if state.alive.load(Ordering::Acquire) {
        match state.child.as_mut() {
            Some(child) => matches!(child.try_wait(), Ok(None)),
            None => false,
        }
    } else {
        false
    };
    if process_alive {
        Ok(())
    } else {
        restart_bridge_inner(app, state)
    }
}

fn write_bridge_request(state: &mut BridgeState, request: &BridgeRequest) -> Result<(), String> {
    let request_string = serde_json::to_string(request).map_err(|e| e.to_string())?;
    let child = state.child.as_mut().ok_or("Bridge not started")?;
    let stdin = child.stdin.as_mut().ok_or("Bridge stdin unavailable")?;
    writeln!(stdin, "{}", request_string).map_err(|e| format!("Bridge write error: {}", e))?;
    stdin
        .flush()
        .map_err(|e| format!("Bridge flush error: {}", e))
}

fn register_and_write(
    state: &mut BridgeState,
    request: &BridgeRequest,
    connection_id: Option<&str>,
) -> Result<
    (
        oneshot::Receiver<BridgeResponse>,
        Option<oneshot::Receiver<String>>,
    ),
    String,
> {
    let (tx, rx) = oneshot::channel();
    state
        .pending
        .lock()
        .map_err(|e| e.to_string())?
        .insert(request.id.clone(), tx);
    let auth_rx = if let Some(connection_id) = connection_id {
        let (auth_tx, auth_rx) = oneshot::channel();
        match state.auth_pending.lock() {
            Ok(mut map) => {
                map.insert(connection_id.to_string(), auth_tx);
            }
            Err(error) => {
                if let Ok(mut map) = state.pending.lock() {
                    map.remove(&request.id);
                }
                return Err(error.to_string());
            }
        }
        Some(auth_rx)
    } else {
        None
    };

    if let Err(error) = write_bridge_request(state, request) {
        if let Ok(mut map) = state.pending.lock() {
            map.remove(&request.id);
        }
        if let Some(connection_id) = connection_id {
            if let Ok(mut map) = state.auth_pending.lock() {
                map.remove(connection_id);
            }
        }
        state.alive.store(false, Ordering::Release);
        return Err(error);
    }

    Ok((rx, auth_rx))
}

fn remove_request(state: &BridgeState, id: &str, connection_id: Option<&str>) {
    if let Ok(mut map) = state.pending.lock() {
        map.remove(id);
    }
    if let Some(connection_id) = connection_id {
        if let Ok(mut map) = state.auth_pending.lock() {
            map.remove(connection_id);
        }
    }
}

#[tauri::command]
async fn bridge_send(
    app: AppHandle,
    state: tauri::State<'_, Mutex<BridgeState>>,
    cmd_type: String,
    mut params: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let id = uuid();
    let mut oauth_listener = None;
    let mut oauth_connection_id = None;

    if remote_uses_oauth(&cmd_type, &params) {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
            .await
            .map_err(|e| format!("Failed to start OAuth callback listener: {}", e))?;
        let port = listener.local_addr().map_err(|e| e.to_string())?.port();
        let storage_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
        std::fs::create_dir_all(&storage_dir).map_err(|e| e.to_string())?;
        let connection_id = params
            .get("connectionId")
            .and_then(serde_json::Value::as_str)
            .unwrap_or("default")
            .to_string();
        let object = params
            .as_object_mut()
            .ok_or("Bridge params must be an object")?;
        object.insert(
            "redirectUrl".to_string(),
            serde_json::Value::String(format!("http://127.0.0.1:{}/oauth/callback", port)),
        );
        object.insert(
            "authStoragePath".to_string(),
            serde_json::Value::String(
                storage_dir
                    .join("oauth-credentials.json")
                    .to_string_lossy()
                    .to_string(),
            ),
        );
        oauth_listener = Some(listener);
        oauth_connection_id = Some(connection_id);
    }

    let req = BridgeRequest {
        id: id.clone(),
        type_: cmd_type,
        params,
    };
    let (rx, auth_rx) = {
        let mut bridge = state.lock().map_err(|e| e.to_string())?;
        ensure_bridge(&app, &mut bridge)?;
        match register_and_write(&mut bridge, &req, oauth_connection_id.as_deref()) {
            Ok(receivers) => receivers,
            Err(first_error) => {
                restart_bridge_inner(&app, &mut bridge).map_err(|restart_error| {
                    format!("{}; bridge restart failed: {}", first_error, restart_error)
                })?;
                register_and_write(&mut bridge, &req, oauth_connection_id.as_deref()).map_err(
                    |retry_error| format!("{}; bridge retry failed: {}", first_error, retry_error),
                )?
            }
        }
    };

    let (Some(listener), Some(mut auth_rx), Some(connection_id)) =
        (oauth_listener, auth_rx, oauth_connection_id)
    else {
        return match timeout(BRIDGE_REQUEST_TIMEOUT, rx).await {
            Ok(Ok(response)) => response_data(response),
            Ok(Err(_)) => Err("Bridge response dropped".to_string()),
            Err(_) => {
                if let Ok(bridge) = state.lock() {
                    remove_request(&bridge, &id, None);
                }
                Err("Bridge request timed out after 30 seconds".to_string())
            }
        };
    };

    let mut rx = rx;
    let authorization_url = tokio::select! {
        response = &mut rx => {
            if let Ok(bridge) = state.lock() {
                remove_request(&bridge, &id, Some(&connection_id));
            }
            return response_data(response.map_err(|_| "Bridge response dropped".to_string())?);
        }
        result = &mut auth_rx => match result {
            Ok(url) => url,
            Err(_) => {
                if let Ok(bridge) = state.lock() {
                    remove_request(&bridge, &id, Some(&connection_id));
                }
                return Err("OAuth authorization request dropped".to_string());
            }
        },
        _ = tokio::time::sleep(BRIDGE_REQUEST_TIMEOUT) => {
            if let Ok(bridge) = state.lock() {
                remove_request(&bridge, &id, Some(&connection_id));
            }
            return Err("OAuth authorization request timed out after 30 seconds".to_string());
        }
    };

    let callback = match app.opener().open_url(authorization_url, None::<&str>) {
        Ok(()) => match timeout(OAUTH_CALLBACK_TIMEOUT, receive_oauth_callback(listener)).await {
            Ok(Ok(callback)) => callback,
            Ok(Err(err)) => OAuthCallback {
                code: None,
                state: None,
                error: Some("invalid_oauth_callback".to_string()),
                error_description: Some(err),
            },
            Err(_) => OAuthCallback {
                code: None,
                state: None,
                error: Some("oauth_timeout".to_string()),
                error_description: Some("OAuth login timed out after 5 minutes".to_string()),
            },
        },
        Err(err) => OAuthCallback {
            code: None,
            state: None,
            error: Some("browser_open_failed".to_string()),
            error_description: Some(format!("Failed to open browser: {}", err)),
        },
    };

    let callback_request = BridgeRequest {
        id: uuid(),
        type_: "oauth_callback".to_string(),
        params: serde_json::json!({
            "connectionId": connection_id,
            "code": callback.code,
            "state": callback.state,
            "error": callback.error,
            "errorDescription": callback.error_description,
        }),
    };
    let callback_write = {
        let mut bridge = state.lock().map_err(|e| e.to_string())?;
        match write_bridge_request(&mut bridge, &callback_request) {
            Ok(()) => Ok(()),
            Err(error) => {
                remove_request(&bridge, &id, Some(&connection_id));
                let restart_result = restart_bridge_inner(&app, &mut bridge);
                match restart_result {
                    Ok(()) => Err(error),
                    Err(restart_error) => Err(format!(
                        "{}; bridge restart failed: {}",
                        error, restart_error
                    )),
                }
            }
        }
    };
    callback_write?;
    match timeout(BRIDGE_REQUEST_TIMEOUT, rx).await {
        Ok(Ok(response)) => response_data(response),
        Ok(Err(_)) => Err("Bridge response dropped".to_string()),
        Err(_) => {
            if let Ok(bridge) = state.lock() {
                remove_request(&bridge, &id, Some(&connection_id));
            }
            Err("Bridge request timed out after 30 seconds".to_string())
        }
    }
}

#[tauri::command]
fn bridge_stop(state: tauri::State<'_, Mutex<BridgeState>>) -> Result<(), String> {
    let mut s = state.lock().map_err(|e| e.to_string())?;
    stop_bridge(&mut s, "Bridge stopped");
    Ok(())
}

#[tauri::command]
fn restart_bridge(
    app: AppHandle,
    state: tauri::State<'_, Mutex<BridgeState>>,
) -> Result<(), String> {
    let mut bridge = state.lock().map_err(|e| e.to_string())?;
    restart_bridge_inner(&app, &mut bridge)
}

#[tauri::command]
fn start_watching(
    app: AppHandle,
    state: tauri::State<'_, Mutex<BridgeState>>,
    dir: String,
    connection_id: String,
) -> Result<(), String> {
    let mut s = state.lock().map_err(|e| e.to_string())?;
    let path: PathBuf = dir.into();

    if !path.exists() {
        return Err(format!("Directory does not exist: {}", path.display()));
    }

    let app_clone = app.clone();
    let event_connection_id = connection_id.clone();
    let last_event = Arc::new(Mutex::new(
        std::time::Instant::now() - Duration::from_secs(1),
    ));
    let callback_last_event = last_event.clone();
    let mut watcher = RecommendedWatcher::new(
        move |res: Result<Event, notify::Error>| {
            if let Ok(event) = res {
                if matches!(
                    event.kind,
                    EventKind::Modify(_) | EventKind::Create(_) | EventKind::Remove(_)
                ) {
                    if let Ok(mut last_event) = callback_last_event.lock() {
                        if last_event.elapsed() < Duration::from_millis(300) {
                            return;
                        }
                        *last_event = std::time::Instant::now();
                    }
                    let _ = app_clone.emit(
                        "server-code-changed",
                        serde_json::json!({"connectionId": event_connection_id}),
                    );
                }
            }
        },
        Config::default(),
    )
    .map_err(|e| format!("Failed to create watcher: {}", e))?;

    watcher
        .watch(&path, RecursiveMode::Recursive)
        .map_err(|e| format!("Failed to start watching: {}", e))?;

    s.watchers.insert(connection_id, watcher);
    Ok(())
}

#[tauri::command]
fn stop_watching(
    state: tauri::State<'_, Mutex<BridgeState>>,
    connection_id: String,
) -> Result<(), String> {
    let mut s = state.lock().map_err(|e| e.to_string())?;
    s.watchers.remove(&connection_id);
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .setup(|app| {
            app.manage(Mutex::new(BridgeState {
                child: None,
                pending: Arc::new(Mutex::new(HashMap::new())),
                auth_pending: Arc::new(Mutex::new(HashMap::new())),
                alive: Arc::new(AtomicBool::new(false)),
                watchers: HashMap::new(),
            }));
            let state = app.state::<Mutex<BridgeState>>();
            let mut bridge = state.lock().map_err(|e| e.to_string())?;
            if let Err(error) = start_bridge(app.handle(), &mut bridge) {
                eprintln!("[bridge] startup error: {}", error);
                let _ = app.emit(
                    "bridge-event",
                    serde_json::json!({"type": "event", "event": "bridge_exited", "error": error}),
                );
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            bridge_send,
            bridge_stop,
            restart_bridge,
            start_watching,
            stop_watching
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn enables_oauth_for_remote_connections_without_authorization_header() {
        let params = serde_json::json!({"url": "https://mcp.figma.com/mcp"});
        assert!(remote_uses_oauth("connect_sse", &params));
        assert!(!remote_uses_oauth("connect_stdio", &params));
    }

    #[test]
    fn preserves_manual_authorization_headers() {
        let params = serde_json::json!({
            "url": "https://example.com/mcp",
            "headers": {"authorization": "Bearer token"}
        });
        assert!(!remote_uses_oauth("connect_sse", &params));
    }

    #[tokio::test]
    async fn parses_oauth_callback_parameters() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let callback = tokio::spawn(receive_oauth_callback(listener));
        let mut stream = tokio::net::TcpStream::connect(address).await.unwrap();
        stream
            .write_all(
                b"GET /oauth/callback?code=test-code&state=test-state HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n",
            )
            .await
            .unwrap();
        let mut response = String::new();
        stream.read_to_string(&mut response).await.unwrap();

        let result = callback.await.unwrap().unwrap();
        assert_eq!(result.code.as_deref(), Some("test-code"));
        assert_eq!(result.state.as_deref(), Some("test-state"));
        assert!(response.contains("Authentication complete"));
    }
}
