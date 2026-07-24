import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useHistoryStore, type HistoryEntry } from "@/stores/history-store";
import { useTabsStore } from "@/stores/tabs-store";
import { useFeature } from "@/lib/feature-gate";

function HistoryRow({
  entry,
  onReplay,
}: {
  entry: HistoryEntry;
  onReplay: (entry: HistoryEntry) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { toggleReference } = useHistoryStore();
  const replayFeature = useFeature("replay-history");

  return (
    <div className="border rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <code className="text-sm font-medium truncate">{entry.tool_name}</code>
          <span className="text-xs text-muted-foreground shrink-0">
            {entry.created_at}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {entry.is_reference ? (
            <Badge variant="outline" className="text-[10px] h-5">ref</Badge>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs"
            onClick={() => toggleReference(entry.id!)}
          >
            {entry.is_reference ? "Unmark" : "Mark ref"}
          </Button>
          {replayFeature.enabled ? (
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-xs"
              onClick={() => onReplay(entry)}
            >
              Replay
            </Button>
          ) : null}
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-muted-foreground hover:text-foreground px-1"
          >
            {expanded ? "▲" : "▼"}
          </button>
        </div>
      </div>
      {expanded && (
        <div className="space-y-2 pt-1">
          <div>
            <p className="text-[10px] text-muted-foreground uppercase mb-1">Arguments</p>
            <pre className="text-xs whitespace-pre-wrap font-mono bg-muted/50 p-2 rounded border">
              {entry.arguments}
            </pre>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase mb-1">Response</p>
            <pre className="text-xs whitespace-pre-wrap font-mono bg-muted/50 p-2 rounded border">
              {entry.response}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

export function HistoryPanel() {
  const { entries, clear } = useHistoryStore();
  const activeTabId = useTabsStore((s) => s.activeTabId);
  const callToolOnTab = useTabsStore((s) => s.callToolOnTab);

  const handleReplay = async (entry: HistoryEntry) => {
    try {
      await callToolOnTab(activeTabId, entry.tool_name, JSON.parse(entry.arguments));
    } catch {
      // error handled by store
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b">
        <h2 className="text-sm font-semibold">History</h2>
        {entries.length > 0 && (
          <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={clear}>
            Clear
          </Button>
        )}
      </div>
      <ScrollArea className="flex-1 p-4 pt-2">
        <div className="space-y-2">
          {entries.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              No history yet. Call a tool to see it here.
            </p>
          )}
          {entries.map((entry) => (
            <HistoryRow
              key={entry.id}
              entry={entry}
              onReplay={handleReplay}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
