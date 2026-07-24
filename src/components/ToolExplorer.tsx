import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useTabsStore, type Tool, type Resource, type Prompt } from "@/stores/tabs-store";
import { useMockStore } from "@/stores/mock-store";
import { makeSnippet, copyToClipboard } from "@/lib/export-docs";

function ToolCard({ tool, connectionId }: { tool: Tool; connectionId: string }) {
  const hasMock = useMockStore((s) => s.hasActiveMock(connectionId, tool.name));
  const schema = tool.inputSchema as Record<string, unknown> | undefined;
  const props = schema?.properties as Record<string, Record<string, unknown>> | undefined;
  const required = (schema?.required as string[]) || [];

  const handleCopySnippet = () => {
    const params = props
      ? Object.fromEntries(Object.entries(props).map(([k, v]) => [k, v.example ?? v.default ?? ""]))
      : {};
    copyToClipboard(makeSnippet("tools/call", { name: tool.name, arguments: params }));
  };

  return (
    <div className="p-2.5 border rounded-md hover:border-primary/30 transition-colors cursor-default">
      <div className="flex items-center justify-between mb-1">
        <code className="text-[13px] font-medium">{tool.name}</code>
        <div className="flex items-center gap-1">
          {hasMock && <Badge className="text-[9px] h-4 bg-warning/20 text-warning border-warning/30">Mock</Badge>}
          <Button variant="ghost" size="sm" className="h-5 text-[9px] px-1 text-muted-foreground hover:text-foreground" onClick={handleCopySnippet}>copy</Button>
        </div>
      </div>
      {tool.description && (
        <p className="text-[11px] text-muted-foreground leading-relaxed mb-1.5 line-clamp-2">{tool.description}</p>
      )}
      {props && Object.keys(props).length > 0 && (
        <div className="space-y-0.5">
          {Object.entries(props).slice(0, 4).map(([key, prop]) => (
            <div key={key} className="flex items-center gap-2 text-[10px]">
              <span className="font-mono text-foreground/80 truncate">{key}</span>
              <span className="text-muted-foreground/60">{String(prop.type ?? "any")}</span>
              {required.includes(key) && <span className="text-destructive/70">*</span>}
            </div>
          ))}
          {Object.keys(props).length > 4 && (
            <span className="text-[10px] text-muted-foreground/50">+{Object.keys(props).length - 4} more</span>
          )}
        </div>
      )}
      {Boolean(tool.inputSchema || tool.outputSchema) && (
        <details className="mt-2">
          <summary className="text-[10px] text-muted-foreground cursor-pointer">Full schema</summary>
          <pre className="mt-1 max-h-52 overflow-auto rounded border bg-muted/20 p-2 text-[9px] leading-relaxed">{JSON.stringify({ inputSchema: tool.inputSchema, outputSchema: tool.outputSchema }, null, 2)}</pre>
        </details>
      )}
    </div>
  );
}

function ResourceCard({ resource, connectionId, connected }: { resource: Resource; connectionId: string; connected: boolean }) {
  const readResource = useTabsStore((s) => s.readResourceOnTab);
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleRead = async () => {
    setLoading(true);
    setError(null);
    try {
      setResult(await readResource(connectionId, resource.uri));
    } catch (readError) {
      setError(String(readError));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-2.5 border rounded-md">
      <div className="flex items-center justify-between gap-2 mb-0.5">
        <code className="text-[11px] font-mono text-foreground/80 truncate">{resource.uri}</code>
        <Button variant="ghost" size="sm" className="h-5 text-[9px] px-1" disabled={!connected || loading} onClick={handleRead}>{loading ? "reading" : "read"}</Button>
      </div>
      {resource.name && <p className="text-[11px] font-medium">{resource.name}</p>}
      {resource.description && <p className="text-[10px] text-muted-foreground mt-0.5">{resource.description}</p>}
      {resource.mimeType && <p className="text-[10px] text-muted-foreground/60 mt-0.5">{resource.mimeType}</p>}
      {error && <p className="mt-1 text-[10px] text-destructive">{error}</p>}
      {result !== null && <pre className="mt-1 max-h-40 overflow-auto rounded border bg-muted/20 p-2 text-[9px]">{JSON.stringify(result, null, 2)}</pre>}
    </div>
  );
}

function PromptCard({ prompt }: { prompt: Prompt }) {
  return (
    <div className="p-2.5 border rounded-md">
      <code className="text-[13px] font-medium">{prompt.name}</code>
      {prompt.description && <p className="text-[11px] text-muted-foreground mt-0.5">{prompt.description}</p>}
      {prompt.arguments && prompt.arguments.length > 0 && (
        <div className="mt-1.5 space-y-0.5">
          {prompt.arguments.map((arg) => (
            <div key={arg.name} className="flex items-center gap-2 text-[10px]">
              <span className="font-mono text-foreground/80">{arg.name}</span>
              {arg.required && <span className="text-destructive/70">*</span>}
              {arg.description && <span className="text-muted-foreground/60 truncate">{arg.description}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ToolExplorer() {
  const tabs = useTabsStore((s) => s.tabs);
  const activeTabId = useTabsStore((s) => s.activeTabId);
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const tools = activeTab?.tools ?? [];
  const resources = activeTab?.resources ?? [];
  const prompts = activeTab?.prompts ?? [];
  const connected = activeTab?.connectionStatus === "connected";

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b">
        <h2 className="text-xs font-semibold text-foreground/80">Explorer</h2>
      </div>
      <Tabs defaultValue="tools" className="flex-1 flex flex-col min-h-0">
        <div className="px-3 pt-2 pb-1">
          <TabsList className="h-7">
            <TabsTrigger value="tools" className="text-[11px] px-2.5 h-6">Tools ({tools.length})</TabsTrigger>
            <TabsTrigger value="resources" className="text-[11px] px-2.5 h-6">Resources ({resources.length})</TabsTrigger>
            <TabsTrigger value="prompts" className="text-[11px] px-2.5 h-6">Prompts ({prompts.length})</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="tools" className="flex-1 mt-0 min-h-0">
          <ScrollArea className="h-full px-3 pb-3">
            <div className="space-y-1.5">
              {tools.length === 0 && <p className="text-xs text-muted-foreground text-center py-8">No tools available</p>}
              {tools.map((tool) => (<ToolCard key={tool.name} tool={tool} connectionId={activeTabId} />))}
            </div>
          </ScrollArea>
        </TabsContent>
        <TabsContent value="resources" className="flex-1 mt-0 min-h-0">
          <ScrollArea className="h-full px-3 pb-3">
            <div className="space-y-1.5">
              {resources.length === 0 && <p className="text-xs text-muted-foreground text-center py-8">No resources available</p>}
              {resources.map((r) => (<ResourceCard key={r.uri} resource={r} connectionId={activeTabId} connected={connected} />))}
            </div>
          </ScrollArea>
        </TabsContent>
        <TabsContent value="prompts" className="flex-1 mt-0 min-h-0">
          <ScrollArea className="h-full px-3 pb-3">
            <div className="space-y-1.5">
              {prompts.length === 0 && <p className="text-xs text-muted-foreground text-center py-8">No prompts available</p>}
              {prompts.map((p) => (<PromptCard key={p.name} prompt={p} />))}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}
