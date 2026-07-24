import { describe, it, expect, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";

type MockStore = {
  getActiveMock: (connectionId: string, name: string) => unknown | null;
  setActiveConnectionId: (connectionId: string) => void;
};

const mockStoreState: MockStore = {
  getActiveMock: () => null,
  setActiveConnectionId: () => undefined,
};

vi.mock("@/stores/mock-store", () => ({
  useMockStore: {
    getState: () => mockStoreState,
  },
}));

describe("Tabs Store", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockStoreState.getActiveMock = () => null;
    const { useTabsStore } = await import("../tabs-store");
    useTabsStore.setState((s) => ({
      tabs: [],
      activeTabId: "",
    }));
    useTabsStore.getState().addTab();
  });

  function currentTab(store: typeof import("../tabs-store").useTabsStore) {
    const state = store.getState();
    return state.tabs.find((t: { id: string }) => t.id === state.activeTabId);
  }

  it("starts with one tab after setup", async () => {
    const { useTabsStore } = await import("../tabs-store");
    expect(useTabsStore.getState().tabs).toHaveLength(1);
  });

  it("adds a new tab and switches to it", async () => {
    const { useTabsStore } = await import("../tabs-store");
    const id = useTabsStore.getState().addTab();
    expect(useTabsStore.getState().tabs).toHaveLength(2);
    expect(useTabsStore.getState().activeTabId).toBe(id);
  });

  it("sets active tab", async () => {
    const { useTabsStore } = await import("../tabs-store");
    const id = useTabsStore.getState().addTab();
    const firstId = useTabsStore.getState().tabs[0].id;
    useTabsStore.getState().setActiveTab(firstId);
    expect(useTabsStore.getState().activeTabId).toBe(firstId);
  });

  it("disconnects a tab before removing it", async () => {
    const { useTabsStore } = await import("../tabs-store");
    const id = useTabsStore.getState().addTab();
    let release: () => void = () => undefined;
    vi.mocked(invoke).mockReturnValue(new Promise<void>((resolve) => { release = resolve; }));
    const closing = useTabsStore.getState().closeTab(id);
    expect(useTabsStore.getState().tabs).toHaveLength(2);
    expect(invoke).toHaveBeenCalledWith("bridge_send", {
      cmdType: "disconnect",
      params: { connectionId: id },
    });
    release();
    await closing;
    expect(useTabsStore.getState().tabs).toHaveLength(1);
  });

  it("closing last tab creates a new default tab", async () => {
    const { useTabsStore } = await import("../tabs-store");
    const state = useTabsStore.getState();
    const onlyId = state.tabs[0].id;
    await state.closeTab(onlyId);
    expect(useTabsStore.getState().tabs).toHaveLength(1);
    expect(useTabsStore.getState().tabs[0].connectionStatus).toBe("disconnected");
  });

  it("sets tab mode", async () => {
    const { useTabsStore } = await import("../tabs-store");
    const id = useTabsStore.getState().tabs[0].id;
    useTabsStore.getState().setTabMode(id, "sse");
    expect(useTabsStore.getState().tabs[0].mode).toBe("sse");
  });

  it("sets tab connection params", async () => {
    const { useTabsStore } = await import("../tabs-store");
    const id = useTabsStore.getState().tabs[0].id;
    useTabsStore.getState().setTabConnectionParams(id, { command: "node", args: ["server.js"] });
    const tab = useTabsStore.getState().tabs[0];
    expect(tab.command).toBe("node");
    expect(tab.args).toEqual(["server.js"]);
  });

  it("connectTab sets connecting state and calls invoke for stdio", async () => {
    const { useTabsStore } = await import("../tabs-store");
    const id = useTabsStore.getState().tabs[0].id;
    vi.mocked(invoke).mockResolvedValue({ tools: [{ name: "test_tool" }], resources: [], prompts: [] });
    useTabsStore.getState().setTabConnectionParams(id, { command: "node", args: ["server.js"] });

    const promise = useTabsStore.getState().connectTab(id);
    expect(useTabsStore.getState().tabs[0].connectionStatus).toBe("connecting");
    await promise;
    expect(invoke).toHaveBeenCalledWith("bridge_send", {
      cmdType: "connect_stdio",
      params: { connectionId: id, command: "node", args: ["server.js"] },
    });
    expect(useTabsStore.getState().tabs[0].connectionStatus).toBe("connected");
    expect(useTabsStore.getState().tabs[0].tools).toEqual([{ name: "test_tool" }]);
  });

  it("connectTab handles SSE mode", async () => {
    const { useTabsStore } = await import("../tabs-store");
    const id = useTabsStore.getState().tabs[0].id;
    vi.mocked(invoke).mockResolvedValue({ tools: [], resources: [], prompts: [] });
    useTabsStore.getState().setTabMode(id, "sse");
    useTabsStore.getState().setTabConnectionParams(id, { url: "http://localhost:3000/sse" });

    await useTabsStore.getState().connectTab(id);
    expect(invoke).toHaveBeenCalledWith("bridge_send", {
      cmdType: "connect_sse",
      params: { connectionId: id, url: "http://localhost:3000/sse" },
    });
  });

  it("connectTab sends headers for SSE", async () => {
    const { useTabsStore } = await import("../tabs-store");
    const id = useTabsStore.getState().tabs[0].id;
    vi.mocked(invoke).mockResolvedValue({ tools: [], resources: [], prompts: [] });
    useTabsStore.getState().setTabMode(id, "sse");
    useTabsStore.getState().setTabConnectionParams(id, { url: "http://localhost:3000/sse", headers: { Authorization: "Bearer test" } });

    await useTabsStore.getState().connectTab(id);
    expect(invoke).toHaveBeenCalledWith("bridge_send", {
      cmdType: "connect_sse",
      params: { connectionId: id, url: "http://localhost:3000/sse", headers: { Authorization: "Bearer test" } },
    });
  });

  it("connectTab sets error on failure", async () => {
    const { useTabsStore } = await import("../tabs-store");
    const id = useTabsStore.getState().tabs[0].id;
    vi.mocked(invoke).mockRejectedValue(new Error("Connection refused"));
    useTabsStore.getState().setTabConnectionParams(id, { command: "node", args: ["server.js"] });

    await useTabsStore.getState().connectTab(id);
    const tab = useTabsStore.getState().tabs[0];
    expect(tab.connectionStatus).toBe("error");
    expect(tab.connectionError).toBe("Error: Connection refused");
  });

  it("disconnectTab preserves capabilities for offline mocks", async () => {
    const { useTabsStore } = await import("../tabs-store");
    const id = useTabsStore.getState().tabs[0].id;
    vi.mocked(invoke).mockResolvedValue(undefined);
    useTabsStore.getState().setTabConnectionParams(id, { command: "node" });
    await useTabsStore.getState().connectTab(id);
    vi.mocked(invoke).mockResolvedValue(undefined);

    await useTabsStore.getState().disconnectTab(id);
    const tab = useTabsStore.getState().tabs[0];
    expect(tab.connectionStatus).toBe("disconnected");
    expect(tab.tools).toEqual([]);
    expect(tab.serverInfo).toBeNull();
  });

  it("callToolOnTab invokes bridge without mock", async () => {
    const { useTabsStore } = await import("../tabs-store");
    const id = useTabsStore.getState().tabs[0].id;
    vi.mocked(invoke).mockResolvedValue({ content: [{ text: "result" }] });
    const result = await useTabsStore.getState().callToolOnTab(id, "get_weather", { city: "NYC" });
    expect(invoke).toHaveBeenCalledWith("bridge_send", {
      cmdType: "call_tool",
      params: { connectionId: id, name: "get_weather", arguments: { city: "NYC" } },
    });
    expect(result).toEqual({ content: [{ text: "result" }] });
  });

  it("callToolOnTab returns mock response when active mock exists", async () => {
    const { useTabsStore } = await import("../tabs-store");
    const id = useTabsStore.getState().tabs[0].id;
    mockStoreState.getActiveMock = (connectionId: string, name: string) =>
      connectionId === id && name === "get_weather" ? { mock: true, temp: 25 } : null;

    const result = await useTabsStore.getState().callToolOnTab(id, "get_weather", { city: "NYC" });
    expect(invoke).not.toHaveBeenCalled();
    expect(result).toEqual({ mock: true, temp: 25 });
  });

  it("updateTabAfterConnect sets tools and server info", async () => {
    const { useTabsStore } = await import("../tabs-store");
    const id = useTabsStore.getState().tabs[0].id;
    useTabsStore.getState().updateTabAfterConnect(id, {
      serverInfo: { name: "test-server", version: "1.0" },
      tools: [{ name: "tool1" }, { name: "tool2" }],
      resources: [{ uri: "file:///test" }],
      prompts: [],
    });
    const tab = useTabsStore.getState().tabs[0];
    expect(tab.serverInfo).toEqual({ name: "test-server", version: "1.0" });
    expect(tab.tools).toHaveLength(2);
    expect(tab.resources).toHaveLength(1);
    expect(tab.connectionStatus).toBe("connected");
  });

  it("setTabError sets error status", async () => {
    const { useTabsStore } = await import("../tabs-store");
    const id = useTabsStore.getState().tabs[0].id;
    useTabsStore.getState().setTabError(id, "Something broke");
    const tab = useTabsStore.getState().tabs[0];
    expect(tab.connectionStatus).toBe("error");
    expect(tab.connectionError).toBe("Something broke");
  });

  it("preserves discovered data when marking tabs disconnected", async () => {
    const { useTabsStore } = await import("../tabs-store");
    const firstId = useTabsStore.getState().tabs[0].id;
    useTabsStore.getState().updateTabAfterConnect(firstId, {
      tools: [{ name: "tool-1" }],
      resources: [{ uri: "file:///one" }],
      prompts: [{ name: "prompt-1" }],
      serverInfo: { name: "server" },
      capabilities: { tools: true },
    });
    const secondId = useTabsStore.getState().addTab();
    useTabsStore.getState().setTabReconnecting(secondId);
    expect(useTabsStore.getState().tabs.find((tab) => tab.id === secondId)?.connectionStatus).toBe("reconnecting");

    useTabsStore.getState().markAllDisconnected();
    const first = useTabsStore.getState().tabs.find((tab) => tab.id === firstId);
    expect(first).toMatchObject({
      connectionStatus: "disconnected",
      tools: [{ name: "tool-1" }],
      resources: [{ uri: "file:///one" }],
      prompts: [{ name: "prompt-1" }],
      serverInfo: { name: "server" },
      capabilities: { tools: true },
    });
  });

  it("uses reconnecting while refreshing a connected tab", async () => {
    const { useTabsStore } = await import("../tabs-store");
    const id = useTabsStore.getState().tabs[0].id;
    useTabsStore.getState().updateTabAfterConnect(id, { tools: [{ name: "old" }] });
    let release: (value: unknown) => void = () => undefined;
    vi.mocked(invoke).mockReturnValue(new Promise((resolve) => { release = resolve; }));
    const reconnect = useTabsStore.getState().connectTab(id);
    expect(useTabsStore.getState().tabs[0].connectionStatus).toBe("reconnecting");
    release({ tools: [{ name: "new" }] });
    await reconnect;
    expect(useTabsStore.getState().tabs[0].tools).toEqual([{ name: "new" }]);
  });

  it("ignores an obsolete connect response for the same tab", async () => {
    const { useTabsStore } = await import("../tabs-store");
    const id = useTabsStore.getState().tabs[0].id;
    let resolveFirst: (value: unknown) => void = () => undefined;
    let resolveSecond: (value: unknown) => void = () => undefined;
    vi.mocked(invoke)
      .mockReturnValueOnce(new Promise((resolve) => { resolveFirst = resolve; }))
      .mockReturnValueOnce(new Promise((resolve) => { resolveSecond = resolve; }));

    const first = useTabsStore.getState().connectTab(id);
    const second = useTabsStore.getState().connectTab(id);
    resolveSecond({ tools: [{ name: "current" }] });
    await second;
    resolveFirst({ tools: [{ name: "obsolete" }] });
    await first;

    expect(useTabsStore.getState().tabs[0].tools).toEqual([{ name: "current" }]);
  });
});
