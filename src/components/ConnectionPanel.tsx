import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useTabsStore } from "@/stores/tabs-store";
import { invoke } from "@tauri-apps/api/core";

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
  const [watchDir, setWatchDir] = useState<string | null>(null);

  useEffect(() => {
    if (mode === "stdio") {
      setStdioCommand(activeTab?.command ? `${activeTab.command} ${(activeTab.args || []).join(" ")}`.trim() : "");
    } else {
      setSseUrl(activeTab?.url ?? "");
      setSseAuth(activeTab?.headers?.Authorization ?? "");
    }
  }, [activeTabId, mode]);

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "stdio") {
      const parts = stdioCommand.trim().split(/\s+/);
      const cmd = parts[0];
      const args = parts.slice(1);
      setTabConnectionParams(activeTabId, { command: cmd, args });
    } else {
      const headers = sseAuth.trim()
        ? { Authorization: sseAuth.trim() }
        : undefined;
      setTabConnectionParams(activeTabId, { url: sseUrl.trim(), headers });
    }
    await connectTab(activeTabId);
  };

  const handleDisconnect = async () => {
    await disconnectTab(activeTabId);
  };

  const isBusy = connectionStatus === "connecting" || connectionStatus === "reconnecting";

  const statusColor = {
    disconnected: "bg-gray-500",
    connecting: "bg-yellow-500",
    connected: "bg-green-500",
    reconnecting: "bg-yellow-500 animate-pulse",
    error: "bg-red-500",
  }[connectionStatus];

  const handleStartWatching = async () => {
    try {
      await invoke("start_watching", { dir: watchInput });
      setWatchDir(watchInput);
    } catch {
      // error handled by command
    }
  };

  const handleStopWatching = async () => {
    try {
      await invoke("stop_watching");
      setWatchDir(null);
    } catch {
      // ignore
    }
  };

  return (
    <div className="space-y-3 p-4 border-b">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Server Connection</h2>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${statusColor}`} />
          <span className="text-sm text-muted-foreground capitalize">
            {connectionStatus}
          </span>
          {serverInfo && (
            <Badge variant="outline" className="text-xs">
              {serverInfo.name} {serverInfo.version}
            </Badge>
          )}
        </div>
      </div>

      {connectionError && (
        <div className="text-sm text-destructive bg-destructive/10 p-2 rounded">
          {connectionError}
        </div>
      )}

      <form onSubmit={handleConnect} className="space-y-3">
        <div className="flex items-center gap-2">
          <Select
            value={mode}
            onValueChange={(v) => setTabMode(activeTabId, v as "stdio" | "sse")}
          >
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="stdio">STDIO</SelectItem>
              <SelectItem value="sse">SSE</SelectItem>
            </SelectContent>
          </Select>

          {mode === "stdio" ? (
            <Input
              placeholder="node dist/server.js"
              value={stdioCommand}
              onChange={(e) => setStdioCommand(e.target.value)}
              className="flex-1 font-mono text-sm"
            />
          ) : (
            <div className="flex flex-1 gap-2">
              <Input
                placeholder="http://localhost:3000/mcp"
                value={sseUrl}
                onChange={(e) => setSseUrl(e.target.value)}
                className="flex-1 font-mono text-sm"
              />
              <Input
                placeholder="Authorization (e.g. Bearer ...)"
                value={sseAuth}
                onChange={(e) => setSseAuth(e.target.value)}
                className="w-48 font-mono text-sm"
                type="password"
              />
            </div>
          )}

          {connectionStatus === "connected" ? (
            <Button variant="destructive" size="sm" onClick={handleDisconnect}>
              Disconnect
            </Button>
          ) : (
            <Button type="submit" size="sm" disabled={isBusy}>
              {connectionStatus === "connecting" ? "Connecting..." : "Connect"}
            </Button>
          )}
        </div>
      </form>

      <div className="flex items-center gap-2">
        <Input
          placeholder="Watch directory (for hot reload)"
          value={watchInput}
          onChange={(e) => setWatchInput(e.target.value)}
          className="flex-1 font-mono text-sm"
        />
        {watchDir ? (
          <Button variant="destructive" size="sm" onClick={handleStopWatching}>
            Stop Watch
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            onClick={handleStartWatching}
            disabled={!watchInput.trim()}
          >
            Watch
          </Button>
        )}
        {watchDir && (
          <Badge variant="outline" className="text-xs">
            watching
          </Badge>
        )}
      </div>
    </div>
  );
}
