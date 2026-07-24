import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useTabsStore, type Tool, type Resource, type Prompt } from "@/stores/tabs-store";
import { useMockStore } from "@/stores/mock-store";
import { makeSnippet, copyToClipboard } from "@/lib/export-docs";

function ToolCard({ tool }: { tool: Tool }) {
  const hasMock = useMockStore((s) => s.hasActiveMock(tool.name));
  const inputSchema = tool.inputSchema as Record<string, unknown> | undefined;
  const properties = inputSchema?.properties as Record<string, Record<string, unknown>> | undefined;

  const handleCopySnippet = () => {
    const params = inputSchema?.properties
      ? Object.fromEntries(
          Object.entries(inputSchema.properties as Record<string, Record<string, unknown>>).map(
            ([k, v]) => [k, v.example ?? v.default ?? ""]
          )
        )
      : {};
    const snippet = makeSnippet("tools/call", { name: tool.name, arguments: params });
    copyToClipboard(snippet);
  };

  return (
    <div className="p-3 border rounded-lg space-y-2">
      <div className="flex items-center justify-between">
        <code className="text-sm font-medium">{tool.name}</code>
        <div className="flex items-center gap-1">
          {hasMock && <Badge className="text-[10px] h-5">Mock</Badge>}
          <Button variant="ghost" size="sm" className="h-5 text-[10px] px-1" onClick={handleCopySnippet}>
            copy
          </Button>
          <Badge variant="secondary">tool</Badge>
        </div>
      </div>
      {tool.description && (
        <p className="text-sm text-muted-foreground">{tool.description}</p>
      )}
      {properties && Object.keys(properties).length > 0 && (
        <div className="text-xs text-muted-foreground space-y-1">
          {Object.entries(properties).map(([key, prop]) => (
            <div key={key} className="flex gap-2">
              <span className="font-mono">{key}</span>
              <span className="text-muted-foreground">
                {String(prop.type ?? "any")}
              </span>
              {prop.required ? (
                <span className="text-destructive">required</span>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ResourceCard({ resource }: { resource: Resource }) {
  return (
    <div className="p-3 border rounded-lg space-y-1">
      <div className="flex items-center justify-between">
        <code className="text-sm font-medium">{resource.name || resource.uri}</code>
        <Badge variant="secondary">resource</Badge>
      </div>
      {resource.description && (
        <p className="text-sm text-muted-foreground">{resource.description}</p>
      )}
      {resource.mimeType && (
        <p className="text-xs text-muted-foreground">{resource.mimeType}</p>
      )}
    </div>
  );
}

function PromptCard({ prompt }: { prompt: Prompt }) {
  return (
    <div className="p-3 border rounded-lg space-y-1">
      <div className="flex items-center justify-between">
        <code className="text-sm font-medium">{prompt.name}</code>
        <Badge variant="secondary">prompt</Badge>
      </div>
      {prompt.description && (
        <p className="text-sm text-muted-foreground">{prompt.description}</p>
      )}
      {prompt.arguments && prompt.arguments.length > 0 && (
        <div className="text-xs text-muted-foreground space-y-1 pt-1">
          {prompt.arguments.map((arg) => (
            <div key={arg.name} className="flex gap-2">
              <span className="font-mono">{arg.name}</span>
              {arg.required && <span className="text-destructive">required</span>}
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

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="p-4 pb-2">
        <h2 className="text-lg font-semibold">Explorer</h2>
      </div>
      <Tabs defaultValue="tools" className="flex-1 flex flex-col min-h-0">
        <div className="px-4 pb-2">
          <TabsList>
            <TabsTrigger value="tools">
              Tools ({tools.length})
            </TabsTrigger>
            <TabsTrigger value="resources">
              Resources ({resources.length})
            </TabsTrigger>
            <TabsTrigger value="prompts">
              Prompts ({prompts.length})
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="tools" className="flex-1 mt-0 min-h-0">
          <ScrollArea className="h-full p-4 pt-0 overflow-auto">
            <div className="space-y-2">
              {tools.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No tools available
                </p>
              )}
              {tools.map((tool) => (
                <ToolCard key={tool.name} tool={tool} />
              ))}
            </div>
          </ScrollArea>
        </TabsContent>
        <TabsContent value="resources" className="flex-1 mt-0 min-h-0">
          <ScrollArea className="h-full p-4 pt-0 overflow-auto">
            <div className="space-y-2">
              {resources.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No resources available
                </p>
              )}
              {resources.map((r) => (
                <ResourceCard key={r.uri} resource={r} />
              ))}
            </div>
          </ScrollArea>
        </TabsContent>
        <TabsContent value="prompts" className="flex-1 mt-0 min-h-0">
          <ScrollArea className="h-full p-4 pt-0 overflow-auto">
            <div className="space-y-2">
              {prompts.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No prompts available
                </p>
              )}
              {prompts.map((p) => (
                <PromptCard key={p.name} prompt={p} />
              ))}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}
