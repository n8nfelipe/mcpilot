import { useState, useMemo } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useHistoryStore, type HistoryEntry } from "@/stores/history-store";
import { useTabsStore } from "@/stores/tabs-store";

function lineDiff(a: string, b: string): { type: "same" | "add" | "rem"; text: string }[] {
  const linesA = a.split("\n");
  const linesB = b.split("\n");
  const max = Math.max(linesA.length, linesB.length);
  const result: { type: "same" | "add" | "rem"; text: string }[] = [];
  for (let i = 0; i < max; i++) {
    if (i >= linesA.length) result.push({ type: "add", text: linesB[i] });
    else if (i >= linesB.length) result.push({ type: "rem", text: linesA[i] });
    else if (linesA[i] === linesB[i]) result.push({ type: "same", text: linesA[i] });
    else { result.push({ type: "rem", text: linesA[i] }); result.push({ type: "add", text: linesB[i] }); }
  }
  return result;
}

function LogRow({ entry, selected, onToggleSelect }: { entry: HistoryEntry; selected: boolean; onToggleSelect: (id: number) => void }) {
  return (
    <div className={`border rounded px-3 py-2 space-y-1.5 transition-colors ${selected ? "border-primary/40 bg-primary/5" : "hover:bg-muted/20"}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <input type="checkbox" checked={selected} onChange={() => onToggleSelect(entry.id!)} className="shrink-0 w-3 h-3" />
          <code className="text-xs font-medium truncate">{entry.tool_name}</code>
          <span className="text-[10px] text-muted-foreground/60 shrink-0">{entry.created_at}</span>
          <Badge variant={entry.status === "error" ? "destructive" : "outline"} className="text-[9px] h-4 px-1">{entry.status}</Badge>
          <span className="text-[10px] text-muted-foreground shrink-0">{entry.duration_ms} ms</span>
          {entry.is_mock && <Badge variant="secondary" className="text-[9px] h-4 px-1">Mock</Badge>}
          {entry.is_reference && <Badge variant="outline" className="text-[9px] h-4 px-1">ref</Badge>}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 pt-1">
        <div className="min-w-0">
          <p className="text-[9px] text-muted-foreground/60 uppercase tracking-wider mb-0.5">Request</p>
          <pre className="text-[10px] font-mono bg-muted/20 p-1.5 rounded border whitespace-pre-wrap overflow-auto max-h-32">{entry.request_json}</pre>
        </div>
        <div className="min-w-0">
          <p className="text-[9px] text-muted-foreground/60 uppercase tracking-wider mb-0.5">Response</p>
          <pre className="text-[10px] font-mono bg-muted/20 p-1.5 rounded border whitespace-pre-wrap overflow-auto max-h-32">{entry.response_json}</pre>
        </div>
      </div>
    </div>
  );
}

function DiffView({ a, b, onClose }: { a: HistoryEntry; b: HistoryEntry; onClose: () => void }) {
  const diff = useMemo(() => lineDiff(a.response_json, b.response_json), [a.response_json, b.response_json]);
  return (
    <div className="border rounded px-3 py-2 space-y-1.5 mb-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium">Diff: {a.tool_name}</h3>
        <Button variant="ghost" size="sm" className="h-5 text-[10px] px-1.5" onClick={onClose}>Close</Button>
      </div>
      <div className="flex gap-2 text-[10px] text-muted-foreground">
        <span className="text-red-500">- {a.created_at}</span>
        <span className="text-green-500">+ {b.created_at}</span>
      </div>
      <pre className="text-[10px] font-mono leading-relaxed max-h-40 overflow-auto">
        {diff.map((line, i) => (
          <div key={i} className={line.type === "add" ? "bg-green-900/10 text-green-600 dark:text-green-400" : line.type === "rem" ? "bg-red-900/10 text-red-600 dark:text-red-400" : ""}>
            {line.type === "add" ? "+ " : line.type === "rem" ? "- " : "  "}{line.text}
          </div>
        ))}
      </pre>
    </div>
  );
}

export function LogsPanel() {
  const entries = useHistoryStore((s) => s.entries);
  const activeTabId = useTabsStore((s) => s.activeTabId);
  const [search, setSearch] = useState("");
  const [filterTool, setFilterTool] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterLatency, setFilterLatency] = useState<string>("all");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [diffPair, setDiffPair] = useState<{ a: number; b: number } | null>(null);

  const activeEntries = useMemo(() => entries.filter((entry) => entry.connection_id === activeTabId), [entries, activeTabId]);
  const activeEntryIds = useMemo(() => new Set(activeEntries.map((entry) => entry.id)), [activeEntries]);
  const activeSelectedIds = useMemo(() => new Set(Array.from(selectedIds).filter((id) => activeEntryIds.has(id))), [selectedIds, activeEntryIds]);
  const toolNames = useMemo(() => Array.from(new Set(activeEntries.map((e) => e.tool_name))).sort(), [activeEntries]);

  const filtered = useMemo(() => activeEntries.filter((e) => {
    if (filterTool !== "all" && e.tool_name !== filterTool) return false;
    if (filterStatus !== "all" && e.status !== filterStatus) return false;
    if (filterLatency === "fast" && e.duration_ms >= 100) return false;
    if (filterLatency === "medium" && (e.duration_ms < 100 || e.duration_ms >= 1000)) return false;
    if (filterLatency === "slow" && e.duration_ms < 1000) return false;
    if (search) { const q = search.toLowerCase(); return e.tool_name.toLowerCase().includes(q) || e.request_json.toLowerCase().includes(q) || e.response_json.toLowerCase().includes(q) || (e.error?.toLowerCase().includes(q) ?? false); }
    return true;
  }), [activeEntries, filterTool, filterStatus, filterLatency, search]);

  const toggleSelect = (id: number) => setSelectedIds((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  const compare = () => {
    const ids = Array.from(activeSelectedIds);
    if (ids.length === 2) setDiffPair({ a: ids[0], b: ids[1] });
  };

  const diffA = diffPair ? activeEntries.find((e) => e.id === diffPair.a) : null;
  const diffB = diffPair ? activeEntries.find((e) => e.id === diffPair.b) : null;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-1.5 border-b">
        <h2 className="text-xs font-semibold">Logs</h2>
        {activeSelectedIds.size > 0 && (
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-muted-foreground">{activeSelectedIds.size} selected</span>
            {activeSelectedIds.size === 2 && <Button size="sm" className="h-5 text-[10px] px-1.5" onClick={compare}>Diff</Button>}
            <button className="text-[10px] text-muted-foreground hover:text-foreground" onClick={() => setSelectedIds(new Set())}>clear</button>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 px-3 py-1.5 border-b">
        <Input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="flex-1 h-7 text-[11px]" />
        <Select value={filterTool} onValueChange={setFilterTool}>
          <SelectTrigger className="w-28 h-7 text-[11px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">All tools</SelectItem>
            {toolNames.map((name) => (<SelectItem key={name} value={name} className="text-xs">{name}</SelectItem>))}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-24 h-7 text-[11px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">All status</SelectItem>
            <SelectItem value="success" className="text-xs">Success</SelectItem>
            <SelectItem value="error" className="text-xs">Error</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterLatency} onValueChange={setFilterLatency}>
          <SelectTrigger className="w-28 h-7 text-[11px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">All latency</SelectItem>
            <SelectItem value="fast" className="text-xs">Under 100 ms</SelectItem>
            <SelectItem value="medium" className="text-xs">100-999 ms</SelectItem>
            <SelectItem value="slow" className="text-xs">1000+ ms</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {diffA && diffB && <div className="px-3 pt-2"><DiffView a={diffA} b={diffB} onClose={() => setDiffPair(null)} /></div>}
      <ScrollArea className="flex-1 px-3 py-2">
        <div className="space-y-1">
          {filtered.length === 0 && <p className="text-xs text-muted-foreground text-center py-6">No log entries found</p>}
          {filtered.map((entry) => (<LogRow key={entry.id} entry={entry} selected={activeSelectedIds.has(entry.id!)} onToggleSelect={toggleSelect} />))}
        </div>
      </ScrollArea>
    </div>
  );
}
