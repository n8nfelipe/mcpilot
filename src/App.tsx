import { useEffect, useState, useRef, useMemo } from "react";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorBoundary } from "@/components/ErrorBoundary";
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
import { generateDocs, copyToClipboard, downloadMarkdown } from "@/lib/export-docs";
import { listen } from "@tauri-apps/api/event";

const THEME_STORAGE_KEY = "mcpilot-theme";

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
      setError("Invalid key");
    }
  };

  if (tier === "pro") {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] font-medium text-primary">Pro</span>
        <button onClick={() => setShowInput(!showInput)} className="text-[10px] text-muted-foreground hover:text-foreground">change</button>
        <button onClick={deactivate} className="text-[10px] text-muted-foreground hover:text-foreground">x</button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] text-muted-foreground">Free</span>
      {showInput ? (
        <div className="flex items-center gap-1">
          <Input value={keyInput} onChange={(e) => setKeyInput(e.target.value)} placeholder="Pro key" className="h-5 text-[10px] w-28" onKeyDown={(e) => e.key === "Enter" && handleActivate()} />
          <Button size="sm" className="h-5 text-[10px] px-1.5" onClick={handleActivate}>OK</Button>
          <button onClick={() => setShowInput(false)} className="text-xs text-muted-foreground">x</button>
        </div>
      ) : (
        <button onClick={() => setShowInput(true)} className="text-[10px] text-primary hover:text-primary/80 font-medium">Upgrade</button>
      )}
      {error && <span className="text-[10px] text-destructive">{error}</span>}
    </div>
  );
}

function App() {
  const init = useHistoryStore((s) => s.init);
  const revalidateLicense = useLicenseStore((s) => s.revalidate);
  const tabs = useTabsStore((s) => s.tabs);
  const activeTabId = useTabsStore((s) => s.activeTabId);
  const addTab = useTabsStore((s) => s.addTab);
  const closeTab = useTabsStore((s) => s.closeTab);
  const setActiveTab = useTabsStore((s) => s.setActiveTab);
  const [showHistory, setShowHistory] = useState(false);
  const [showMocks, setShowMocks] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      if (stored) return stored === "dark";
    } catch {
      return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
    }
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
  });
  const entries = useHistoryStore((s) => s.entries);
  const mockCount = useMockStore((s) => Object.values(s.mocks).filter((mock) => mock.connectionId === activeTabId).length);
  const multiServer = useFeature("multi-server");
  const exportDocs = useFeature("export-docs");
  const mockManager = useFeature("mock-manager");
  const bridgeRecoveryRef = useRef(false);

  useEffect(() => { init(); }, [init]);

  useEffect(() => {
    if (multiServer.enabled) return;
    const state = useTabsStore.getState();
    for (const tab of state.tabs) {
      if (tab.id !== state.activeTabId) void state.closeTab(tab.id);
    }
  }, [multiServer.enabled]);

  useEffect(() => {
    revalidateLicense();
    const interval = window.setInterval(revalidateLicense, 60 * 60 * 1000);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") revalidateLicense();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [revalidateLicense]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, darkMode ? "dark" : "light");
    } catch {
      return;
    }
  }, [darkMode]);

  useEffect(() => {
    const unlisten = listen<{ event?: string; data?: { connectionId?: string } }>("bridge-event", ({ payload }) => {
      if (payload.event === "oauth_required" && payload.data?.connectionId) {
        useTabsStore.getState().setTabAuthenticating(payload.data.connectionId);
      }
      if (payload.event === "disconnected" && payload.data?.connectionId) {
        useTabsStore.getState().markDisconnected(payload.data.connectionId);
      }
      if (payload.event === "bridge_exited" && !bridgeRecoveryRef.current) {
        bridgeRecoveryRef.current = true;
        const state = useTabsStore.getState();
        const reconnectIds = state.tabs
          .filter((tab) => ["connected", "connecting", "authenticating"].includes(tab.connectionStatus))
          .map((tab) => tab.id);
        state.markAllDisconnected();
        window.setTimeout(async () => {
          const current = useTabsStore.getState();
          const existingIds = reconnectIds.filter((id) => current.tabs.some((tab) => tab.id === id));
          existingIds.forEach((id) => current.setTabReconnecting(id));
          await Promise.all(existingIds.map((id) => current.connectTab(id)));
          bridgeRecoveryRef.current = false;
        }, 250);
      }
    });
    return () => { unlisten.then((f) => f()); };
  }, []);

  useEffect(() => {
    const unlisten = listen<{ connectionId?: string }>("server-code-changed", async ({ payload }) => {
      if (!payload.connectionId) return;
      const state = useTabsStore.getState();
      if (!state.tabs.some((tab) => tab.id === payload.connectionId)) return;
      state.setTabReconnecting(payload.connectionId);
      await state.connectTab(payload.connectionId);
    });
    return () => { unlisten.then((f) => f()); };
  }, []);

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const activeEntries = entries.filter((entry) => entry.connection_id === activeTabId);

  const exportMarkdown = useMemo(() => {
    if (!activeTab) return "";
    return generateDocs(activeTab, entries);
  }, [activeTab, entries]);

  return (
    <div className="h-dvh flex flex-col bg-background">
      {/* Title bar */}
      <div className="flex items-center h-9 px-3 border-b bg-sidebar shrink-0 select-none">
        <span className="text-xs font-semibold tracking-tight mr-3">MCPilot</span>
        <div className="flex items-center gap-0.5 flex-1 min-w-0">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className={`flex items-center gap-1.5 px-2.5 h-7 text-[11px] rounded-t border cursor-pointer transition-colors -mb-px ${
                tab.id === activeTabId
                  ? "bg-background border-b-background text-foreground font-medium"
                  : "bg-sidebar border-transparent text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="truncate max-w-20">{tab.name}</span>
              {tab.connectionStatus === "connected" && <span className="w-1.5 h-1.5 rounded-full bg-success shrink-0" />}
              {tabs.length > 1 && (
                <button onClick={(e) => { e.stopPropagation(); void closeTab(tab.id); }} className="text-muted-foreground/50 hover:text-foreground ml-0.5 leading-none">×</button>
              )}
            </div>
          ))}
          {multiServer.enabled && (
            <button onClick={addTab} className="h-7 w-7 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded text-sm">+</button>
          )}
        </div>
        <div className="flex items-center gap-3 ml-auto">
          <button onClick={() => setShowLogs(!showLogs)} className={`text-xs transition-colors ${showLogs ? "text-primary font-medium" : "text-muted-foreground hover:text-foreground"}`}>Logs</button>
          {mockManager.enabled ? (
            <button onClick={() => setShowMocks(!showMocks)} className={`text-xs transition-colors ${showMocks ? "text-primary font-medium" : "text-muted-foreground hover:text-foreground"}`}>Mocks {mockCount > 0 && <span className="text-muted-foreground/60">({mockCount})</span>}</button>
          ) : (
            <span className="text-xs text-muted-foreground/50">Mocks —</span>
          )}
          <button onClick={() => setShowHistory(!showHistory)} className={`text-xs transition-colors ${showHistory ? "text-primary font-medium" : "text-muted-foreground hover:text-foreground"}`}>History {activeEntries.length > 0 && <span className="text-muted-foreground/60">({activeEntries.length})</span>}</button>
          {exportDocs.enabled ? (
            <Dialog open={showExport} onOpenChange={setShowExport}>
              <DialogTrigger asChild>
                <button className="text-xs text-muted-foreground hover:text-foreground transition-colors">Export</button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
                <DialogHeader>
                  <DialogTitle className="text-sm font-medium">Documentation Preview</DialogTitle>
                </DialogHeader>
                <div className="flex gap-2 mb-2">
                  <Button size="sm" className="h-7 text-xs" onClick={() => copyToClipboard(exportMarkdown)}>Copy to Clipboard</Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => downloadMarkdown(exportMarkdown, activeTab?.serverInfo?.name)}>Save Markdown</Button>
                </div>
                <ScrollArea className="flex-1">
                  <pre className="text-xs leading-relaxed font-mono bg-muted/30 p-4 rounded border">{exportMarkdown}</pre>
                </ScrollArea>
              </DialogContent>
            </Dialog>
          ) : (
            <span className="text-xs text-muted-foreground/50">Export —</span>
          )}
          <button
            type="button"
            onClick={() => setDarkMode((enabled) => !enabled)}
            className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            aria-label={`Switch to ${darkMode ? "light" : "dark"} mode`}
            aria-pressed={darkMode}
          >
            {darkMode ? "Light" : "Dark"}
          </button>
          <LicenseBadge />
        </div>
      </div>

      <ConnectionPanel />
      <Separator />

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden">
        <div className="w-72 border-r flex flex-col overflow-hidden bg-sidebar">
          <ErrorBoundary name="Explorer">
            <ToolExplorer />
          </ErrorBoundary>
        </div>
        <div className="flex-1 flex flex-col overflow-hidden bg-background">
          <ErrorBoundary name="Playground">
            <Playground key={activeTabId} />
          </ErrorBoundary>
        </div>
      </div>

      {/* Bottom panels */}
      {showLogs && (
        <>
          <Separator />
          <div className="h-56 border-t flex flex-col overflow-hidden">
            <ErrorBoundary name="Logs">
              <LogsPanel />
            </ErrorBoundary>
          </div>
        </>
      )}
      {showMocks && mockManager.enabled && (
        <>
          <Separator />
          <div className="h-56 border-t flex flex-col overflow-hidden">
            <ErrorBoundary name="Mock Manager">
              <MockManager />
            </ErrorBoundary>
          </div>
        </>
      )}
      {showHistory && (
        <>
          <Separator />
          <div className="h-56 border-t flex flex-col overflow-hidden">
            <ErrorBoundary name="History">
              <HistoryPanel />
            </ErrorBoundary>
          </div>
        </>
      )}
    </div>
  );
}

export default App;
