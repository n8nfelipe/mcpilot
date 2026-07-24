import { useState, useCallback } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
    try { return JSON.stringify(JSON.parse(text), null, 2); } catch { return text; }
  }

  return (
    <div className="space-y-2">
      {textItems.map((item: unknown, i: number) => {
        const text = (item as Record<string, string>).text;
        return (
          <pre key={i} className="text-xs leading-relaxed font-mono bg-muted/20 p-3 rounded border whitespace-pre-wrap overflow-auto max-h-64">
            {formatText(text)}
          </pre>
        );
      })}
      <details className="group">
        <summary className="text-[10px] text-muted-foreground cursor-pointer hover:text-foreground">Raw JSON</summary>
        <pre className="text-[10px] leading-relaxed font-mono bg-muted/20 p-2 rounded border mt-1 overflow-auto max-h-48">
          {JSON.stringify(data, null, 2)}
        </pre>
      </details>
    </div>
  );
}

function makeTemplate(schema: Record<string, unknown>): Record<string, unknown> {
  const props = schema.properties as Record<string, Record<string, unknown>> | undefined;
  if (!props) return {};
  const result: Record<string, unknown> = {};
  for (const [key, prop] of Object.entries(props)) {
    if (prop.default !== undefined) result[key] = prop.default;
    else if (prop.type === "string") result[key] = "";
    else if (prop.type === "number" || prop.type === "integer") result[key] = 0;
    else if (prop.type === "boolean") result[key] = false;
    else if (prop.type === "array") result[key] = [];
    else if (prop.type === "object") result[key] = {};
    else result[key] = null;
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
  const hasActiveMock = useMockStore((s) => activeTabId !== "" && selectedTool !== "" && s.hasActiveMock(activeTabId, selectedTool));
  const canCall = connectionStatus === "connected" || hasActiveMock;

  const handleToolChange = useCallback((name: string) => {
    setSelectedTool(name);
    setResponse(null);
    setError(null);
    const tool = tools.find((t) => t.name === name);
    if (tool?.inputSchema) {
      setArgsText(JSON.stringify(makeTemplate(tool.inputSchema as Record<string, unknown>), null, 2));
    } else {
      setArgsText("{}");
    }
  }, [tools]);

  const handleCall = async () => {
    if (!selectedTool || !activeTabId) return;
    setIsLoading(true);
    setError(null);
    setResponse(null);
    const startedAt = performance.now();
    const requestId = crypto.randomUUID();
    const isMock = useMockStore.getState().hasActiveMock(activeTabId, selectedTool);
    let args: unknown;
    let callCompleted = false;
    try {
      args = JSON.parse(argsText);
      const requestJson = JSON.stringify({ jsonrpc: "2.0", id: requestId, method: "tools/call", params: { name: selectedTool, arguments: args } });
      const result = await callToolOnTab(activeTabId, selectedTool, args as Record<string, unknown>);
      callCompleted = true;
      setResponse(result);
      await saveHistory({
        tool_name: selectedTool,
        arguments: JSON.stringify(args),
        response: JSON.stringify(result),
        server_name: serverInfo?.name || "unknown",
        connection_id: activeTabId,
        status: "success",
        duration_ms: Math.round(performance.now() - startedAt),
        error: null,
        is_mock: isMock,
        request_json: requestJson,
        response_json: JSON.stringify({ jsonrpc: "2.0", id: requestId, result }),
      });
    } catch (e) {
      const primaryError = String(e);
      if (callCompleted) {
        setError(`History persistence failed: ${primaryError}`);
        return;
      }
      const requestArgs = args ?? argsText;
      const requestJson = JSON.stringify({ jsonrpc: "2.0", id: requestId, method: "tools/call", params: { name: selectedTool, arguments: requestArgs } });
      const responseJson = JSON.stringify({ jsonrpc: "2.0", id: requestId, error: { message: primaryError } });
      try {
        await saveHistory({
          tool_name: selectedTool,
          arguments: typeof requestArgs === "string" ? requestArgs : JSON.stringify(requestArgs),
          response: responseJson,
          server_name: serverInfo?.name || "unknown",
          connection_id: activeTabId,
          status: "error",
          duration_ms: Math.round(performance.now() - startedAt),
          error: primaryError,
          is_mock: isMock,
          request_json: requestJson,
          response_json: responseJson,
        });
        setError(primaryError);
      } catch (persistenceError) {
        setError(`${primaryError}\nHistory persistence failed: ${String(persistenceError)}`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-2 border-b flex items-center gap-3">
        <h2 className="text-xs font-semibold text-foreground/80">Playground</h2>
        <div className="flex items-center gap-2 flex-1">
          <Select value={selectedTool} onValueChange={handleToolChange} disabled={tools.length === 0}>
            <SelectTrigger className="h-7 text-xs max-w-48">
              <SelectValue placeholder="Select a tool..." />
            </SelectTrigger>
            <SelectContent>
              {tools.map((t) => (<SelectItem key={t.name} value={t.name} className="text-xs">{t.name}</SelectItem>))}
            </SelectContent>
          </Select>
          <Button size="sm" className="h-7 text-xs px-3" onClick={handleCall} disabled={!selectedTool || isLoading || !canCall}>
            {isLoading ? "Calling..." : "Call"}
          </Button>
          {response !== null && mockManager.enabled && (
            <Button variant="outline" size="sm" className="h-7 text-xs px-2" onClick={() => useMockStore.getState().saveMock(activeTabId, selectedTool, response)}>
              Save Mock
            </Button>
          )}
        </div>
      </div>
      <div className="flex-1 flex min-h-0 divide-x">
        <div className="flex-1 flex flex-col min-h-0">
          <div className="px-4 py-2 border-b">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Arguments</span>
          </div>
          <Textarea value={argsText} onChange={(e) => setArgsText(e.target.value)} className="flex-1 border-0 rounded-none font-mono text-xs p-4 resize-none focus-visible:ring-0" placeholder='{"key": "value"}' />
        </div>
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="px-4 py-2 border-b">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Response</span>
          </div>
          <ScrollArea className="flex-1 p-4 pt-3">
            {error ? (
              <div className="text-xs text-destructive bg-destructive/5 p-2 rounded border border-destructive/20 whitespace-pre-wrap font-mono">{error}</div>
            ) : response ? (
              <ResponseView data={response} />
            ) : (
              <p className="text-xs text-muted-foreground/60 text-center pt-8">Select a tool and call it to see the response</p>
            )}
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}
