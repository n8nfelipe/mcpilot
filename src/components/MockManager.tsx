import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useMockStore, type MockEntry } from "@/stores/mock-store";
import { useTabsStore } from "@/stores/tabs-store";

function MockRow({ entry }: { entry: MockEntry }) {
  const [expanded, setExpanded] = useState(false);
  const [editText, setEditText] = useState(JSON.stringify(entry.response, null, 2));
  const [editing, setEditing] = useState(false);
  const { toggleMock, deleteMock, updateMockResponse } = useMockStore();

  const handleSaveEdit = () => {
    try { updateMockResponse(entry.connectionId, entry.toolName, JSON.parse(editText)); setEditing(false); } catch {}
  };

  return (
    <div className="border rounded px-3 py-2 space-y-1.5 hover:bg-muted/20 transition-colors">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <button onClick={() => setExpanded(!expanded)} className="text-[10px] text-muted-foreground shrink-0">{expanded ? "▼" : "▶"}</button>
          <code className="text-xs font-medium truncate">{entry.toolName}</code>
          <Badge
            variant={entry.active ? "default" : "outline"}
            className="text-[9px] h-4 px-1 cursor-pointer"
            onClick={() => toggleMock(entry.connectionId, entry.toolName)}
          >
            {entry.active ? "on" : "off"}
          </Badge>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button variant="ghost" size="sm" className="h-5 text-[10px] px-1.5" onClick={() => { setEditing(!editing); setEditText(JSON.stringify(entry.response, null, 2)); }}>{editing ? "Cancel" : "Edit"}</Button>
          <Button variant="destructive" size="sm" className="h-5 text-[10px] px-1.5" onClick={() => deleteMock(entry.connectionId, entry.toolName)}>Delete</Button>
        </div>
      </div>
      {expanded && (
        <div className="pt-1">
          {editing ? (
            <div className="space-y-1.5">
              <Textarea value={editText} onChange={(e) => setEditText(e.target.value)} className="font-mono text-[10px] min-h-[60px]" />
              <Button size="sm" className="h-5 text-[10px] px-2" onClick={handleSaveEdit}>Save</Button>
            </div>
          ) : (
            <pre className="text-[10px] font-mono bg-muted/20 p-1.5 rounded border whitespace-pre-wrap overflow-auto max-h-32">{JSON.stringify(entry.response, null, 2)}</pre>
          )}
        </div>
      )}
    </div>
  );
}

export function MockManager() {
  const { mocks, exportMocks, importMocks } = useMockStore();
  const activeTabId = useTabsStore((s) => s.activeTabId);
  const activeTab = useTabsStore((s) => s.tabs.find((tab) => tab.id === s.activeTabId));
  const entries = Object.values(mocks).filter((entry) => entry.connectionId === activeTabId);
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState<string | null>(null);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-1.5 border-b">
        <h2 className="text-xs font-semibold">Mock Manager <span className="font-normal text-muted-foreground">{activeTab?.name}</span></h2>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" className="h-5 text-[10px] px-1.5" onClick={() => { const json = exportMocks(); navigator.clipboard.writeText(json); }}>Export</Button>
          <Button variant="outline" size="sm" className="h-5 text-[10px] px-1.5" onClick={() => setImportText("Paste JSON...")}>Import</Button>
        </div>
      </div>
      <ScrollArea className="flex-1 px-3 py-2">
        {entries.length === 0 && !importText && <p className="text-xs text-muted-foreground text-center py-6">No mocks saved</p>}
        {importText && (
          <div className="space-y-1.5 mb-3">
            <Textarea value={importText} onChange={(e) => setImportText(e.target.value)} className="font-mono text-[10px] min-h-[60px]" />
            <div className="flex items-center gap-1.5">
              <Button size="sm" className="h-5 text-[10px] px-2" onClick={() => { try { importMocks(importText); setImportText(""); setImportError(null); } catch (e) { setImportError(String(e)); } }}>Import</Button>
              <Button size="sm" variant="ghost" className="h-5 text-[10px] px-1.5" onClick={() => { setImportText(""); setImportError(null); }}>Cancel</Button>
            </div>
            {importError && <p className="text-[10px] text-destructive">{importError}</p>}
          </div>
        )}
        <div className="space-y-1">
          {entries.map((entry) => (<MockRow key={`${entry.connectionId}:${entry.toolName}`} entry={entry} />))}
        </div>
      </ScrollArea>
    </div>
  );
}
