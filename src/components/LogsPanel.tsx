import { useState, useMemo } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useHistoryStore, type HistoryEntry } from "@/stores/history-store";

function lineDiff(a: string, b: string): { type: "same" | "add" | "rem"; text: string }[] {
  const linesA = a.split("\n");
  const linesB = b.split("\n");
  const max = Math.max(linesA.length, linesB.length);
  const result: { type: "same" | "add" | "rem"; text: string }[] = [];
  for (let i = 0; i < max; i++) {
    if (i >= linesA.length) {
      result.push({ type: "add", text: linesB[i] });
    } else if (i >= linesB.length) {
      result.push({ type: "rem", text: linesA[i] });
    } else if (linesA[i] === linesB[i]) {
      result.push({ type: "same", text: linesA[i] });
    } else {
      result.push({ type: "rem", text: linesA[i] });
      result.push({ type: "add", text: linesB[i] });
    }
  }
  return result;
}

function LogRow({
  entry,
  selected,
  onToggleSelect,
  onCompare,
}: {
  entry: HistoryEntry;
  selected: boolean;
  onToggleSelect: (id: number) => void;
  onCompare: (id: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect(entry.id!)}
            className="shrink-0"
          />
          <code className="text-sm font-medium truncate">{entry.tool_name}</code>
          <span className="text-xs text-muted-foreground shrink-0">
            {entry.created_at}
          </span>
          {entry.is_reference && (
            <Badge variant="outline" className="text-[10px] h-5">ref</Badge>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {selected && (
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-xs"
              onClick={() => onCompare(entry.id!)}
            >
              Diff
            </Button>
          )}
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-muted-foreground hover:text-foreground px-1"
          >
            {expanded ? "▲" : "▼"}
          </button>
        </div>
      </div>
      {expanded && (
        <div className="grid grid-cols-2 gap-2 pt-1">
          <div>
            <p className="text-[10px] text-muted-foreground uppercase mb-1">Request</p>
            <pre className="text-xs whitespace-pre-wrap font-mono bg-muted/50 p-2 rounded border max-h-48 overflow-auto">
              {entry.arguments}
            </pre>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase mb-1">Response</p>
            <pre className="text-xs whitespace-pre-wrap font-mono bg-muted/50 p-2 rounded border max-h-48 overflow-auto">
              {entry.response}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

function DiffView({ a, b, onClose }: { a: HistoryEntry; b: HistoryEntry; onClose: () => void }) {
  const diff = useMemo(() => lineDiff(a.response, b.response), [a.response, b.response]);

  return (
    <div className="border rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Diff: {a.tool_name}</h3>
        <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={onClose}>
          Close
        </Button>
      </div>
      <div className="flex gap-2 text-xs text-muted-foreground">
        <span className="text-red-500">- {a.created_at}</span>
        <span className="text-green-500">+ {b.created_at}</span>
      </div>
      <ScrollArea className="max-h-64">
        <pre className="text-xs font-mono leading-relaxed">
          {diff.map((line, i) => (
            <div
              key={i}
              className={
                line.type === "add"
                  ? "bg-green-900/20 text-green-400"
                  : line.type === "rem"
                  ? "bg-red-900/20 text-red-400"
                  : ""
              }
            >
              {line.type === "add" ? "+ " : line.type === "rem" ? "- " : "  "}
              {line.text}
            </div>
          ))}
        </pre>
      </ScrollArea>
    </div>
  );
}

export function LogsPanel() {
  const entries = useHistoryStore((s) => s.entries);
  const [search, setSearch] = useState("");
  const [filterTool, setFilterTool] = useState<string>("all");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [diffPair, setDiffPair] = useState<{ a: number; b: number } | null>(null);

  const toolNames = useMemo(() => {
    const names = new Set(entries.map((e) => e.tool_name));
    return Array.from(names).sort();
  }, [entries]);

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (filterTool !== "all" && e.tool_name !== filterTool) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          e.tool_name.toLowerCase().includes(q) ||
          e.arguments.toLowerCase().includes(q) ||
          e.response.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [entries, filterTool, search]);

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCompare = (id: number) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 2) {
      const [a, b] = ids[0] === id ? [ids[1], ids[0]] : [ids[0], ids[1]];
      setDiffPair({ a, b });
    }
  };

  const diffA = diffPair ? entries.find((e) => e.id === diffPair.a) : null;
  const diffB = diffPair ? entries.find((e) => e.id === diffPair.b) : null;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b">
        <h2 className="text-sm font-semibold">Logs</h2>
        {selectedIds.size > 0 && (
          <span className="text-xs text-muted-foreground">
            {selectedIds.size} selected
            <button
              className="ml-2 text-muted-foreground hover:text-foreground"
              onClick={() => setSelectedIds(new Set())}
            >
              clear
            </button>
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 px-4 py-2 border-b">
        <Input
          placeholder="Search logs..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 h-7 text-xs"
        />
        <Select value={filterTool} onValueChange={setFilterTool}>
          <SelectTrigger className="w-32 h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All tools</SelectItem>
            {toolNames.map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {diffA && diffB && (
        <div className="px-4 py-2 border-b">
          <DiffView a={diffA} b={diffB} onClose={() => setDiffPair(null)} />
        </div>
      )}
      <ScrollArea className="flex-1 p-4 pt-2">
        <div className="space-y-2">
          {filtered.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              No log entries found.
            </p>
          )}
          {filtered.map((entry) => (
            <LogRow
              key={entry.id}
              entry={entry}
              selected={selectedIds.has(entry.id!)}
              onToggleSelect={toggleSelect}
              onCompare={handleCompare}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
