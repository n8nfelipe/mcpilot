import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { useMockStore } from "./mock-store";
import { isFeatureEnabled } from "@/lib/feature-gate";

export type ConnectionMode = "stdio" | "sse";

export interface Tool {
  name: string;
  description?: string;
  inputSchema?: unknown;
  outputSchema?: unknown;
}

export interface Resource {
  uri: string;
  name?: string;
  description?: string;
  mimeType?: string;
}

export interface Prompt {
  name: string;
  description?: string;
  arguments?: { name: string; description?: string; required?: boolean }[];
}

export interface ServerInfo {
  name?: string;
  version?: string;
}

export type ConnectionStatus = "disconnected" | "connecting" | "authenticating" | "connected" | "reconnecting" | "error";

export interface Tab {
  id: string;
  name: string;
  mode: ConnectionMode;
  connectionStatus: ConnectionStatus;
  connectionError: string | null;
  tools: Tool[];
  resources: Resource[];
  prompts: Prompt[];
  serverInfo: ServerInfo | null;
  capabilities?: Record<string, unknown>;
  generation: number;
  command?: string;
  args?: string[];
  url?: string;
  headers?: Record<string, string>;
}

let tabCounter = 0;

function nextId(): string {
  tabCounter++;
  return `tab-${tabCounter}`;
}

function makeDefaultTab(): Tab {
  return {
    id: nextId(),
    name: `Server ${tabCounter}`,
    mode: "stdio",
    connectionStatus: "disconnected",
    connectionError: null,
    tools: [],
    resources: [],
    prompts: [],
    serverInfo: null,
    generation: 0,
  };
}

interface TabsState {
  tabs: Tab[];
  activeTabId: string;
  addTab: () => string;
  closeTab: (id: string) => Promise<void>;
  setActiveTab: (id: string) => void;
  setTabMode: (id: string, mode: ConnectionMode) => void;
  setTabConnectionParams: (id: string, params: Partial<Pick<Tab, "command" | "args" | "url" | "headers">>) => void;
  connectTab: (id: string) => Promise<void>;
  disconnectTab: (id: string) => Promise<void>;
  markDisconnected: (id: string) => void;
  markAllDisconnected: () => void;
  setTabReconnecting: (id: string) => void;
  callToolOnTab: (id: string, name: string, args: Record<string, unknown>) => Promise<unknown>;
  readResourceOnTab: (id: string, uri: string) => Promise<unknown>;
  getPromptOnTab: (id: string, name: string, args: Record<string, string>) => Promise<unknown>;
  updateTabAfterConnect: (id: string, result: {
    serverInfo?: ServerInfo;
    tools?: Tool[];
    resources?: Resource[];
    prompts?: Prompt[];
    capabilities?: Record<string, unknown>;
  }, generation?: number) => void;
  setTabAuthenticating: (id: string) => void;
  setTabError: (id: string, error: string) => void;
}

export const useTabsStore = create<TabsState>((set, get) => ({
  tabs: [makeDefaultTab()],
  activeTabId: "tab-1",

  addTab: () => {
    const tab = makeDefaultTab();
    set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }));
    useMockStore.getState().setActiveConnectionId?.(tab.id);
    return tab.id;
  },

  closeTab: async (id) => {
    if (!get().tabs.some((tab) => tab.id === id)) return;
    get().markDisconnected(id);
    try {
      await invoke("bridge_send", { cmdType: "disconnect", params: { connectionId: id } });
    } catch { return; }
    set((s) => {
      const idx = s.tabs.findIndex((t) => t.id === id);
      if (idx === -1) return s;
      const filtered = s.tabs.filter((t) => t.id !== id);
      if (filtered.length === 0) {
        const tab = makeDefaultTab();
        return { tabs: [tab], activeTabId: tab.id };
      }
      const activeId = s.activeTabId === id
        ? filtered[Math.min(idx, filtered.length - 1)].id
        : s.activeTabId;
      return { tabs: filtered, activeTabId: activeId };
    });
    useMockStore.getState().setActiveConnectionId?.(get().activeTabId);
  },

  setActiveTab: (id) => {
    if (!get().tabs.some((tab) => tab.id === id)) return;
    set({ activeTabId: id });
    useMockStore.getState().setActiveConnectionId?.(id);
  },

  setTabMode: (id, mode) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, mode } : t)),
    })),

  setTabConnectionParams: (id, params) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, ...params } : t)),
    })),

  connectTab: async (id) => {
    let generation = -1;
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === id
          ? {
              ...t,
              generation: (generation = t.generation + 1),
              connectionStatus: t.connectionStatus === "connected" || t.connectionStatus === "reconnecting" ? "reconnecting" : "connecting",
              connectionError: null,
            }
          : t
      ),
    }));
    const tab = get().tabs.find((t) => t.id === id);
    if (!tab) return;

    try {
      let result: {
        serverInfo?: ServerInfo;
        tools?: Tool[];
        resources?: Resource[];
        prompts?: Prompt[];
        capabilities?: Record<string, unknown>;
      };
      if (tab.mode === "stdio") {
        result = (await invoke("bridge_send", {
          cmdType: "connect_stdio",
          params: { connectionId: id, command: tab.command, args: tab.args || [] },
        })) as typeof result;
      } else {
        const params: Record<string, unknown> = { connectionId: id, url: tab.url };
        if (tab.headers) params.headers = tab.headers;
        result = (await invoke("bridge_send", {
          cmdType: "connect_sse",
          params,
        })) as typeof result;
      }
      get().updateTabAfterConnect(id, result, generation);
    } catch (e) {
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.id === id && t.generation === generation
            ? { ...t, connectionStatus: "error" as ConnectionStatus, connectionError: String(e) }
            : t
        ),
      }));
    }
  },

  disconnectTab: async (id) => {
    get().markDisconnected(id);
    try {
      await invoke("bridge_send", { cmdType: "disconnect", params: { connectionId: id } });
    } catch { return; }
  },

  markDisconnected: (id) =>
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === id
          ? { ...t, generation: t.generation + 1, connectionStatus: "disconnected" as ConnectionStatus, connectionError: null }
          : t
      ),
    })),

  markAllDisconnected: () =>
    set((s) => ({
      tabs: s.tabs.map((t) => ({
        ...t,
        generation: t.generation + 1,
        connectionStatus: "disconnected" as ConnectionStatus,
        connectionError: null,
      })),
    })),

  setTabReconnecting: (id) =>
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === id
          ? { ...t, generation: t.generation + 1, connectionStatus: "reconnecting" as ConnectionStatus, connectionError: null }
          : t
      ),
    })),

  callToolOnTab: async (id, name, args) => {
    useMockStore.getState().setActiveConnectionId?.(id);
    const mockResponse = isFeatureEnabled() ? useMockStore.getState().getActiveMock(id, name) : null;
    if (mockResponse !== null) {
      return mockResponse;
    }
    const result = await invoke("bridge_send", {
      cmdType: "call_tool",
      params: { connectionId: id, name, arguments: args },
    });
    return result;
  },

  readResourceOnTab: (id, uri) =>
    invoke("bridge_send", {
      cmdType: "read_resource",
      params: { connectionId: id, uri },
    }),

  getPromptOnTab: (id, name, args) =>
    invoke("bridge_send", {
      cmdType: "get_prompt",
      params: { connectionId: id, name, arguments: args },
    }),

  updateTabAfterConnect: (id, result, generation) =>
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === id && (generation === undefined || t.generation === generation)
          ? {
              ...t,
              connectionStatus: "connected" as ConnectionStatus,
              connectionError: null,
              tools: result.tools || [],
              resources: result.resources || [],
              prompts: result.prompts || [],
              serverInfo: result.serverInfo || null,
              capabilities: result.capabilities ?? t.capabilities,
            }
          : t
      ),
    })),

  setTabAuthenticating: (id) =>
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === id ? { ...t, connectionStatus: "authenticating" as ConnectionStatus } : t
      ),
    })),

  setTabError: (id, error) =>
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === id ? { ...t, connectionStatus: "error" as ConnectionStatus, connectionError: error } : t
      ),
    })),
}));
