# MCPilot

MCPilot é um aplicativo desktop para inspecionar, testar e depurar servidores [Model Context Protocol (MCP)](https://modelcontextprotocol.io/). Ele funciona como um playground visual para o protocolo: conecta-se ao servidor, exibe sua especificação e permite executar ferramentas sem depender de um cliente de chat.

Construído com Tauri v2, React e TypeScript, o projeto prioriza um ciclo de desenvolvimento local rápido, persistência e recursos de diagnóstico para quem desenvolve ou mantém servidores MCP.

## Principais recursos

- Conexão com servidores MCP por `stdio` ou HTTP/Streamable HTTP.
- Explorador de tools, resources e prompts, incluindo schemas e metadados.
- Playground para executar tools com argumentos JSON e visualizar respostas formatadas.
- Histórico local persistente de chamadas, com replay e marcação de referências.
- Hot reload: monitora um diretório e reconecta o servidor quando seu código muda.
- Modo mock: salva respostas, intercepta chamadas e permite testar sem o servidor real.
- Abas para múltiplos servidores MCP conectados simultaneamente.
- Timeline de logs, filtros e comparação de respostas.
- Exportação de documentação Markdown da especificação e de exemplos do histórico.
- Licenciamento local, com recursos Pro protegidos por feature gate.

## Arquitetura

```text
React frontend
  │  Tauri IPC
  ▼
Rust backend (processos, comandos e file watcher)
  │  JSON Lines via stdin/stdout
  ▼
Node.js sidecar (@modelcontextprotocol/sdk)
  │  stdio ou HTTP
  ▼
Servidor MCP
```

O frontend usa Zustand para estado e Shadcn/ui com Tailwind CSS. O backend Rust mantém e encaminha requisições para um sidecar Node.js, que usa o SDK oficial do MCP para falar com o servidor conectado. O histórico é armazenado localmente em SQLite.

## Pré-requisitos

- [Node.js](https://nodejs.org/) compatível com as dependências do projeto.
- [pnpm](https://pnpm.io/).
- [Rust](https://www.rust-lang.org/tools/install) e os pré-requisitos de sistema do [Tauri v2](https://v2.tauri.app/start/prerequisites/).

## Como executar

Instale as dependências do frontend e do sidecar:

```bash
pnpm install
pnpm --dir src-tauri/mcp-bridge install
```

Inicie o aplicativo desktop em desenvolvimento:

```bash
pnpm tauri dev
```

Para executar apenas o frontend Vite:

```bash
pnpm dev
```

O sidecar fica em `src-tauri/mcp-bridge`. Quando necessário, gere seu bundle manualmente com:

```bash
pnpm --dir src-tauri/mcp-bridge build
```

O build de produção já prepara e empacota o sidecar automaticamente:

```bash
pnpm tauri build
```

## Qualidade e verificações

```bash
# Testes unitários
pnpm test

# Verificação de tipos e build do frontend
pnpm build

# Verificação do backend Rust
cd src-tauri && cargo check
```

## Estrutura do projeto

```text
src/
├── components/          Interface: conexão, explorer, playground, histórico, logs e mocks
├── lib/                 Geração de docs, feature gates e utilitários
├── stores/              Estado Zustand: MCP, abas, histórico, mocks e licença
└── App.tsx              Composição da aplicação

src-tauri/
├── mcp-bridge/          Cliente MCP Node.js usado como sidecar
├── src/lib.rs           Processo bridge, comandos Tauri e file watcher
└── tauri.conf.json      Configuração e empacotamento do aplicativo

PRD.md                   Requisitos de produto e roadmap
```

## Protocolo do sidecar

O Rust e o sidecar se comunicam por objetos JSON, um por linha. Exemplos:

```json
{"id":"r123","type":"connect_stdio","params":{"command":"node","args":["server.js"]}}
{"id":"r124","type":"call_tool","params":{"name":"get_weather","arguments":{"city":"São Paulo"}}}
```

As principais operações são `connect_stdio`, `connect_sse`, `list_tools`, `list_resources`, `list_prompts`, `call_tool`, `read_resource`, `get_prompt` e `disconnect`. Eventos assíncronos, como desconexões, são encaminhados ao frontend pelo backend Tauri.

## Status e roadmap

Os recursos previstos nos marcos M1 a M5 — do Tool Explorer ao licenciamento — estão implementados no repositório. Os próximos itens de produto são a reinicialização automática do processo do servidor após falha e uma landing page.

Consulte o [PRD](./PRD.md) para o contexto do problema, personas, decisões técnicas, modelo de produto e roadmap detalhado.

## Versionamento e releases

Depois que as verificações da CI passam em um push para `main`, o release é calculado com [Conventional Commits](https://www.conventionalcommits.org/). As tags seguem o formato `vMAJOR.MINOR.PATCH`:

- `feat: ...` gera uma versão minor.
- `fix: ...` ou `perf: ...` gera uma versão patch.
- `feat!: ...` ou um rodapé `BREAKING CHANGE:` gera uma versão major.
- Outros tipos, como `docs:` e `chore:`, não geram release.

## Licença

O produto foi planejado com núcleo MIT e recursos Pro licenciados. Antes de uma distribuição pública, a licença do repositório deve ser formalizada em um arquivo `LICENSE`.
