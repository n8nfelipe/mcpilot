import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const connections = new Map();
const pendingAuth = new Map();
const connectionQueues = new Map();
const serializedRequestTypes = new Set(["connect_stdio", "connect_sse", "oauth_callback", "disconnect"]);

class OAuthCredentialStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.data = null;
    this.writeQueue = Promise.resolve();
  }

  async load() {
    if (this.data) return this.data;
    try {
      this.data = JSON.parse(await readFile(this.filePath, "utf8"));
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
      this.data = {};
    }
    return this.data;
  }

  async get(serverUrl) {
    const data = await this.load();
    return data[serverUrl] || {};
  }

  async set(serverUrl, key, value) {
    const data = await this.load();
    data[serverUrl] = { ...(data[serverUrl] || {}), [key]: value };
    this.writeQueue = this.writeQueue.then(async () => {
      await mkdir(dirname(this.filePath), { recursive: true });
      const tempPath = `${this.filePath}.tmp`;
      await writeFile(tempPath, JSON.stringify(data, null, 2), { mode: 0o600 });
      await rename(tempPath, this.filePath);
    });
    await this.writeQueue;
  }

  async delete(serverUrl, keys) {
    const data = await this.load();
    if (!data[serverUrl]) return;
    for (const key of keys) delete data[serverUrl][key];
    await this.set(serverUrl, "updatedAt", new Date().toISOString());
  }
}

const credentialStores = new Map();

function credentialStore(filePath) {
  if (!credentialStores.has(filePath)) {
    credentialStores.set(filePath, new OAuthCredentialStore(filePath));
  }
  return credentialStores.get(filePath);
}

class McpOAuthProvider {
  constructor(connectionId, serverUrl, redirectUrl, storagePath) {
    this.connectionId = connectionId;
    this.serverUrl = serverUrl;
    this.redirectUrl = redirectUrl;
    this.store = credentialStore(storagePath);
    this.expectedState = null;
  }

  get clientMetadata() {
    return {
      redirect_uris: [this.redirectUrl],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      client_name: "MCPilot",
      software_id: "com.felipe.mcpilot",
      software_version: "0.1.0",
    };
  }

  async state() {
    this.expectedState = randomBytes(32).toString("hex");
    return this.expectedState;
  }

  async clientInformation() {
    const credentials = await this.store.get(this.serverUrl);
    if (credentials.clientRedirectUrl !== this.redirectUrl) return undefined;
    return credentials.clientInformation;
  }

  async saveClientInformation(clientInformation) {
    await this.store.set(this.serverUrl, "clientInformation", clientInformation);
    await this.store.set(this.serverUrl, "clientRedirectUrl", this.redirectUrl);
  }

  async tokens() {
    return (await this.store.get(this.serverUrl)).tokens;
  }

  async saveTokens(tokens) {
    await this.store.set(this.serverUrl, "tokens", tokens);
  }

  async redirectToAuthorization(authorizationUrl) {
    emit("oauth_required", {
      connectionId: this.connectionId,
      authorizationUrl: authorizationUrl.toString(),
    });
  }

  async saveCodeVerifier(codeVerifier) {
    await this.store.set(this.serverUrl, "codeVerifier", codeVerifier);
  }

  async codeVerifier() {
    const verifier = (await this.store.get(this.serverUrl)).codeVerifier;
    if (!verifier) throw new Error("OAuth PKCE verifier is missing");
    return verifier;
  }

  async saveDiscoveryState(discoveryState) {
    await this.store.set(this.serverUrl, "discoveryState", discoveryState);
  }

  async discoveryState() {
    return (await this.store.get(this.serverUrl)).discoveryState;
  }

  async invalidateCredentials(scope) {
    const keys = {
      all: ["clientInformation", "clientRedirectUrl", "tokens", "codeVerifier", "discoveryState"],
      client: ["clientInformation", "clientRedirectUrl"],
      tokens: ["tokens"],
      verifier: ["codeVerifier"],
      discovery: ["discoveryState"],
    }[scope];
    await this.store.delete(this.serverUrl, keys || []);
  }

  validateState(state) {
    return Boolean(state && this.expectedState && state === this.expectedState);
  }
}

function respond(id, type, data) {
  const msg = { id, type, data };
  process.stdout.write(JSON.stringify(msg) + "\n");
}

function error(id, message) {
  const msg = { id, type: "error", error: message };
  process.stdout.write(JSON.stringify(msg) + "\n");
}

function emit(event, extra = {}) {
  const msg = { type: "event", event, data: extra, ...extra };
  process.stdout.write(JSON.stringify(msg) + "\n");
}

function connId(params) {
  return params.connectionId || "default";
}

function remoteError(err, serverUrl) {
  const message = err.message || String(err);
  let hostname = "";
  let port = "";
  try {
    const url = new URL(serverUrl);
    hostname = url.hostname;
    port = url.port;
  } catch {}
  if (hostname === "mcp.figma.com" && message.includes("HTTP 403")) {
    return new Error(
      "Figma rejected MCPilot's OAuth client registration. Figma currently only allows clients listed in the Figma MCP Catalog. Join the client waitlist at https://form.asana.com/?k=kBG-ejRQTdY8x_H6a4vM3Q&d=10497086658021.",
    );
  }
  if (
    hostname === "api.githubcopilot.com" &&
    message.includes("does not support dynamic client registration")
  ) {
    return new Error(
      "GitHub Remote MCP does not support OAuth registration for custom clients. Create a GitHub PAT or App token and enter it in MCPilot's authorization field as Bearer <token>.",
    );
  }
  if (
    (hostname === "127.0.0.1" || hostname === "localhost") &&
    port === "3845" &&
    (message.includes("Not Found") || message.includes("fetch failed") || message.includes("ECONNREFUSED"))
  ) {
    return new Error(
      "Figma Desktop MCP is not available at http://127.0.0.1:3845/mcp. Open a Design file in the latest Figma desktop app, enter Dev Mode, and click Enable desktop MCP server in the MCP server section.",
    );
  }
  if (message.includes("Not Found")) {
    return new Error(
      `MCP endpoint returned HTTP 404 at ${serverUrl}. Verify that the URL includes the server's complete MCP path, usually /mcp.`,
    );
  }
  return err;
}

async function closeContext(ctx) {
  try {
    await ctx.client.close();
  } catch {}
}

async function cleanupConnection(connId, expectedCtx) {
  pendingAuth.delete(connId);
  const ctx = connections.get(connId);
  if (!ctx || (expectedCtx && ctx !== expectedCtx)) return;
  connections.delete(connId);
  await closeContext(ctx);
}

function createContext(connectionId, client, transport) {
  const ctx = { client, transport };
  transport.onclose = () => {
    if (connections.get(connectionId) !== ctx) return;
    connections.delete(connectionId);
    emit("disconnected", { connectionId });
  };
  return ctx;
}

function serializeConnection(connectionId, operation) {
  const previous = connectionQueues.get(connectionId) || Promise.resolve();
  const current = previous.catch(() => {}).then(operation);
  connectionQueues.set(connectionId, current);
  return current.finally(() => {
    if (connectionQueues.get(connectionId) === current) {
      connectionQueues.delete(connectionId);
    }
  });
}

async function listAll(client, method, key) {
  const items = [];
  const cursors = new Set();
  let cursor;
  do {
    const result = await client[method](cursor ? { cursor } : undefined);
    items.push(...(result[key] || []));
    cursor = result.nextCursor;
    if (cursor && cursors.has(cursor)) {
      throw new Error(`${method} returned a repeated nextCursor`);
    }
    if (cursor) cursors.add(cursor);
  } while (cursor);
  return items;
}

function supports(client, capability) {
  return Boolean(client.getServerCapabilities()?.[capability]);
}

async function listSupported(client, capability, method, key) {
  return supports(client, capability) ? listAll(client, method, key) : [];
}

async function connectionData(client, connectionId) {
  const [tools, resources, prompts] = await Promise.all([
    listSupported(client, "tools", "listTools", "tools"),
    listSupported(client, "resources", "listResources", "resources"),
    listSupported(client, "prompts", "listPrompts", "prompts"),
  ]);
  return {
    connectionId,
    serverInfo: client.serverInfo,
    tools,
    resources,
    prompts,
  };
}

function remoteTransport(params, provider, legacySse = false) {
  const transportOpts = {
    ...(provider ? { authProvider: provider } : {}),
    ...(params.headers ? { requestInit: { headers: params.headers } } : {}),
  };
  const url = new URL(params.url);
  return legacySse
    ? new SSEClientTransport(url, transportOpts)
    : new StreamableHTTPClientTransport(url, transportOpts);
}

async function openRemoteContext(params, provider, legacySse) {
  const cid = connId(params);
  const client = new Client({ name: "mcpilot", version: "0.1.0" });
  const transport = remoteTransport(params, provider, legacySse);
  const ctx = createContext(cid, client, transport);
  try {
    await client.connect(transport);
    return ctx;
  } catch (err) {
    await closeContext(ctx);
    throw err;
  }
}

async function connectRemote(params, provider) {
  const cid = connId(params);
  const url = new URL(params.url);
  const legacySse = url.pathname.endsWith("/sse");
  let ctx;
  try {
    ctx = await openRemoteContext(params, provider, legacySse);
  } catch (err) {
    if (legacySse || (err.code !== 404 && err.code !== 405)) throw err;
    ctx = await openRemoteContext(params, provider, true);
  }
  connections.set(cid, ctx);
  return ctx;
}

async function executeRequest(req) {
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
        const ctx = createContext(cid, client, transport);
        try {
          await client.connect(transport);
          connections.set(cid, ctx);
          respond(id, "connected", await connectionData(client, cid));
        } catch (err) {
          if (connections.get(cid) === ctx) {
            await cleanupConnection(cid, ctx);
          } else {
            await closeContext(ctx);
          }
          throw err;
        }
        break;
      }

      case "connect_sse": {
        const cid = connId(params);
        await cleanupConnection(cid);
        const provider = params.redirectUrl && params.authStoragePath && !params.headers?.Authorization
          ? new McpOAuthProvider(cid, params.url, params.redirectUrl, params.authStoragePath)
          : null;
        let ctx;
        try {
          ctx = await connectRemote(params, provider);
          respond(id, "connected", await connectionData(ctx.client, cid));
        } catch (err) {
          if (ctx) await cleanupConnection(cid, ctx);
          if (!(err instanceof UnauthorizedError) || !provider) {
            throw remoteError(err, params.url);
          }
          pendingAuth.set(cid, { requestId: id, params, provider });
        }
        break;
      }

      case "oauth_callback": {
        const cid = connId(params);
        const auth = pendingAuth.get(cid);
        if (!auth) return error(id, "No OAuth authorization is pending");
        pendingAuth.delete(cid);
        try {
          if (params.error) throw new Error(params.errorDescription || params.error);
          if (!auth.provider.validateState(params.state)) {
            throw new Error("OAuth state validation failed");
          }
          if (!params.code) {
            throw new Error("OAuth callback did not include an authorization code");
          }

          const exchangeTransport = remoteTransport(
            auth.params,
            auth.provider,
            new URL(auth.params.url).pathname.endsWith("/sse"),
          );
          try {
            await exchangeTransport.finishAuth(params.code);
          } finally {
            await exchangeTransport.close().catch(() => {});
          }
          const ctx = await connectRemote(auth.params, auth.provider);
          try {
            respond(auth.requestId, "connected", await connectionData(ctx.client, cid));
          } catch (err) {
            await cleanupConnection(cid, ctx);
            throw err;
          }
          respond(id, "oauth_complete", { connectionId: cid });
        } catch (err) {
          const message = remoteError(err, auth.params.url).message;
          error(auth.requestId, message);
          error(id, message);
        }
        break;
      }

      case "list_tools": {
        const ctx = connections.get(connId(params));
        if (!ctx) return error(id, "Not connected");
        respond(id, "tools", await listSupported(ctx.client, "tools", "listTools", "tools"));
        break;
      }

      case "list_resources": {
        const ctx = connections.get(connId(params));
        if (!ctx) return error(id, "Not connected");
        respond(id, "resources", await listSupported(ctx.client, "resources", "listResources", "resources"));
        break;
      }

      case "list_prompts": {
        const ctx = connections.get(connId(params));
        if (!ctx) return error(id, "Not connected");
        respond(id, "prompts", await listSupported(ctx.client, "prompts", "listPrompts", "prompts"));
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

function handleRequest(req) {
  if (!serializedRequestTypes.has(req?.type)) return executeRequest(req);
  return serializeConnection(connId(req.params || {}), () => executeRequest(req));
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
      void handleRequest(req).catch((err) => {
        error(req?.id ?? null, err.message || String(err));
      });
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
