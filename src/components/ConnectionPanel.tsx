import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useTabsStore } from "@/stores/tabs-store";
import { invoke } from "@tauri-apps/api/core";

export function parseStdioCommand(input: string): { command: string; args: string[] } {
  const parts: string[] = [];
  let part = "";
  let quote: "'" | '"' | null = null;
  let escaped = false;
  let started = false;

  for (const character of input) {
    if (escaped) {
      part += character;
      escaped = false;
      started = true;
    } else if (character === "\\") {
      escaped = true;
      started = true;
    } else if (quote) {
      if (character === quote) quote = null;
      else part += character;
    } else if (character === "'" || character === '"') {
      quote = character;
      started = true;
    } else if (/\s/.test(character)) {
      if (started) {
        parts.push(part);
        part = "";
        started = false;
      }
    } else {
      part += character;
      started = true;
    }
  }

  if (quote) throw new Error("Unclosed quote in command");
  if (escaped) part += "\\";
  if (started) parts.push(part);
  if (!parts.length || !parts[0]) throw new Error("Enter a command");

  return { command: parts[0], args: parts.slice(1) };
}

export function ConnectionPanel() {
  const tabs = useTabsStore((s) => s.tabs);
  const activeTabId = useTabsStore((s) => s.activeTabId);
  const setTabMode = useTabsStore((s) => s.setTabMode);
  const setTabConnectionParams = useTabsStore((s) => s.setTabConnectionParams);
  const connectTab = useTabsStore((s) => s.connectTab);
  const disconnectTab = useTabsStore((s) => s.disconnectTab);
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const mode = activeTab?.mode ?? "stdio";
  const connectionStatus = activeTab?.connectionStatus ?? "disconnected";
  const connectionError = activeTab?.connectionError ?? null;
  const serverInfo = activeTab?.serverInfo ?? null;

  const [stdioCommand, setStdioCommand] = useState("");
  const [sseUrl, setSseUrl] = useState("");
  const [sseAuth, setSseAuth] = useState("");
  const [watchInput, setWatchInput] = useState("");
  const [watchDirs, setWatchDirs] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState(false);
  const [commandError, setCommandError] = useState<string | null>(null);
  const watchDir = watchDirs[activeTabId] ?? null;

  useEffect(() => {
    if (mode === "stdio") {
      setStdioCommand(activeTab?.command ? `${activeTab.command} ${(activeTab.args || []).join(" ")}`.trim() : "");
    } else {
      setSseUrl(activeTab?.url ?? "");
      setSseAuth(activeTab?.headers?.Authorization ?? "");
    }
  }, [activeTabId, mode]);

  useEffect(() => {
    if (connectionError) setExpanded(true);
  }, [connectionError]);

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "stdio") {
      try {
        const params = parseStdioCommand(stdioCommand);
        setCommandError(null);
        setTabConnectionParams(activeTabId, params);
      } catch (error) {
        setCommandError(error instanceof Error ? error.message : String(error));
        setExpanded(true);
        return;
      }
    } else {
      setCommandError(null);
      const headers = sseAuth.trim() ? { Authorization: sseAuth.trim() } : undefined;
      setTabConnectionParams(activeTabId, { url: sseUrl.trim(), headers });
    }
    await connectTab(activeTabId);
  };

  const isBusy = connectionStatus === "connecting" || connectionStatus === "authenticating" || connectionStatus === "reconnecting";
  const statusColor = {
    disconnected: "bg-muted-foreground/40",
    connecting: "bg-warning",
    authenticating: "bg-warning animate-pulse",
    connected: "bg-success",
    reconnecting: "bg-warning animate-pulse",
    error: "bg-destructive",
  }[connectionStatus];

  const handleStartWatching = async () => {
    try {
      await invoke("start_watching", { dir: watchInput, connectionId: activeTabId });
      setWatchDirs((current) => ({ ...current, [activeTabId]: watchInput }));
    } catch (error) {
      setCommandError(String(error));
    }
  };
  const handleStopWatching = async () => {
    try {
      await invoke("stop_watching", { connectionId: activeTabId });
      setWatchDirs((current) => {
        const next = { ...current };
        delete next[activeTabId];
        return next;
      });
    } catch (error) {
      setCommandError(String(error));
    }
  };

  return (
    <div className="shrink-0">
      {/* Compact connection bar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b">
        <span className={`w-2 h-2 rounded-full ${statusColor} shrink-0`} />
        <span className="text-[11px] text-muted-foreground capitalize min-w-16">{connectionStatus}</span>

        <form onSubmit={handleConnect} className="flex items-center gap-1.5 flex-1 min-w-0">
          <Select value={mode} onValueChange={(v) => setTabMode(activeTabId, v as "stdio" | "sse")}>
            <SelectTrigger className="w-20 h-7 text-[11px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="stdio" className="text-xs">STDIO</SelectItem>
              <SelectItem value="sse" className="text-xs">HTTP/SSE</SelectItem>
            </SelectContent>
          </Select>

          {mode === "stdio" ? (
            <Input placeholder="node dist/server.js" value={stdioCommand} onChange={(e) => { setStdioCommand(e.target.value); setCommandError(null); }} className="flex-1 h-7 text-[11px] font-mono" />
          ) : (
            <div className="flex flex-1 gap-1.5">
              <Input placeholder="http://localhost:3000/mcp" value={sseUrl} onChange={(e) => setSseUrl(e.target.value)} className="flex-1 h-7 text-[11px] font-mono" />
              <Input placeholder="Bearer token (optional)" value={sseAuth} onChange={(e) => setSseAuth(e.target.value)} className="w-40 h-7 text-[11px] font-mono" type="password" />
            </div>
          )}

          {connectionStatus === "connected" ? (
            <Button type="button" variant="destructive" size="sm" className="h-7 text-[11px] px-2" onClick={() => disconnectTab(activeTabId)}>Disconnect</Button>
          ) : (
            <Button type="submit" size="sm" className="h-7 text-[11px] px-3" disabled={isBusy}>{connectionStatus === "authenticating" ? "Login in browser" : isBusy ? "..." : "Connect"}</Button>
          )}
        </form>

        {serverInfo && <Badge variant="outline" className="text-[10px] h-5 shrink-0">{serverInfo.name}</Badge>}

        <button onClick={() => setExpanded(!expanded)} className="text-[10px] text-muted-foreground hover:text-foreground shrink-0">{expanded ? "▲" : "▼"}</button>
      </div>

      {/* Expandable: watch directory + error */}
      {expanded && (
        <div className="px-3 py-1.5 border-b space-y-1">
          {(commandError || connectionError) && (
            <div className="text-[11px] text-destructive bg-destructive/5 px-2 py-1 rounded">{commandError || connectionError}</div>
          )}
          <div className="flex items-center gap-1.5">
            <Input placeholder="Watch directory (hot reload)" value={watchInput} onChange={(e) => setWatchInput(e.target.value)} className="flex-1 h-7 text-[11px]" />
            {watchDir ? (
              <Button variant="destructive" size="sm" className="h-7 text-[11px] px-2" onClick={handleStopWatching}>Stop</Button>
            ) : (
              <Button size="sm" variant="outline" className="h-7 text-[11px] px-2" onClick={handleStartWatching} disabled={!watchInput.trim()}>Watch</Button>
            )}
            {watchDir && <Badge variant="outline" className="text-[10px] h-5">watching</Badge>}
          </div>
        </div>
      )}
    </div>
  );
}
