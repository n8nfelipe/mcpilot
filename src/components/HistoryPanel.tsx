import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useHistoryStore, type HistoryEntry } from "@/stores/history-store";
import { useTabsStore } from "@/stores/tabs-store";
import { useMockStore } from "@/stores/mock-store";
import { useFeature } from "@/lib/feature-gate";

function HistoryRow({ entry, onReplay, canReplay }: { entry: HistoryEntry; onReplay: (entry: HistoryEntry) => void; canReplay: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const { toggleReference } = useHistoryStore();
  const replayFeature = useFeature("replay-history");

  return (
    <div className="border rounded px-3 py-2 space-y-1.5 hover:bg-muted/20 transition-colors">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <button onClick={() => setExpanded(!expanded)} className="text-[10px] text-muted-foreground shrink-0">{expanded ? "▼" : "▶"}</button>
          <code className="text-xs font-medium truncate">{entry.tool_name}</code>
          <span className="text-[10px] text-muted-foreground/60 shrink-0">{entry.created_at}</span>
          {entry.is_reference && <Badge variant="outline" className="text-[9px] h-4 px-1">ref</Badge>}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button variant="ghost" size="sm" className="h-5 text-[10px] px-1.5" onClick={() => toggleReference(entry.id!)}>{entry.is_reference ? "Unref" : "Ref"}</Button>
          {replayFeature.enabled && (
            <Button variant="outline" size="sm" className="h-5 text-[10px] px-1.5" disabled={!canReplay} onClick={() => onReplay(entry)}>Replay</Button>
          )}
        </div>
      </div>
      {expanded && (
        <div className="grid grid-cols-2 gap-2 pt-1">
          <div>
            <p className="text-[9px] text-muted-foreground/60 uppercase tracking-wider mb-0.5">Request</p>
            <pre className="text-[10px] font-mono bg-muted/20 p-1.5 rounded border whitespace-pre-wrap overflow-auto max-h-32">{entry.arguments}</pre>
          </div>
          <div>
            <p className="text-[9px] text-muted-foreground/60 uppercase tracking-wider mb-0.5">Response</p>
            <pre className="text-[10px] font-mono bg-muted/20 p-1.5 rounded border whitespace-pre-wrap overflow-auto max-h-32">{entry.response}</pre>
          </div>
        </div>
      )}
    </div>
  );
}

export function HistoryPanel() {
  const { entries, clearByConnection } = useHistoryStore();
  const activeTabId = useTabsStore((s) => s.activeTabId);
  const activeTab = useTabsStore((s) => s.tabs.find((tab) => tab.id === s.activeTabId));
  const callToolOnTab = useTabsStore((s) => s.callToolOnTab);
  const mocks = useMockStore((s) => s.mocks);
  const activeEntries = entries.filter((entry) => entry.connection_id === activeTabId);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-1.5 border-b">
        <h2 className="text-xs font-semibold">History</h2>
        {activeEntries.length > 0 && <Button variant="ghost" size="sm" className="h-5 text-[10px] px-1.5" onClick={() => void clearByConnection(activeTabId)}>Clear</Button>}
      </div>
      <ScrollArea className="flex-1 px-3 py-2">
        <div className="space-y-1">
          {activeEntries.length === 0 && <p className="text-xs text-muted-foreground text-center py-6">No history yet</p>}
          {activeEntries.map((entry) => (
            <HistoryRow key={entry.id} entry={entry} canReplay={activeTab?.connectionStatus === "connected" || Object.values(mocks).some((mock) => mock.connectionId === activeTabId && mock.toolName === entry.tool_name && mock.active)} onReplay={async (e) => { try { await callToolOnTab(activeTabId, e.tool_name, JSON.parse(e.arguments)); } catch { return; } }} />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
