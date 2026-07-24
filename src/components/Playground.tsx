import { useState, useCallback } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTabsStore } from "@/stores/tabs-store";
import { useHistoryStore } from "@/stores/history-store";
import { useMockStore } from "@/stores/mock-store";
import { useFeature } from "@/lib/feature-gate";

function ResponseView({ data }: { data: unknown }) {
  const content = (data as Record<string, unknown>)?.content;
  const textItems = Array.isArray(content)
    ? content.filter((c: unknown) => (c as Record<string, unknown>)?.type === "text")
    : [];

  function formatText(text: string) {
    try {
      const parsed = JSON.parse(text);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return text;
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Response</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {textItems.map((item: unknown, i: number) => {
          const text = (item as Record<string, string>).text;
          const formatted = formatText(text);
          return (
            <pre
              key={i}
              className="text-sm whitespace-pre-wrap font-mono bg-muted/50 p-3 rounded border"
            >
              {formatted}
            </pre>
          );
        })}
        <div>
          <p className="text-xs text-muted-foreground mb-1">Raw JSON</p>
          <pre className="text-xs whitespace-pre-wrap font-mono bg-muted/50 p-3 rounded border">
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      </CardContent>
    </Card>
  );
}

function makeTemplate(schema: Record<string, unknown>): Record<string, unknown> {
  const props = schema.properties as Record<string, Record<string, unknown>> | undefined;
  if (!props) return {};
  const result: Record<string, unknown> = {};
  for (const [key, prop] of Object.entries(props)) {
    if (prop.default !== undefined) {
      result[key] = prop.default;
    } else if (prop.type === "string") {
      result[key] = "";
    } else if (prop.type === "number" || prop.type === "integer") {
      result[key] = 0;
    } else if (prop.type === "boolean") {
      result[key] = false;
    } else if (prop.type === "array") {
      result[key] = [];
    } else if (prop.type === "object") {
      result[key] = {};
    } else {
      result[key] = null;
    }
  }
  return result;
}

export function Playground() {
  const tabs = useTabsStore((s) => s.tabs);
  const activeTabId = useTabsStore((s) => s.activeTabId);
  const callToolOnTab = useTabsStore((s) => s.callToolOnTab);
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const tools = activeTab?.tools ?? [];
  const connectionStatus = activeTab?.connectionStatus ?? "disconnected";
  const serverInfo = activeTab?.serverInfo ?? null;
  const mockManager = useFeature("mock-manager");

  const saveHistory = useHistoryStore((s) => s.save);
  const [selectedTool, setSelectedTool] = useState("");
  const [argsText, setArgsText] = useState("{}");
  const [response, setResponse] = useState<unknown>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = tools.find((t) => t.name === selectedTool);

  const handleToolChange = useCallback((name: string) => {
    setSelectedTool(name);
    setResponse(null);
    setError(null);
    const tool = tools.find((t) => t.name === name);
    if (tool?.inputSchema) {
      const template = makeTemplate(tool.inputSchema as Record<string, unknown>);
      setArgsText(JSON.stringify(template, null, 2));
    } else {
      setArgsText("{}");
    }
  }, [tools]);

  const handleCall = async () => {
    if (!selectedTool || !activeTabId) return;
    setIsLoading(true);
    setError(null);
    setResponse(null);
    try {
      const args = JSON.parse(argsText);
      const result = await callToolOnTab(activeTabId, selectedTool, args);
      setResponse(result);
      saveHistory({
        tool_name: selectedTool,
        arguments: JSON.stringify(args),
        response: JSON.stringify(result),
        server_name: serverInfo?.name || "unknown",
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="p-4 pb-2">
        <h2 className="text-lg font-semibold">Playground</h2>
      </div>
      <ScrollArea className="flex-1 min-h-0 p-4 pt-0 overflow-auto">
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Tool</label>
            <Select
              value={selectedTool}
              onValueChange={handleToolChange}
              disabled={connectionStatus !== "connected"}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a tool..." />
              </SelectTrigger>
              <SelectContent>
                {tools.map((t) => (
                  <SelectItem key={t.name} value={t.name}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selected?.inputSchema ? (
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Input Schema</label>
              <div className="text-xs text-muted-foreground p-2 bg-muted rounded font-mono whitespace-pre-wrap">
                {JSON.stringify(selected.inputSchema, null, 2)}
              </div>
            </div>
          ) : null}

          <div className="space-y-2">
            <label className="text-sm font-medium">Arguments (JSON)</label>
            <Textarea
              value={argsText}
              onChange={(e) => setArgsText(e.target.value)}
              className="font-mono text-sm min-h-[120px]"
              placeholder='{"key": "value"}'
            />
          </div>

          <Button
            onClick={handleCall}
            disabled={!selectedTool || isLoading || connectionStatus !== "connected"}
          >
            {isLoading ? "Calling..." : "Call Tool"}
          </Button>

          {error ? (
            <Card className="border-destructive">
              <CardHeader>
                <CardTitle className="text-sm text-destructive">Error</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="text-xs whitespace-pre-wrap font-mono bg-muted/50 p-3 rounded border">
                  {error}
                </pre>
              </CardContent>
            </Card>
          ) : null}

          {response ? (
            <div className="space-y-2">
              <ResponseView data={response} />
              {mockManager.enabled ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => useMockStore.getState().saveMock(selectedTool, response)}
                >
                  Save as Mock
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Save as Mock — Pro feature
                </p>
              )}
            </div>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  );
}
