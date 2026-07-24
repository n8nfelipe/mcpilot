import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useMockStore, type MockEntry } from "@/stores/mock-store";

function MockRow({ entry }: { entry: MockEntry }) {
  const [expanded, setExpanded] = useState(false);
  const [editText, setEditText] = useState(JSON.stringify(entry.response, null, 2));
  const [editing, setEditing] = useState(false);
  const { toggleMock, deleteMock, updateMockResponse } = useMockStore();

  const handleSaveEdit = () => {
    try {
      const parsed = JSON.parse(editText);
      updateMockResponse(entry.toolName, parsed);
      setEditing(false);
    } catch {
      // invalid JSON — let user fix
    }
  };

  return (
    <div className="border rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <code className="text-sm font-medium truncate">{entry.toolName}</code>
          <Badge
            variant={entry.active ? "default" : "outline"}
            className="text-[10px] h-5 cursor-pointer"
            onClick={() => toggleMock(entry.toolName)}
          >
            {entry.active ? "active" : "inactive"}
          </Badge>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs"
            onClick={() => {
              setEditing(!editing);
              setEditText(JSON.stringify(entry.response, null, 2));
            }}
          >
            {editing ? "Cancel" : "Edit"}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            className="h-6 text-xs"
            onClick={() => deleteMock(entry.toolName)}
          >
            Delete
          </Button>
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
          {editing ? (
            <div className="space-y-2">
              <Textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                className="font-mono text-xs min-h-[100px]"
              />
              <Button size="sm" className="h-6 text-xs" onClick={handleSaveEdit}>
                Save
              </Button>
            </div>
          ) : (
            <pre className="text-xs whitespace-pre-wrap font-mono bg-muted/50 p-2 rounded border max-h-48 overflow-auto">
              {JSON.stringify(entry.response, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

export function MockManager() {
  const { mocks, exportMocks, importMocks } = useMockStore();
  const entries = Object.values(mocks);
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState<string | null>(null);

  const handleExport = () => {
    const json = exportMocks();
    navigator.clipboard.writeText(json);
  };

  const handleImport = () => {
    try {
      importMocks(importText);
      setImportText("");
      setImportError(null);
    } catch (e) {
      setImportError(String(e));
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b">
        <h2 className="text-sm font-semibold">Mock Manager</h2>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" className="h-6 text-xs" onClick={handleExport}>
            Export
          </Button>
          <Button variant="outline" size="sm" className="h-6 text-xs" onClick={() => setImportText("Paste JSON here...")}>
            Import
          </Button>
        </div>
      </div>
      <ScrollArea className="flex-1 p-4 pt-2">
        {entries.length === 0 && !importText && (
          <p className="text-sm text-muted-foreground text-center py-8">
            No mocks saved. Call a tool and use "Save as Mock" in the Playground.
          </p>
        )}
        {importText && (
          <div className="space-y-2 mb-4">
            <label className="text-xs text-muted-foreground">Import Mock JSON</label>
            <Textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              className="font-mono text-xs min-h-[80px]"
            />
            <div className="flex items-center gap-2">
              <Button size="sm" className="h-6 text-xs" onClick={handleImport}>
                Import
              </Button>
              <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => { setImportText(""); setImportError(null); }}>
                Cancel
              </Button>
            </div>
            {importError && (
              <p className="text-xs text-destructive">{importError}</p>
            )}
          </div>
        )}
        <div className="space-y-2">
          {entries.map((entry) => (
            <MockRow key={entry.toolName} entry={entry} />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
