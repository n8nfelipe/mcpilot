import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { useMockStore } from "./mock-store";

export type ConnectionMode = "stdio" | "sse";

export interface Tool {
  name: string;
  description?: string;
  inputSchema?: unknown;
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

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "reconnecting" | "error";

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
  };
}

interface TabsState {
  tabs: Tab[];
  activeTabId: string;
  addTab: () => string;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  setTabMode: (id: string, mode: ConnectionMode) => void;
  setTabConnectionParams: (id: string, params: Partial<Pick<Tab, "command" | "args" | "url" | "headers">>) => void;
  connectTab: (id: string) => Promise<void>;
  disconnectTab: (id: string) => Promise<void>;
  callToolOnTab: (id: string, name: string, args: Record<string, unknown>) => Promise<unknown>;
  updateTabAfterConnect: (id: string, result: {
    serverInfo?: ServerInfo;
    tools?: Tool[];
    resources?: Resource[];
    prompts?: Prompt[];
  }) => void;
  setTabError: (id: string, error: string) => void;
}

export const useTabsStore = create<TabsState>((set, get) => ({
  tabs: [makeDefaultTab()],
  activeTabId: "tab-1",

  addTab: () => {
    const tab = makeDefaultTab();
    set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }));
    return tab.id;
  },

  closeTab: (id) => {
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
  },

  setActiveTab: (id) => set({ activeTabId: id }),

  setTabMode: (id, mode) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, mode } : t)),
    })),

  setTabConnectionParams: (id, params) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, ...params } : t)),
    })),

  connectTab: async (id) => {
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === id ? { ...t, connectionStatus: "connecting" as ConnectionStatus, connectionError: null } : t
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
      get().updateTabAfterConnect(id, result);
    } catch (e) {
      get().setTabError(id, String(e));
    }
  },

  disconnectTab: async (id) => {
    try {
      await invoke("bridge_send", { cmdType: "disconnect", params: { connectionId: id } });
    } catch {
      // ignore
    }
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === id
          ? { ...t, connectionStatus: "disconnected" as ConnectionStatus, tools: [], resources: [], prompts: [], serverInfo: null }
          : t
      ),
    }));
  },

  callToolOnTab: async (id, name, args) => {
    const mockResponse = useMockStore.getState().getActiveMock(name);
    if (mockResponse !== null) {
      return mockResponse;
    }
    const result = await invoke("bridge_send", {
      cmdType: "call_tool",
      params: { connectionId: id, name, arguments: args },
    });
    return result;
  },

  updateTabAfterConnect: (id, result) =>
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === id
          ? {
              ...t,
              connectionStatus: "connected" as ConnectionStatus,
              connectionError: null,
              tools: result.tools || [],
              resources: result.resources || [],
              prompts: result.prompts || [],
              serverInfo: result.serverInfo || null,
            }
          : t
      ),
    })),

  setTabError: (id, error) =>
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === id ? { ...t, connectionStatus: "error" as ConnectionStatus, connectionError: error } : t
      ),
    })),
}));
