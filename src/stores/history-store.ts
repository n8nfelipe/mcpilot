import { create } from "zustand";
import Database from "@tauri-apps/plugin-sql";
import { useTabsStore } from "./tabs-store";
import { useLicenseStore } from "./license-store";

export type HistoryStatus = "success" | "error";

export interface HistoryEntry {
  id?: number;
  tool_name: string;
  arguments: string;
  response: string;
  server_name: string;
  connection_id: string;
  created_at: string;
  is_reference: boolean;
  status: HistoryStatus;
  duration_ms: number;
  error: string | null;
  is_mock: boolean;
  request_json: string;
  response_json: string;
}

type HistoryRow = Omit<HistoryEntry, "is_reference" | "is_mock"> & {
  is_reference: number | boolean;
  is_mock: number | boolean;
};

type NewHistoryEntry = Omit<HistoryEntry, "id" | "created_at" | "is_reference" | "connection_id"> & {
  connection_id?: string;
};

interface HistoryState {
  db: Database | null;
  entries: HistoryEntry[];
  initialized: boolean;
  init: () => Promise<void>;
  load: () => Promise<void>;
  save: (entry: NewHistoryEntry) => Promise<void>;
  deleteEntry: (id: number) => Promise<void>;
  toggleReference: (id: number) => Promise<void>;
  clear: () => Promise<void>;
  clearByConnection: (connectionId: string) => Promise<void>;
}

let initPromise: Promise<void> | null = null;

const migrations = [
  ["connection_id", "TEXT NOT NULL DEFAULT ''"],
  ["status", "TEXT NOT NULL DEFAULT 'success'"],
  ["duration_ms", "INTEGER NOT NULL DEFAULT 0"],
  ["error", "TEXT"],
  ["is_mock", "INTEGER NOT NULL DEFAULT 0"],
  ["request_json", "TEXT NOT NULL DEFAULT '{}'"],
  ["response_json", "TEXT NOT NULL DEFAULT '{}'"],
] as const;

export const useHistoryStore = create<HistoryState>((set, get) => ({
  db: null,
  entries: [],
  initialized: false,

  init: async () => {
    if (get().initialized) return;
    if (initPromise) return initPromise;
    initPromise = (async () => {
      const db = await Database.load("sqlite:mcpilot.db");
      await db.execute(`
        CREATE TABLE IF NOT EXISTS history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          tool_name TEXT NOT NULL,
          arguments TEXT NOT NULL DEFAULT '{}',
          response TEXT NOT NULL DEFAULT '{}',
          server_name TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          is_reference INTEGER NOT NULL DEFAULT 0,
          connection_id TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'success',
          duration_ms INTEGER NOT NULL DEFAULT 0,
          error TEXT,
          is_mock INTEGER NOT NULL DEFAULT 0,
          request_json TEXT NOT NULL DEFAULT '{}',
          response_json TEXT NOT NULL DEFAULT '{}'
        )
      `);
      const columns = await db.select<{ name: string }[]>("PRAGMA table_info(history)");
      const columnNames = new Set(columns.map((column) => column.name));
      for (const [name, definition] of migrations) {
        if (!columnNames.has(name)) {
          await db.execute(`ALTER TABLE history ADD COLUMN ${name} ${definition}`);
        }
      }
      set({ db, initialized: true });
      await get().load();
    })();
    try {
      await initPromise;
    } finally {
      initPromise = null;
    }
  },

  load: async () => {
    const { db } = get();
    if (!db) return;
    const days = useLicenseStore.getState().tier === "pro" ? 30 : 1;
    const rows = await db.select<HistoryRow[]>(
      "SELECT * FROM history WHERE datetime(created_at) >= datetime('now', $1) ORDER BY created_at DESC, id DESC LIMIT 1000",
      [`-${days} day`],
    );
    set({
      entries: rows.map((row) => ({
        ...row,
        is_reference: row.is_reference === true || row.is_reference === 1,
        is_mock: row.is_mock === true || row.is_mock === 1,
      })),
    });
  },

  save: async (entry) => {
    const { db } = get();
    if (!db) throw new Error("History database is not initialized");
    await db.execute(
      "INSERT INTO history (tool_name, arguments, response, server_name, connection_id, status, duration_ms, error, is_mock, request_json, response_json) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)",
      [entry.tool_name, entry.arguments, entry.response, entry.server_name, entry.connection_id ?? useTabsStore.getState().activeTabId, entry.status, entry.duration_ms, entry.error, entry.is_mock ? 1 : 0, entry.request_json, entry.response_json]
    );
    await get().load();
  },

  deleteEntry: async (id) => {
    const { db } = get();
    if (!db) return;
    await db.execute("DELETE FROM history WHERE id = $1", [id]);
    await get().load();
  },

  toggleReference: async (id) => {
    const { db, entries } = get();
    if (!db) return;
    const entry = entries.find((e) => e.id === id);
    if (!entry) return;
    await db.execute("UPDATE history SET is_reference = $1 WHERE id = $2", [
      entry.is_reference ? 0 : 1,
      id,
    ]);
    await get().load();
  },

  clear: async () => {
    const { db } = get();
    if (!db) return;
    await db.execute("DELETE FROM history");
    set({ entries: [] });
  },

  clearByConnection: async (connectionId) => {
    const { db } = get();
    if (!db) return;
    await db.execute("DELETE FROM history WHERE connection_id = $1", [connectionId]);
    set((state) => ({ entries: state.entries.filter((entry) => entry.connection_id !== connectionId) }));
  },
}));
