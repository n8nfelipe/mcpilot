import { beforeEach, describe, expect, it, vi } from "vitest";
import Database from "@tauri-apps/plugin-sql";
import { useHistoryStore } from "../history-store";
import { useTabsStore } from "../tabs-store";
import { useLicenseStore } from "../license-store";

const columns = ["connection_id", "status", "duration_ms", "error", "is_mock", "request_json", "response_json"].map((name) => ({ name }));

const newEntry = {
  tool_name: "tool",
  arguments: "{}",
  response: "{}",
  server_name: "server",
  status: "success" as const,
  duration_ms: 25,
  error: null,
  is_mock: false,
  request_json: '{"method":"tools/call"}',
  response_json: '{"result":{}}',
};

describe("History Store", () => {
  const execute = vi.fn();
  const select = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    execute.mockResolvedValue(undefined);
    select.mockImplementation((query: string) => Promise.resolve(query.startsWith("PRAGMA") ? [] : []));
    vi.mocked(Database.load).mockResolvedValue({ execute, select } as unknown as Database);
    useHistoryStore.setState({ db: null, entries: [], initialized: false });
    useLicenseStore.setState({ tier: "free" });
  });

  it("adds connection_id when migrating an existing database", async () => {
    await useHistoryStore.getState().init();
    expect(execute).toHaveBeenCalledWith("ALTER TABLE history ADD COLUMN connection_id TEXT NOT NULL DEFAULT ''");
  });

  it("does not alter a database that already has all columns", async () => {
    select.mockImplementation((query: string) => Promise.resolve(query.startsWith("PRAGMA") ? columns : []));
    await useHistoryStore.getState().init();
    expect(execute).not.toHaveBeenCalledWith(expect.stringContaining("ALTER TABLE"));
  });

  it("stores the explicit connection id", async () => {
    useHistoryStore.setState({ db: { execute, select } as unknown as Database, initialized: true });
    await useHistoryStore.getState().save({
      ...newEntry,
      connection_id: "tab-explicit",
    });
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining("connection_id"),
      ["tool", "{}", "{}", "server", "tab-explicit", "success", 25, null, 0, '{"method":"tools/call"}', '{"result":{}}'],
    );
  });

  it("uses the active tab id for existing save callers", async () => {
    useHistoryStore.setState({ db: { execute, select } as unknown as Database, initialized: true });
    const tabId = useTabsStore.getState().activeTabId;
    await useHistoryStore.getState().save(newEntry);
    expect(execute).toHaveBeenCalledWith(expect.any(String), ["tool", "{}", "{}", "server", tabId, "success", 25, null, 0, '{"method":"tools/call"}', '{"result":{}}']);
  });

  it("rejects saves before initialization", async () => {
    await expect(useHistoryStore.getState().save(newEntry)).rejects.toThrow("History database is not initialized");
  });

  it("normalizes SQLite booleans and applies free retention", async () => {
    const row = {
      id: 1,
      ...newEntry,
      connection_id: "tab-1",
      created_at: "2026-07-24 10:00:00",
      is_reference: 1,
      is_mock: 0,
    };
    select.mockResolvedValue([row]);
    useHistoryStore.setState({ db: { execute, select } as unknown as Database, initialized: true });

    await useHistoryStore.getState().load();

    expect(select).toHaveBeenCalledWith(
      expect.stringContaining("ORDER BY created_at DESC, id DESC LIMIT 1000"),
      ["-1 day"],
    );
    expect(useHistoryStore.getState().entries[0]).toMatchObject({ is_reference: true, is_mock: false });
  });

  it("loads 30 days for Pro", async () => {
    useLicenseStore.setState({ tier: "pro" });
    useHistoryStore.setState({ db: { execute, select } as unknown as Database, initialized: true });

    await useHistoryStore.getState().load();

    expect(select).toHaveBeenCalledWith(expect.any(String), ["-30 day"]);
  });

  it("shares initialization across concurrent callers", async () => {
    select.mockImplementation((query: string) => Promise.resolve(query.startsWith("PRAGMA") ? columns : []));

    await Promise.all([useHistoryStore.getState().init(), useHistoryStore.getState().init()]);

    expect(Database.load).toHaveBeenCalledTimes(1);
  });

  it("clears history only for one connection", async () => {
    useHistoryStore.setState({
      db: { execute, select } as unknown as Database,
      initialized: true,
      entries: [
        { id: 1, ...newEntry, tool_name: "one", connection_id: "tab-1", created_at: "2024-01-01", is_reference: false },
        { id: 2, ...newEntry, tool_name: "two", connection_id: "tab-2", created_at: "2024-01-01", is_reference: false },
      ],
    });

    await useHistoryStore.getState().clearByConnection("tab-1");

    expect(execute).toHaveBeenCalledWith("DELETE FROM history WHERE connection_id = $1", ["tab-1"]);
    expect(useHistoryStore.getState().entries).toHaveLength(1);
    expect(useHistoryStore.getState().entries[0].connection_id).toBe("tab-2");
  });
});
