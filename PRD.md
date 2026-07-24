# MCPilot — PRD (Product Requirements Document)

> **Versão:** 1.1  
> **Data:** 2026-07-23  
> **Status:** Em desenvolvimento — M1 implementado  
> **Stack:** Tauri v2 + React + TypeScript

---

## 1. Executive Summary

MCPilot é um **playground visual + debugger profissional para servidores MCP** — o "Postman" do ecossistema Model Context Protocol. Ele permite que qualquer desenvolvedor que construa ou mantenha servidores MCP conecte, teste, debugue e documente seus servidores em uma interface desktop nativa, sem precisar abrir um cliente MCP (Claude Desktop, OpenCode, etc.) cada vez que quer testar uma ferramenta.

O mercado de ferramentas MCP é **praticamente inexistente** — o oficial MCP Inspector (10.4k ★) é uma web app básica sem persistência, o MCPJam (2.1k ★) é uma plataforma complexa focada em evaluation, e o único wrapper desktop (cicbyte/mcp-inspector-desktop) é apenas um iframe abandonado. MCPilot preenche esse gap com um app desktop nativo focado em DX.

---

## 2. Problema

Construir servidores MCP hoje é um processo tedioso e manual:

1. **Sem debug visual** — Para testar uma tool, você precisa subir o servidor, abrir um cliente MCP, e chamar a tool manualmente
2. **Sem hot reload** — Cada alteração no código exige reiniciar servidor + reconectar cliente
3. **Sem histórico** — Chamadas anteriores se perdem ao fechar o cliente
4. **Sem mock** — Não existe maneira de simular respostas sem o servidor rodando
5. **Sem documentação automática** — A spec do servidor (tools, resources, prompts, schemas) só existe no código

---

## 3. Solução

Um **app desktop nativo** (Tauri v2) que se conecta a qualquer servidor MCP (stdio ou SSE) e oferece:

| Funcionalidade | Descrição |
|---|---|
| **Tool Explorer** | Lista tools, resources e prompts com schema completo (inputs, outputs, tipos) |
| **Playground** | UI visual para chamar cada tool/resource com inputs customizados |
| **Hot Reload** | Detecta alterações no código do servidor, reinicia e reconecta automaticamente |
| **History & Replay** | Histórico persistente local — replay de requests com 1 clique |
| **Mock Mode** | Simula respostas de tools sem servidor rodando (útil para testar clients) |
| **Logs & Debug** | Timeline JSON-RCP de cada request/response com latência e erros |
| **Diff View** | Compara respostas entre versões do servidor |
| **Export Docs** | Gera documentação markdown da spec completa do servidor |
| **Multi-Server** | Abas paralelas para múltiplos servidores simultaneamente |

---

## 4. Análise de Concorrência (Pesquisa de Mercado)

Pesquisei o ecossistema em julho/2026 via DuckDuckGo e GitHub Search. Resultados reais:

| Concorrente | Stars | Tipo | O que faz | Gap |
|---|---|---|---|---|
| **[MCP Inspector](https://github.com/modelcontextprotocol/inspector)** (Anthropic) | ⭐ 10.4k | Web app oficial | Testar servidor MCP no browser | v1.0.0 lançada semana passada. **Sem persistência, sem replay, sem mock, sem hot reload.** Só 1 servidor por vez. UI funcional mas feia |
| **[MCPJam/inspector](https://github.com/MCPJam/inspector)** | ⭐ 2.1k | Web platform | Chat + debug + evaluation + OAuth | 4.6k commits, ativo. Plataforma completa, mas **web-only, complexa demais pra dev individual.** Foco em evaluation, não em DX |
| **[cicbyte/mcp-inspector-desktop](https://github.com/cicbyte/mcp-inspector-desktop)** | ⭐ 1 | Tauri v2 wrapper | Iframe do Inspector oficial | **Abandonado (2 meses sem commit).** Só embrulha o web app num iframe — zero valor agregado |
| **VS Code MCP Extension** | — | VS Code extension | Listar tools básicas no editor | **Funcionalidade mínima.** Só executa, não debuga, não tem playground |
| **Claude Desktop / OpenCode / Cursor** | — | Clientes MCP | Executar tools no chat | **Foco em produtividade, não em dev.** Sem log, schema, replay, mock |

**Diferenciais do MCPilot contra todos:**
- **Desktop nativo** (não web) — integração com sistema, performance, offline
- **Hot reload** — ninguém oferece
- **Mock mode** — ninguém oferece
- **History persistente** — Inspector oficial perde tudo ao fechar
- **Multi-server em abas** — ninguém oferece
- **Export docs** — ninguém oferece

---

## 5. Público-Alvo

### Persona 1: Dev de MCP Server
- **Quem:** Desenvolvedor individual construindo servidores MCP para side projects ou empresa
- **Dores:** Testar manualmente em clientes MCP é lento; não tem feedback loop rápido
- **Tamanho:** ~50-100k devs atualmente (crescendo com adoção de MCP)

### Persona 2: Time de Agentes IA
- **Quem:** Empresas adotando MCP como protocolo interno para agentes
- **Dores:** Precisam de QA/testes nos servidores MCP que seus agentes consomem
- **Tamanho:** Empresas médias com >5 servidores MCP internos

### Persona 3: Indie Hacker / Publisher
- **Quem:** Publica servidores MCP no GitHub para o ecossistema
- **Dores:** Precisa de documentação automática e testes antes de publicar
- **Tamanho:** ~5-10k publishers ativos

---

## 6. Arquitetura Técnica

```
React Frontend (ConnectionPanel, ToolExplorer, Playground, …)
  ↕ Tauri IPC (invoke bridge_send / bridge_stop)
Rust Backend (lib.rs — process manager, oneshot channels, Tauri commands)
  ↕ stdio JSON-lines (bridge.js ↔ Rust)
Node.js Sidecar (mcp-bridge/bridge.js — @modelcontextprotocol/sdk Client)
  ↕ stdio ou HTTP (StreamableHTTP)
MCP Server
```

### Decisões Técnicas (implementadas)

| Decisão | Opção | Motivo |
|---|---|---|
| **Desktop framework** | Tauri v2 | Nativo, leve (vs Electron), Rust seguro, React frontend |
| **MCP Client** | @modelcontextprotocol/sdk via sidecar Node | Decidido: sidecar Node (mais rápido que Rust puro) |
| **State management** | Zustand 5 | Já usado nos seus projetos, leve, TS-first |
| **UI Library** | Shadcn/ui Base UI + Nova preset | Tailwind v4 compatível, visual moderno |
| **CSS** | Tailwind v4 via @tailwindcss/vite | Sem postcss, configuração via CSS |
| **Bridge IPC** | JSON-lines sobre stdin/stdout + oneshot channels | Simples, confiável, eventos assíncronos |
| **Local storage** | SQLite via Tauri | Não implementado ainda (M2) |
| **File watching** | notify (Rust crate) | Não implementado ainda (M2) |
| **Process management** | Rust std::process | Bridge iniciada no setup do app, mantida viva |
| **License** | MIT + Pro features | Core MIT, features fechadas via chave de licença |
| **Sidecar bundling** | Path relativo ao CARGO_MANIFEST_DIR | Dev path; precisa de bundling Tauri proper (M5) |

---

## 7. Monetização

| Tier | Preço | Features |
|---|---|---|
| **Free** | $0 | 1 servidor ativo, histórico 1 dia, sem replay, sem mock |
| **Pro** | $12/mês | Servidores ilimitados, histórico 30 dias, replay, mock mode, export docs |
| **Team** | $29/mês/membro | Tudo do Pro + coleções compartilhadas, SSO, workspace team |

Modelo de distribuição: **GitHub Releases** (binário gratuito) + **licenciamento via chave** (Pro/Team via Gumroad ou similar).

---

## 8. Roadmap — Milestones Detalhados

### 🎯 Milestone 1: Foundation + Tool Explorer ✅ (Implementado)

**Objetivo:** MVP funcional — conectar a um servidor MCP, listar tools, chamar uma tool.

**Implementado:**
1. ✅ Projeto Tauri v2 + Tailwind v4 + Shadcn/ui (Base UI + Nova preset)
2. ✅ Bridge Node.js sidecar (`src-tauri/mcp-bridge/bridge.js`) com @modelcontextprotocol/sdk
3. ✅ Rust backend: gerenciamento do processo bridge, IPC via JSON-lines + oneshot channels, eventos assíncronos
4. ✅ ConnectionPanel: input stdio ou SSE, status indicator, badge com serverInfo
5. ✅ ToolExplorer: tabs Tools / Resources / Prompts com schema display
6. ✅ Playground: select de tool, args JSON com auto-template do schema, call tool, response view
7. ✅ ResponseView: extrai `content[].text`, formata JSON aninhado, fallback pra raw JSON
8. ✅ Empty state handling nos explorers e playground

**Não implementado (postergado para M2/M5):**
- ❌ SQLite history store (M2)
- ❌ Testes vitest (pendente)
- ❌ Error boundaries
- ❌ Sidecar bundling no build Tauri (M5)

**Decisões de implementação:**
- Window size: 1200×800
- Bridge protocol: JSON-lines (stdin/stdout), request/response via oneshot channels, eventos via Tauri `emit`
- Bridge suporta: `connect_stdio`, `connect_sse`, `list_tools`, `list_resources`, `list_prompts`, `call_tool`, `read_resource`, `get_prompt`, `disconnect`
- Bridge iniciada no `setup` do Tauri e mantida viva
- Parâmetros Tauri IPC usam camelCase (Tauri v2 converte snake_case Rust)

**Critério de sucesso:** ✅ Atingido — MCPilot conecta em twitter-mcp e youtube-mcp, lista tools, chama tools com parâmetros e exibe resposta formatada.

**Entregáveis:** `v0.1.0-alpha` (pendente tag git)

---

### 🎯 Milestone 2: Hot Reload + History & Replay (Semana 3)

**Objetivo:** Feedback loop rápido — altera código do servidor, MCPilot reinicia sozinho.

**Tarefas:**
1. **Process Manager (Rust)** — spawn do processo servidor, monitorar saída, kill/restart
2. **File watcher** — notify crate observa diretório do projeto do servidor (configurável)
3. **UI: Connection Status** — indicador visual de connected/disconnected/reconnecting
4. **UI: History Panel** — lista de chamadas anteriores com collapsible request/response
5. **Replay** — botão "Replay" que reexecuta a chamada com os mesmos parâmetros
6. **Ancoragem de versão** — opção de marcar chamadas como "referência" pra diff
7. **Persistência** — SQLite com histórico por servidor (nome do servidor como chave)

**Critério de sucesso:** Mudar código do servidor → MCPilot detecta, reinicia, reconecta automaticamente. Replay de chamada anterior com 1 clique.

**Entregáveis:** Tag `v0.2.0-alpha`

---

### 🎯 Milestone 3: Mock Mode + Multi-Server (Semana 4)

**Objetivo:** Testar sem servidor real + comparar múltiplos servidores.

**Tarefas:**
1. **Mock Mode Engine** — salvar respostas reais como "mocks", servir em vez do servidor real
2. **UI: Mock Manager** — ativar/desativar mock por tool, editar resposta mockada
3. **UI: Multi-Server Tabs** — abas lado a lado (ou vertical) para diferentes servidores
4. **Sync de estado entre abas** — compartilhar mocks entre servidores? (pendente)
5. **Indicadores visuais** — badge "Mock" nas tools mockadas, cor diferente no log
6. **Export/Import Mocks** — salvar mocks como JSON para compartilhar

**Critério de sucesso:** Criar mock de uma tool, desligar servidor, chamar tool pelo mock, receber resposta simulada. 2 servidores rodando em abas paralelas.

**Entregáveis:** Tag `v0.3.0-beta`

---

### 🎯 Milestone 4: Debug, Diff & Export Docs (Semana 5)

**Objetivo:** Ferramentas avançadas de documentação e debug.

**Tarefas:**
1. **UI: Logs Timeline** — JSON-RCP cru lado a lado (request | response), com timestamps
2. **UI: Log Filter** — filtrar por tool, status, latência
3. **UI: Diff View** — comparar respostas de duas chamadas (antes/depois de alteração)
4. **Export Docs Engine** — gerar markdown da spec completa:
   - Tabela de tools com schemas
   - Tabela de resources com URIs
   - Tabela de prompts com argumentos
   - Exemplos de chamadas do histórico
5. **UI: Export Preview** — visualizar markdown antes de exportar
6. **Copy/Paste snippets** — botão pra copiar exemplo JSON-RCP de cada tool

**Critério de sucesso:** Exportar documentação markdown de um servidor MCP real (ex: twitter-mcp) e ela ser publicável no README do servidor.

**Entregáveis:** Tag `v0.4.0-beta`

---

### 🎯 Milestone 5: Pro Features + Licenciamento (Semana 6)

**Objetivo:** Modelo de negócio rodando.

**Tarefas:**
1. **License Manager** — validação de chave de licença local (offline-first, com verificação periódica)
2. **Gate de features** — bloquear features Pro (multi-server, replay ilimitado, mock avançado, export) atrás da licença
3. **Team Workspace backend** — compartilhar coleções de testes via JSON (vs1: file share, vs2: sync)
4. **Polimento UI** — loading states, empty states, error boundaries, dark mode
5. **Instaladores** — gerar .deb/.AppImage (Linux), .dmg (macOS), .msi (Windows) via Tauri
6. **CI/CD** — GitHub Actions com builds automáticos + `ncipollo/release-action`
7. **Landing page** — site simples com features, screenshots, pricing, download

**Critério de sucesso:** Build de produção assinado, instalação limpa, features Pro bloqueadas sem licença.

**Entregáveis:** Tag `v1.0.0` + GitHub Release com binários

---

### 🎯 Milestone 6: Lançamento + Pós-MVP (Semana 7+)

**Objetivo:** Distribuição e feedback.

**Tarefas:**
1. **Publicar no Product Hunt**
2. **Post no Hacker News** (Show HN)
3. **Post no r/mcp, r/devtools**
4. **Issu tracker** — GitHub Issues para feedback
5. **Coletar analytics** — opt-in de telemetria anônima (quantas tools chamadas, versão, OS)
6. **Prioritizar roadmap pós-lançamento** baseado em feedback real

**Métricas de sucesso:**
- 100 downloads na primeira semana
- 20 usuários ativos recorrentes
- 5 issues/PRs de feedback
- 1 conversão paga (Pro) no primeiro mês

---

## 9. Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| MCP Inspector oficial evolui e cobre nossas features | Média | Alto | Focar em diferenciais que o oficial jamais fará (desktop nativo, hot reload, mock) |
| SDK MCP muda (v1 → v2 breaking changes) | Média | Alto | Acompanhar changelog, testar com várias versões |
| Baixa adoção — "só mais uma ferramenta dev" | Média | Alto | Validar com 5 devs MCP antes de construir; landing page com waitlist |
| Tauri v2 instável | Baixa | Médio | Testar em Linux + macOS + Windows antes de release |
| Concorrência do MCPJam cresce | Baixa | Médio | MCPJam é web platform complexa; nosso público é dev individual, não enterprise |

---

## 10. Decisões Tomadas

| Questão | Decisão |
|---|---|
| SDK Bridge Strategy | Sidecar Node (via `mcp-bridge/bridge.js` usando @modelcontextprotocol/sdk) |
| Transporte SSE | StreamableHTTPClientTransport (SDK moderno, com fallback SSE legado) |
| Licença | MIT + Pro features (core aberto, features pagas) |
| UI Library | Shadcn/ui Base UI + Nova preset (não Radix) |
| Tailwind | v4 via `@tailwindcss/vite` (sem postcss) |

### Questões em Aberto

1. **Sidecar bundling:** Como empacotar o `bridge.js` + node_modules no build Tauri? (sidecar Tauri ou included resource?)
2. **Hot reload:** Usar chokidar (Node, já disponível no sidecar) ou notify (Rust, mais correto)?
3. **SQLite:** Tauri plugin sql ou sqlx/bundled do lado Rust?
4. **Testes:** Vitest pra UI, mas como testar a integração com sidecar + MCP servers reais?

## 12. Protocolo Sidecar (bridge.js)

Comunicação Rust ↔ Node via JSON-lines sobre stdin/stdout.

**Request (Rust → bridge):**
```json
{"id":"r123","type":"connect_stdio","params":{"command":"node","args":["server.js"]}}
{"id":"r124","type":"call_tool","params":{"name":"get_weather","arguments":{"city":"NYC"}}}
{"id":"r125","type":"disconnect","params":{}}
```

**Response (bridge → Rust):**
```json
{"id":"r123","type":"connected","data":{"tools":[...],"resources":[...],"prompts":[...]}}
{"id":"r124","type":"tool_result","data":{...}}
{"type":"event","event":"disconnected"}
```

**Eventos:** O bridge emite eventos assíncronos (`disconnected`, `bridge_exited`) sem `id`, roteados ao frontend via Tauri `emit`.

**Tipos suportados:** `connect_stdio`, `connect_sse`, `list_tools`, `list_resources`, `list_prompts`, `call_tool`, `read_resource`, `get_prompt`, `disconnect`.

---

## 13. Estrutura do Projeto

```
mcpilot/
├── src/                        # React frontend
│   ├── components/
│   │   ├── ui/                 # Shadcn/ui components
│   │   ├── ConnectionPanel.tsx  # Server connection form (stdio/SSE)
│   │   ├── ToolExplorer.tsx     # Tools/Resources/Prompts tabs
│   │   └── Playground.tsx       # Tool call form with JSON args
│   ├── stores/
│   │   └── mcp-store.ts         # Zustand store (connection, tools, callTool)
│   ├── lib/utils.ts             # cn() helper
│   ├── index.css                # Tailwind v4 + theme tokens
│   ├── main.tsx
│   └── App.tsx
├── src-tauri/
│   ├── mcp-bridge/              # Node.js sidecar
│   │   ├── package.json
│   │   ├── bridge.js            # JSON-line MCP client using @modelcontextprotocol/sdk
│   │   └── node_modules/
│   ├── src/lib.rs               # Rust backend: bridge process, Tauri commands
│   ├── src/main.rs
│   ├── Cargo.toml
│   └── tauri.conf.json
├── components.json              # Shadcn/ui config (Tailwind v4)
├── PRD.md
└── AGENTS.md
```

---

## 14. Como Executar

```bash
# Dev (Vite + Tauri)
pnpm tauri dev

# Frontend only (Vite)
pnpm dev

# Build
pnpm build

# Rust check (mais rápido que build completo)
cargo check              # roda em src-tauri/

# TypeScript check
npx tsc --noEmit

# Bridge deps (instalar se modificar bridge.js)
cd src-tauri/mcp-bridge && pnpm install
```
