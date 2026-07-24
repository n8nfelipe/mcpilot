import { useEffect, useState, useRef, useMemo } from "react";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ConnectionPanel } from "@/components/ConnectionPanel";
import { ToolExplorer } from "@/components/ToolExplorer";
import { Playground } from "@/components/Playground";
import { HistoryPanel } from "@/components/HistoryPanel";
import { LogsPanel } from "@/components/LogsPanel";
import { MockManager } from "@/components/MockManager";
import { useHistoryStore } from "@/stores/history-store";
import { useTabsStore } from "@/stores/tabs-store";
import { useMockStore } from "@/stores/mock-store";
import { useLicenseStore } from "@/stores/license-store";
import { useFeature } from "@/lib/feature-gate";
import { generateDocs, copyToClipboard } from "@/lib/export-docs";
import { listen } from "@tauri-apps/api/event";

function LicenseBadge() {
  const { tier, activate, deactivate } = useLicenseStore();
  const [showInput, setShowInput] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [error, setError] = useState("");

  const handleActivate = () => {
    const ok = activate(keyInput);
    if (ok) {
      setShowInput(false);
      setKeyInput("");
      setError("");
    } else {
      setError("Invalid license key");
    }
  };

  if (tier === "pro") {
    return (
      <div className="flex items-center gap-1">
        <Badge className="text-[10px] h-5 bg-green-600">Pro</Badge>
        {showInput ? (
          <div className="flex items-center gap-1">
            <Input
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="Enter Pro key"
              className="h-5 text-[10px] w-32"
              onKeyDown={(e) => e.key === "Enter" && handleActivate()}
            />
            <Button size="sm" className="h-5 text-[10px] px-1" onClick={handleActivate}>
              OK
            </Button>
            <button
              onClick={() => setShowInput(false)}
              className="text-xs text-muted-foreground hover:text-foreground px-1"
            >
              ×
            </button>
          </div>
        ) : (
          <>
            <button
              onClick={() => setShowInput(true)}
              className="text-[10px] text-muted-foreground hover:text-foreground"
            >
              change
            </button>
            <button
              onClick={deactivate}
              className="text-[10px] text-muted-foreground hover:text-foreground"
            >
              deactivate
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Badge variant="outline" className="text-[10px] h-5">Free</Badge>
      {showInput ? (
        <div className="flex items-center gap-1">
          <Input
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            placeholder="Enter Pro key"
            className="h-5 text-[10px] w-32"
            onKeyDown={(e) => e.key === "Enter" && handleActivate()}
          />
          <Button size="sm" className="h-5 text-[10px] px-1" onClick={handleActivate}>
            OK
          </Button>
          <button
            onClick={() => setShowInput(false)}
            className="text-xs text-muted-foreground hover:text-foreground px-1"
          >
            ×
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowInput(true)}
          className="text-[10px] text-muted-foreground hover:text-foreground"
        >
          upgrade
        </button>
      )}
      {error && <span className="text-[10px] text-destructive">{error}</span>}
    </div>
  );
}

function App() {
  const init = useHistoryStore((s) => s.init);
  const tabs = useTabsStore((s) => s.tabs);
  const activeTabId = useTabsStore((s) => s.activeTabId);
  const addTab = useTabsStore((s) => s.addTab);
  const closeTab = useTabsStore((s) => s.closeTab);
  const setActiveTab = useTabsStore((s) => s.setActiveTab);
  const [showHistory, setShowHistory] = useState(false);
  const [showMocks, setShowMocks] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const entries = useHistoryStore((s) => s.entries);
  const mockCount = useMockStore((s) => Object.keys(s.mocks).length);
  const multiServer = useFeature("multi-server");
  const exportDocs = useFeature("export-docs");
  const mockManager = useFeature("mock-manager");
  const hotReloadRef = useRef(false);
  const lastConnectionRef = useRef<{ mode: string; command?: string; args?: string[]; url?: string; headers?: Record<string, string>; tabId: string } | null>(null);

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    if (!hotReloadRef.current) {
      hotReloadRef.current = true;
      const unlisten = listen<Record<string, never>>("server-code-changed", async () => {
        const lc = lastConnectionRef.current;
        if (!lc) return;
        const state = useTabsStore.getState();
        const tab = state.tabs.find((t) => t.id === lc.tabId);
        if (!tab) return;
        state.setTabMode(lc.tabId, lc.mode as "stdio" | "sse");
        if (lc.mode === "stdio") {
          state.setTabConnectionParams(lc.tabId, { command: lc.command, args: lc.args });
        } else {
          state.setTabConnectionParams(lc.tabId, { url: lc.url, headers: lc.headers });
        }
        await state.connectTab(lc.tabId);
      });
      return () => { unlisten.then((f) => f()); };
    }
  }, []);

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const isConnected = activeTab?.connectionStatus === "connected";

  const exportMarkdown = useMemo(() => {
    if (!activeTab) return "";
    return generateDocs(activeTab, entries);
  }, [activeTab, entries]);

  useEffect(() => {
    if (isConnected) {
      const tab = useTabsStore.getState().tabs.find((t) => t.id === activeTabId);
      if (tab) {
        lastConnectionRef.current = {
          mode: tab.mode,
          command: tab.command,
          args: tab.args,
          url: tab.url,
          headers: tab.headers,
          tabId: activeTabId,
        };
      }
    }
  }, [isConnected, activeTabId]);

  return (
    <div className="h-dvh flex flex-col">
      <header className="border-b px-4 py-1 flex items-center gap-1">
        <h1 className="text-sm font-bold tracking-tight mr-2">MCPilot</h1>
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs cursor-pointer border-b-2 transition-colors ${
              tab.id === activeTabId
                ? "border-primary bg-muted/50"
                : "border-transparent hover:bg-muted/30"
            }`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="truncate max-w-24">{tab.name}</span>
            {tab.connectionStatus === "connected" && (
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
            )}
            {tabs.length > 1 && (
              <button
                onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                className="text-muted-foreground hover:text-foreground ml-1"
              >
                ×
              </button>
            )}
          </div>
        ))}
        <Button
          variant="ghost"
          size="sm"
          className="h-5 text-xs px-1"
          onClick={() => {
            if (multiServer.enabled) {
              addTab();
            }
          }}
          title={multiServer.enabled ? "Add tab" : "Upgrade to Pro for Multi-Server"}
        >
          {multiServer.enabled ? "+" : <span className="text-muted-foreground">+</span>}
        </Button>
        <div className="ml-auto" />
        <button
          onClick={() => setShowLogs(!showLogs)}
          className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted transition-colors"
        >
          Logs
        </button>
        {mockManager.enabled ? (
          <button
            onClick={() => setShowMocks(!showMocks)}
            className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted transition-colors"
          >
            Mocks ({mockCount})
          </button>
        ) : (
          <span className="text-xs text-muted-foreground px-2 py-1" title="Upgrade to Pro for Mock Manager">
            Mocks —
          </span>
        )}
        <button
          onClick={() => setShowHistory(!showHistory)}
          className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted transition-colors"
        >
          History ({entries.length})
        </button>
        {exportDocs.enabled ? (
          <Dialog open={showExport} onOpenChange={setShowExport}>
            <DialogTrigger asChild>
              <button className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted transition-colors">
                Export Docs
              </button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
              <DialogHeader>
                <DialogTitle className="text-sm">Documentation Preview</DialogTitle>
              </DialogHeader>
              <div className="flex gap-2 mb-2">
                <Button size="sm" className="h-6 text-xs" onClick={() => copyToClipboard(exportMarkdown)}>
                  Copy to Clipboard
                </Button>
              </div>
              <ScrollArea className="flex-1">
                <pre className="text-xs whitespace-pre-wrap font-mono bg-muted/50 p-4 rounded border">
                  {exportMarkdown}
                </pre>
              </ScrollArea>
            </DialogContent>
          </Dialog>
        ) : (
          <span className="text-xs text-muted-foreground px-2 py-1" title="Upgrade to Pro for Export Docs">
            Export —
          </span>
        )}
        <LicenseBadge />
      </header>
      <ConnectionPanel />
      <Separator />
      <div className="flex-1 flex overflow-hidden">
        <div className="w-80 border-r flex flex-col overflow-hidden">
          <ToolExplorer />
        </div>
        <div className="flex-1 flex flex-col overflow-hidden">
          <Playground />
        </div>
      </div>
      {showLogs && (
        <>
          <Separator />
          <div className="h-60 border-t flex flex-col overflow-hidden">
            <LogsPanel />
          </div>
        </>
      )}
      {showMocks && mockManager.enabled && (
        <>
          <Separator />
          <div className="h-60 border-t flex flex-col overflow-hidden">
            <MockManager />
          </div>
        </>
      )}
      {showHistory && (
        <>
          <Separator />
          <div className="h-60 border-t flex flex-col overflow-hidden">
            <HistoryPanel />
          </div>
        </>
      )}
    </div>
  );
}

export default App;
