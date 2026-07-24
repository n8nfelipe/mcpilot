import { beforeEach, describe, expect, it } from "vitest";
import { useMockStore } from "../mock-store";

describe("Mock Store", () => {
  beforeEach(() => {
    useMockStore.setState({ mocks: {}, activeConnectionId: "tab-1" });
  });

  it("isolates mocks by connection and tool name", () => {
    const state = useMockStore.getState();
    state.saveMock("tab-1", "get_weather", { temp: 25 });
    state.saveMock("tab-2", "get_weather", { temp: 10 });

    expect(state.getActiveMock("tab-1", "get_weather")).toEqual({ temp: 25 });
    expect(state.getActiveMock("tab-2", "get_weather")).toEqual({ temp: 10 });
    expect(state.getActiveMock("tab-3", "get_weather")).toBeNull();
    expect(Object.values(useMockStore.getState().mocks)).toHaveLength(2);
  });

  it("supports active-connection operations used by the UI", () => {
    const state = useMockStore.getState();
    state.saveMock("get_weather", { temp: 25 });
    expect(state.getActiveMock("get_weather")).toEqual({ temp: 25 });
    state.toggleMock("get_weather");
    expect(state.hasActiveMock("get_weather")).toBe(false);
    state.toggleMock("get_weather");
    state.updateMockResponse("get_weather", { temp: 30 });
    expect(state.getActiveMock("get_weather")).toEqual({ temp: 30 });
    state.deleteMock("get_weather");
    expect(state.getActiveMock("get_weather")).toBeNull();
  });

  it("mutates only the requested connection", () => {
    const state = useMockStore.getState();
    state.saveMock("tab-1", "tool", 1);
    state.saveMock("tab-2", "tool", 2);
    state.toggleMock("tab-1", "tool");
    state.updateMockResponse("tab-2", "tool", 3);

    expect(state.getActiveMock("tab-1", "tool")).toBeNull();
    expect(state.getActiveMock("tab-2", "tool")).toBe(3);
    state.deleteMock("tab-1", "tool");
    expect(state.hasActiveMock("tab-2", "tool")).toBe(true);
  });

  it("preserves createdAt when replacing the same mock", () => {
    vi.spyOn(Date, "now").mockReturnValueOnce(100).mockReturnValueOnce(200);
    const state = useMockStore.getState();
    state.saveMock("tab-1", "tool", 1);
    state.saveMock("tab-1", "tool", 2);
    const entry = Object.values(useMockStore.getState().mocks)[0];
    expect(entry.createdAt).toBe(100);
    expect(entry.updatedAt).toBe(200);
  });

  it("exports connection-scoped entries and imports them", () => {
    useMockStore.getState().saveMock("tab-1", "tool", { ok: true });
    const json = useMockStore.getState().exportMocks();
    useMockStore.setState({ mocks: {} });
    useMockStore.getState().importMocks(json);

    expect(useMockStore.getState().getActiveMock("tab-1", "tool")).toEqual({ ok: true });
    expect(JSON.parse(json)[0].connectionId).toBe("tab-1");
  });

  it.each([
    ["object", JSON.stringify({})],
    ["missing connection", JSON.stringify([{ toolName: "tool", response: {}, active: true, createdAt: 1, updatedAt: 1 }])],
    ["invalid active", JSON.stringify([{ connectionId: "tab-1", toolName: "tool", response: {}, active: "yes", createdAt: 1, updatedAt: 1 }])],
    ["invalid timestamp", JSON.stringify([{ connectionId: "tab-1", toolName: "tool", response: {}, active: true, createdAt: -1, updatedAt: 1 }])],
  ])("rejects invalid import: %s", (_, json) => {
    useMockStore.getState().saveMock("tab-1", "existing", 1);
    expect(() => useMockStore.getState().importMocks(json)).toThrow(TypeError);
    expect(useMockStore.getState().getActiveMock("tab-1", "existing")).toBe(1);
  });

  it("rejects duplicate connection and tool pairs", () => {
    const entry = { connectionId: "tab-1", toolName: "tool", response: {}, active: true, createdAt: 1, updatedAt: 1 };
    expect(() => useMockStore.getState().importMocks(JSON.stringify([entry, entry]))).toThrow(/Duplicate mock/);
  });
});
