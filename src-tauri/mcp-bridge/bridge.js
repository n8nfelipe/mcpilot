import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const connections = new Map();

function respond(id, type, data) {
  const msg = { id, type, data };
  process.stdout.write(JSON.stringify(msg) + "\n");
}

function error(id, message) {
  const msg = { id, type: "error", error: message };
  process.stdout.write(JSON.stringify(msg) + "\n");
}

function emit(event, extra = {}) {
  const msg = { type: "event", event, ...extra };
  process.stdout.write(JSON.stringify(msg) + "\n");
}

function connId(params) {
  return params.connectionId || "default";
}

async function cleanupConnection(connId) {
  const ctx = connections.get(connId);
  if (ctx) {
    try {
      await ctx.client.close();
    } catch {
      // ignore close errors
    }
    connections.delete(connId);
  }
}

async function handleRequest(req) {
  const { id, type, params } = req;

  try {
    switch (type) {
      case "connect_stdio": {
        const cid = connId(params);
        await cleanupConnection(cid);
        const client = new Client({ name: "mcpilot", version: "0.1.0" });
        const transport = new StdioClientTransport({
          command: params.command,
          args: params.args || [],
        });
        transport.onclose = () => {
          connections.delete(cid);
          emit("disconnected", { connectionId: cid });
        };
        await client.connect(transport);
        connections.set(cid, { client, transport });
        const [toolsResult, resourcesResult, promptsResult] = await Promise.all([
          client.listTools().catch(() => ({ tools: [] })),
          client.listResources().catch(() => ({ resources: [] })),
          client.listPrompts().catch(() => ({ prompts: [] })),
        ]);
        respond(id, "connected", {
          connectionId: cid,
          serverInfo: client.serverInfo,
          tools: toolsResult.tools || [],
          resources: resourcesResult.resources || [],
          prompts: promptsResult.prompts || [],
        });
        break;
      }

      case "connect_sse": {
        const cid = connId(params);
        await cleanupConnection(cid);
        const client = new Client({ name: "mcpilot", version: "0.1.0" });
        const transportOpts = params.headers
          ? { requestInit: { headers: params.headers } }
          : {};
        const transport = new StreamableHTTPClientTransport(new URL(params.url), transportOpts);
        transport.onclose = () => {
          connections.delete(cid);
          emit("disconnected", { connectionId: cid });
        };
        await client.connect(transport);
        connections.set(cid, { client, transport });
        const [toolsResult, resourcesResult, promptsResult] = await Promise.all([
          client.listTools().catch(() => ({ tools: [] })),
          client.listResources().catch(() => ({ resources: [] })),
          client.listPrompts().catch(() => ({ prompts: [] })),
        ]);
        respond(id, "connected", {
          connectionId: cid,
          serverInfo: client.serverInfo,
          tools: toolsResult.tools || [],
          resources: resourcesResult.resources || [],
          prompts: promptsResult.prompts || [],
        });
        break;
      }

      case "list_tools": {
        const ctx = connections.get(connId(params));
        if (!ctx) return error(id, "Not connected");
        const result = await ctx.client.listTools();
        respond(id, "tools", result.tools || []);
        break;
      }

      case "list_resources": {
        const ctx = connections.get(connId(params));
        if (!ctx) return error(id, "Not connected");
        const result = await ctx.client.listResources();
        respond(id, "resources", result.resources || []);
        break;
      }

      case "list_prompts": {
        const ctx = connections.get(connId(params));
        if (!ctx) return error(id, "Not connected");
        const result = await ctx.client.listPrompts();
        respond(id, "prompts", result.prompts || []);
        break;
      }

      case "call_tool": {
        const ctx = connections.get(connId(params));
        if (!ctx) return error(id, "Not connected");
        const result = await ctx.client.callTool({
          name: params.name,
          arguments: params.arguments,
        });
        respond(id, "tool_result", result);
        break;
      }

      case "read_resource": {
        const ctx = connections.get(connId(params));
        if (!ctx) return error(id, "Not connected");
        const result = await ctx.client.readResource({ uri: params.uri });
        respond(id, "resource_content", result);
        break;
      }

      case "get_prompt": {
        const ctx = connections.get(connId(params));
        if (!ctx) return error(id, "Not connected");
        const result = await ctx.client.getPrompt({
          name: params.name,
          arguments: params.arguments,
        });
        respond(id, "prompt_result", result);
        break;
      }

      case "disconnect": {
        const cid = connId(params);
        await cleanupConnection(cid);
        respond(id, "disconnected", { connectionId: cid });
        break;
      }

      default:
        error(id, `Unknown command type: ${type}`);
    }
  } catch (err) {
    error(id, err.message || String(err));
  }
}

let buffer = "";
process.stdin.setEncoding("utf-8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  const lines = buffer.split("\n");
  buffer = lines.pop() || "";
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const req = JSON.parse(trimmed);
      handleRequest(req);
    } catch (err) {
      error(null, `Invalid JSON: ${err.message}`);
    }
  }
});

process.stdin.on("end", async () => {
  for (const [cid] of connections) {
    await cleanupConnection(cid);
  }
  process.exit(0);
});

process.on("SIGINT", async () => {
  for (const [cid] of connections) {
    await cleanupConnection(cid);
  }
  process.exit(0);
});

process.on("SIGTERM", async () => {
  for (const [cid] of connections) {
    await cleanupConnection(cid);
  }
  process.exit(0);
});
