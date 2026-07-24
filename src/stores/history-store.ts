import { create } from "zustand";
import Database from "@tauri-apps/plugin-sql";

export interface HistoryEntry {
  id?: number;
  tool_name: string;
  arguments: string;
  response: string;
  server_name: string;
  created_at: string;
  is_reference: boolean;
}

interface HistoryState {
  db: Database | null;
  entries: HistoryEntry[];
  initialized: boolean;
  init: () => Promise<void>;
  load: () => Promise<void>;
  save: (entry: Omit<HistoryEntry, "id" | "created_at" | "is_reference">) => Promise<void>;
  deleteEntry: (id: number) => Promise<void>;
  toggleReference: (id: number) => Promise<void>;
  clear: () => Promise<void>;
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  db: null,
  entries: [],
  initialized: false,

  init: async () => {
    if (get().initialized) return;
    const db = await Database.load("sqlite:mcpilot.db");
    await db.execute(`
      CREATE TABLE IF NOT EXISTS history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tool_name TEXT NOT NULL,
        arguments TEXT NOT NULL DEFAULT '{}',
        response TEXT NOT NULL DEFAULT '{}',
        server_name TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        is_reference INTEGER NOT NULL DEFAULT 0
      )
    `);
    set({ db, initialized: true });
    await get().load();
  },

  load: async () => {
    const { db } = get();
    if (!db) return;
    const rows = await db.select<HistoryEntry[]>(
      "SELECT * FROM history ORDER BY created_at DESC LIMIT 200"
    );
    set({ entries: rows });
  },

  save: async (entry) => {
    const { db } = get();
    if (!db) return;
    await db.execute(
      "INSERT INTO history (tool_name, arguments, response, server_name) VALUES ($1, $2, $3, $4)",
      [entry.tool_name, entry.arguments, entry.response, entry.server_name]
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
}));
