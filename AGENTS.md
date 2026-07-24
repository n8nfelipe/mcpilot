# MCPilot — AGENTS.md

**What this repo is:** A Tauri v2 desktop app (MCP Inspector / debugger for MCP servers).
Status: M1 + M2 + M3 (Mock Mode) implemented. See `PRD.md` for full spec.

## Tech stack

| Concern | Choice |
|---|---|
| Desktop | Tauri v2 (Rust backend + React/TypeScript frontend) |
| State | Zustand 5 |
| UI | Shadcn/ui (Base UI + Nova preset) + Tailwind v4 |
| Persistence | SQLite via @tauri-apps/plugin-sql (rusqlite under the hood) |
| MCP client | Sidecar Node.js (`src-tauri/mcp-bridge/bridge.js`) via @modelcontextprotocol/sdk |
| File watching | notify (Rust crate) — for hot reload |
| Process mgmt | Rust `std::process` — bridge spawned on app startup |
| Bridge IPC | JSON-line protocol over stdin/stdout — Rust forwards via Tauri commands + oneshot channels |
| Package mgr | pnpm |
| Testing | vitest (configured, 3 tests passing) |
| CI/CD | GitHub Actions (tsc + cargo check + tests + release) |

## Architecture

```
React Frontend (ConnectionPanel, ToolExplorer, Playground, HistoryPanel)
  ↕ Tauri IPC (invoke bridge_send/bridge_stop/start_watching/stop_watching)
Rust Backend (lib.rs — process manager, channels, Tauri commands, file watcher)
  ↕ stdio JSON-lines
Node.js Sidecar (mcp-bridge/bridge.js — @modelcontextprotocol/sdk Client)
  ↕ stdio or HTTP
MCP Server
```

## Project structure

```
mcpilot/
├── src/                        # React frontend
│   ├── components/
│   │   ├── ui/                 # Shadcn/ui components
│   │   ├── ConnectionPanel.tsx  # Server connection + hot reload watch dir
│   │   ├── ToolExplorer.tsx     # Tools/Resources/Prompts tabs with Mock badge
│   │   ├── Playground.tsx       # Tool call with auto-template, saves to history, Save as Mock
│   │   ├── HistoryPanel.tsx     # History list with replay, mark ref, collapsible details
│   │   └── MockManager.tsx      # Mock list with toggle, edit, export/import JSON
│   ├── stores/
│   │   ├── mcp-store.ts         # Zustand store (connection, tools, callTool, hot reload)
│   │   ├── history-store.ts     # Zustand store wrapping SQLite (init, save, load, replay)
│   │   └── mock-store.ts        # Zustand store (mocks CRUD, active mock interceptor)
│   ├── lib/utils.ts             # cn() helper
│   ├── index.css                # Tailwind v4 + theme tokens
│   ├── main.tsx
│   └── App.tsx
├── src-tauri/
│   ├── mcp-bridge/              # Node.js sidecar
│   │   ├── package.json
│   │   ├── bridge.js            # JSON-line MCP client using @modelcontextprotocol/sdk
│   │   └── node_modules/
│   ├── src/lib.rs               # Rust backend: bridge, watcher, Tauri commands
│   ├── src/main.rs
│   ├── Cargo.toml               # deps: notify, tauri-plugin-sql (sqlite)
│   └── tauri.conf.json
├── components.json              # Shadcn/ui config (Tailwind v4)
├── PRD.md
└── AGENTS.md
```

## Sidecar protocol (bridge.js ↔ Rust)

Requests (Rust → bridge via stdin):
```json
{"id":"r123","type":"connect_stdio","params":{"command":"node","args":["server.js"]}}
{"id":"r124","type":"call_tool","params":{"name":"get_weather","arguments":{"city":"NYC"}}}
{"id":"r125","type":"disconnect","params":{}}
```

Responses (bridge → Rust via stdout):
```json
{"id":"r123","type":"connected","data":{"tools":[...],"resources":[...],"prompts":[...]}}
{"id":"r124","type":"tool_result","data":{...}}
{"type":"event","event":"disconnected"}
```

Supported `type_` values: `connect_stdio`, `connect_sse`, `list_tools`, `list_resources`, `list_prompts`, `call_tool`, `read_resource`, `get_prompt`, `disconnect`.

## Key commands

```bash
pnpm dev              # Vite dev server (port 1420)
pnpm tauri dev        # Full Tauri dev (frontend + Rust backend)
pnpm build            # tsc + vite build
pnpm tauri build      # Production build
cargo check           # Rust check only (faster than full build)
npx tsc --noEmit      # TypeScript check
```

Bridge deps + build: `cd src-tauri/mcp-bridge && pnpm install && pnpm build` (build creates `bridge.bundle.js` via esbuild, used in prod bundles).

## Decisions to carry forward

- **Sidecar Node** chosen (not Rust-native MCP client)
- **License: MIT + Pro features**
- SSE transport uses `StreamableHTTPClientTransport`
- Tailwind v4 via `@tailwindcss/vite` plugin (no postcss)
- Shadcn/ui Base UI + Nova preset (not Radix)
- SQLite via `@tauri-apps/plugin-sql` (app data dir, auto-migration on init)
- Hot reload via `notify` crate, emits `server-code-changed` Tauri event
- Tauri IPC params use camelCase (v2 auto-converts snake_case Rust params)

## M1 delivered

- Bridge spawns on app startup, stays alive
- Connect to stdio or SSE servers
- Tool/Resource/Prompt explorer with schema display
- Playground with JSON args input, auto-template from schema, formatted response
- Empty state handling for all explorer tabs

## M2 delivered

- SQLite history store (`mcpilot.db` in app data dir)
- History panel (toggle via header button, collapsible request/response, replay, mark ref)
- Hot reload: file watcher with `notify` crate + auto-reconnect (`reconnecting` state)
- Watch directory input in ConnectionPanel
- Auto-save tool calls to history on execution
- Replay button re-executes stored calls

## M3 delivered

- Mock mode engine: save real responses as mocks, intercept callTool to return mock
- Mock Manager panel (toggle via header button)
- Mock CRUD: save, toggle active/inactive, edit response, delete
- Mock badge on ToolExplorer tool cards
- "Save as Mock" button in Playground after each call
- Export/import mocks as JSON
- Multi-server tabs: tab bar with add/close/switch
- Bridge multiplexing: multiple simultaneous MCP connections via connectionId
- Each tab has independent connection state, tools, explorer, playground
- Active tab switching preserves connection params

## M4 delivered

- Copy/paste snippets (copy button on ToolExplorer tool cards)
- Export Docs engine (generates markdown with tools/resources/prompts + history examples)
- Export Preview dialog
- Logs Timeline panel with search filter, tool filter, Diff View (line-by-line comparison)

## M5 delivered

- License Manager: local validation, key storage in localStorage, offline-first
- Feature Gate: `useFeature()` hook + `isPro()` utility
- Pro features gated: Multi-Server Tabs, Export Docs, Mock Manager, unlimited Replay
- License UI in header: Free/Pro badge, upgrade button, key input
- All gated features show disabled state in Free tier

## Still missing

- Server process manager restart on crash
- Landing page

## Conventions (user-wide)

- Descriptive commits in English
- No comments in code
- pnpm (not npm/yarn)
- vitest for testing, target ≥80% coverage
- Git init + GitHub remote at end of initial setup
- CI via GitHub Actions (tests + ncipollo/release-action)
