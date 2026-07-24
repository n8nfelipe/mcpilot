import type { Tab } from "@/stores/tabs-store";
import type { HistoryEntry } from "@/stores/history-store";

function schemaTable(schema: Record<string, unknown> | undefined): string {
  if (!schema) return "";
  const props = schema.properties as Record<string, Record<string, unknown>> | undefined;
  if (!props || Object.keys(props).length === 0) return "";
  const rows = Object.entries(props).map(([key, prop]) => {
    const type = String(prop.type ?? "any");
    const required = (schema.required as string[] | undefined)?.includes(key) ? " ✓" : "";
    const desc = prop.description ? ` — ${prop.description}` : "";
    return `| \`${key}\` | ${type}${required}${desc} |`;
  });
  return ["| Parameter | Type |", "|-----------|------|", ...rows].join("\n");
}

function snippetBlock(lang: string, code: string): string {
  return "```" + lang + "\n" + code + "\n```";
}

export function generateDocs(activeTab: Tab, history: HistoryEntry[]): string {
  const lines: string[] = [];
  const activeHistory = history.filter((entry) => entry.connection_id === activeTab.id);
  const serverName = activeTab.serverInfo?.name || "MCP Server";
  const serverVer = activeTab.serverInfo?.version || "";
  const title = serverVer ? `${serverName} v${serverVer}` : serverName;

  lines.push(`# ${title}`);
  lines.push("");
  lines.push(`> Auto-generated documentation from MCPilot.`);
  lines.push("");
  lines.push("## Tools");
  lines.push("");

  if (activeTab.tools.length === 0) {
    lines.push("_No tools available._");
    lines.push("");
  } else {
    for (const tool of activeTab.tools) {
      const schema = tool.inputSchema as Record<string, unknown> | undefined;
      lines.push(`### ${tool.name}`);
      if (tool.description) {
        lines.push("");
        lines.push(tool.description);
      }
      lines.push("");
      const table = schemaTable(schema);
      if (table) {
        lines.push(table);
        lines.push("");
      }
      lines.push("**Example request:**");
      lines.push("");
      const exampleArgs = schema?.properties
        ? Object.fromEntries(
            Object.entries(schema.properties as Record<string, Record<string, unknown>>).map(
              ([k, v]) => [k, v.example ?? v.default ?? ""]
            )
          )
        : {};
      lines.push(
        snippetBlock("json", JSON.stringify({ method: "tools/call", params: { name: tool.name, arguments: exampleArgs } }, null, 2))
      );
      lines.push("");

      const toolHistory = activeHistory.filter((h) => h.tool_name === tool.name).slice(0, 3);
      if (toolHistory.length > 0) {
        lines.push("**Example response:**");
        lines.push("");
        lines.push(snippetBlock("json", toolHistory[0].response));
        lines.push("");
      }
    }
  }

  lines.push("## Resources");
  lines.push("");
  if (activeTab.resources.length === 0) {
    lines.push("_No resources available._");
    lines.push("");
  } else {
    for (const res of activeTab.resources) {
      lines.push(`### \`${res.uri}\``);
      if (res.name) lines.push(`**Name:** ${res.name}`);
      if (res.description) lines.push(`_${res.description}_`);
      if (res.mimeType) lines.push(`**MIME:** \`${res.mimeType}\``);
      lines.push("");
    }
  }

  lines.push("## Prompts");
  lines.push("");
  if (activeTab.prompts.length === 0) {
    lines.push("_No prompts available._");
    lines.push("");
  } else {
    for (const prompt of activeTab.prompts) {
      lines.push(`### ${prompt.name}`);
      if (prompt.description) {
        lines.push(`_${prompt.description}_`);
      }
      lines.push("");
      if (prompt.arguments && prompt.arguments.length > 0) {
        lines.push("| Argument | Required | Description |");
        lines.push("|----------|----------|-------------|");
        for (const arg of prompt.arguments) {
          const req = arg.required ? " ✓" : "";
          const desc = arg.description || "";
          lines.push(`| \`${arg.name}\` | ${req} | ${desc} |`);
        }
        lines.push("");
      }
      const exampleArgs = prompt.arguments?.reduce(
        (acc, a) => ({ ...acc, [a.name]: "" }),
        {} as Record<string, string>
      ) || {};
      lines.push("**Example request:**");
      lines.push("");
      lines.push(
        snippetBlock("json", JSON.stringify({ method: "prompts/get", params: { name: prompt.name, arguments: exampleArgs } }, null, 2))
      );
      lines.push("");
    }
  }

  return lines.join("\n");
}

export function copyToClipboard(text: string): Promise<void> {
  return navigator.clipboard.writeText(text);
}

export function downloadMarkdown(markdown: string, serverName?: string): void {
  const safeName = (serverName || "mcp-server").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "mcp-server";
  const url = URL.createObjectURL(new Blob([markdown], { type: "text/markdown;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${safeName}.md`;
  link.click();
  URL.revokeObjectURL(url);
}

export function makeSnippet(method: string, params: Record<string, unknown>): string {
  return JSON.stringify({ method, params }, null, 2);
}
