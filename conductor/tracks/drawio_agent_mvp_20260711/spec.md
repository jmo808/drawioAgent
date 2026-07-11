# Specification: Build DrawIO Agent MVP

## Overview
Build a complete, Helm-deployable platform that extends the self-hosted draw.io editor with an AI-powered chat sidebar. The sidebar enables users to generate and modify native draw.io diagrams via natural language, powered by a multi-provider LLM backend and the drawio_plugin MCP tools.

## Architectural Decisions Record

The following decisions were resolved during design review and are binding for implementation.

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| AD-1 | Plugin injection | Baked into Docker image via custom `PreConfig.js` | Most reliable for production; no volume mount issues or URL quirks |
| AD-2 | Plugin DOM strategy | Same-origin DOM injection (React IIFE in draw.io's window context) | Full access to `EditorUi`, `mxGraph`, `mxGraphModel` APIs for direct XML manipulation |
| AD-3 | Diagram state ownership | Backend-owned via MCP state | AI operates on backend state; frontend is display layer |
| AD-4 | LLM tool calling | Native function calling via LiteLLM | All 4 providers support function/tool calling; LiteLLM normalizes the interface |
| AD-5 | Streaming granularity | Per-tool-call progress updates, final XML at end | Clear progress feedback without progressive XML rendering complexity |
| AD-6 | Fastify ↔ Agent comms | HTTP + Server-Sent Events (SSE) | Simple, debuggable; FastAPI's `StreamingResponse` maps naturally to SSE |
| AD-7 | MCP server lifecycle | Long-lived child process (spawn once, reuse) | Sub-millisecond tool call latency; matches MCP protocol's persistent session design |
| AD-8 | WebSocket protocol | Typed JSON envelope `{type, payload, id, timestamp}` | Simple, debuggable in DevTools, extensible |
| AD-9 | K8s pod architecture | Separate Deployments per service | Independent scaling; AI agent is CPU-heavy, frontend/API are lightweight |
| AD-10 | Authentication | Static API key (Kubernetes Secret) | Sufficient for MVP; upgradeable to JWT/OAuth2 later. ⚠️ TRA F-01 (CRITICAL): Replace with OIDC/JWT in Track 5 |
| AD-11 | Collaboration | Deferred to post-MVP (Track 2) | Single-user sessions for MVP; dramatically simplifies state management |
| AD-12 | System prompt | SKILL.md + dynamic tool schemas + on-demand reference docs | Compact core prompt; reference docs loaded only when relevant |
| AD-13 | API URL discovery | Same-origin (reverse proxy / Gateway API) | Zero CORS, zero config; plugin connects to `wss://current-host/ws/chat` |
| AD-14 | K8s routing | Gateway API `HTTPRoute` (Cilium) + nginx for local docker-compose | Production uses Gateway API; local dev uses nginx reverse proxy |
| AD-15 | Template format | JSON specs → `compile_json_spec` MCP tool | Structured, maintainable, rendered through validation pipeline |
| AD-16 | Python framework | FastAPI (async, SSE via `StreamingResponse`, Pydantic) | Natural fit for async Python with SSE and auto-generated OpenAPI docs |
| AD-17 | LLM abstraction | LiteLLM with thin `LLMService` wrapper class | Unified API across 100+ providers; thin wrapper for testability |
| AD-18 | XML application | Full canvas replacement via `editor.setGraphXml()` | Backend owns state; replacement is safe with snapshot-before-request |
| AD-19 | Edit preservation | Snapshot-before-request pattern | Plugin sends current canvas XML with each chat message; backend applies AI changes on top |
| AD-20 | Agent Docker image | Multi-runtime (Python + Node.js in `debian:bookworm-slim`) | Both runtimes needed; eliminates HTTP-to-stdio bridge |

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Kubernetes Cluster (Cilium + Gateway API)         │
│                                                                      │
│  ┌─────────────────┐         ┌───────────────────────────────────┐  │
│  │  Gateway         │────────▶│  HTTPRoute                        │  │
│  │  (Cilium)        │         │  /* → frontend-svc                │  │
│  │                  │         │  /api/* → api-svc                 │  │
│  │                  │         │  /ws/*  → api-svc                 │  │
│  └─────────────────┘         └───────────────────────────────────┘  │
│                                                                      │
│  ┌──────────────────────┐   ┌────────────────────────────────┐      │
│  │  draw.io Frontend    │   │  Fastify API Server            │      │
│  │  Deployment          │   │  Deployment                    │      │
│  │                      │   │                                │      │
│  │  jgraph/drawio +     │   │  TypeScript / Fastify 5.x     │      │
│  │  PreConfig.js +      │   │  - WS /ws/chat                │      │
│  │  drawio-agent-       │   │  - Auth middleware (API key)   │      │
│  │  plugin.js (React    │   │  - GET /health, /ready         │      │
│  │  IIFE bundle)        │   │  - SSE proxy to agent          │      │
│  └──────────────────────┘   └──────────────┬─────────────────┘      │
│                                             │ HTTP + SSE             │
│                                             ▼                        │
│                              ┌────────────────────────────────┐      │
│                              │  Python AI Agent               │      │
│                              │  Deployment                    │      │
│                              │                                │      │
│                              │  FastAPI + LiteLLM             │      │
│                              │  - POST /api/chat (SSE)        │      │
│                              │  - GET /api/providers           │      │
│                              │  - GET /health                  │      │
│                              │  - ConversationManager          │      │
│                              │  - AgentOrchestrator            │      │
│                              └──────────────┬─────────────────┘      │
│                                             │ stdio / JSON-RPC       │
│                                             ▼                        │
│                              ┌────────────────────────────────┐      │
│                              │  drawio_plugin MCP Server      │      │
│                              │  (long-lived child process)    │      │
│                              │                                │      │
│                              │  Node.js / mcp-wrapper.js      │      │
│                              │  - Builder tools (13)          │      │
│                              │  - Validation pipeline         │      │
│                              │  - Domain experts              │      │
│                              └────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────────────┘
```

### Communication Flow
1. **User → draw.io + sidebar plugin** (browser): User types in the chat sidebar
2. **Plugin snapshots canvas XML** — serializes current `mxGraphModel` including any manual edits (AD-19)
3. **Sidebar plugin → Fastify API** (WebSocket): `{type: 'chat_message', payload: {text, diagramXml, sessionId}}` (AD-8)
4. **Fastify API → Python Agent** (HTTP POST + SSE): POST `/api/chat` with message + current XML (AD-6)
5. **Python Agent → LLM** (HTTP): Prompt with SKILL.md context + MCP tool schemas as function definitions (AD-4, AD-12)
6. **LLM → Python Agent**: Structured tool calls (`init_diagram`, `add_container`, etc.) (AD-4)
7. **Python Agent → MCP Server** (stdio JSON-RPC): Execute each tool call sequentially (AD-7)
8. **Python Agent → Fastify API** (SSE events): Per-tool-call progress updates streamed back (AD-5)
9. **Fastify API → Sidebar** (WebSocket frames): Progress events relayed as typed JSON envelopes (AD-8)
10. **MCP `finalize`** → topological corrections + validation → final XML
11. **Final XML → Sidebar** (WebSocket): `{type: 'diagram_update', payload: {xml}}`
12. **Sidebar → draw.io canvas**: `editor.setGraphXml(xmlDoc)` — full canvas replacement (AD-18)

### Snapshot-Before-Request Pattern (AD-19)
Before sending a chat message, the plugin:
1. Calls `editor.getGraphXml()` to serialize the current canvas state
2. Includes the serialized XML in the WebSocket message payload
3. The backend agent initializes the MCP session with this XML as the starting state
4. AI tool calls operate on top of the user's latest state
5. The returned XML after `finalize` includes both user edits AND AI modifications
6. Full replacement via `setGraphXml()` is safe because nothing is lost

### WebSocket Protocol (AD-8)
Every WebSocket message follows the typed JSON envelope format:
```typescript
interface WebSocketMessage {
  type: 'chat_message' | 'tool_progress' | 'diagram_update' | 'error' | 'provider_change' | 'template_select' | 'diagram_state_sync';
  payload: Record<string, unknown>;
  id?: string;        // request-response correlation
  timestamp: string;  // ISO 8601
}
```

## Component Specifications

### 1. Helm Chart (`chart/drawio-agent/`)
- `Chart.yaml` — name: drawio-agent, version: 0.1.0, appVersion: 0.1.0
- `values.yaml` — all configurable parameters with sensible defaults
- `templates/` — Deployment, Service, HTTPRoute, ConfigMap, Secret manifests
- `templates/NOTES.txt` — post-install instructions
- `templates/_helpers.tpl` — label/name/selector template helpers
- **No Ingress** — uses Gateway API `HTTPRoute` for path-based routing (AD-14)
- Optional Valkey inline template stub (for future Track 2 collaboration, gated by `collaboration.enabled`)

### 2. Fastify API Server (`services/api/`)
- TypeScript, Fastify 5.x with `@fastify/websocket`
- Routes: `GET /health`, `GET /ready`, `WS /ws/chat`
- Auth middleware: static API key from Kubernetes Secret env var (AD-10)
- SSE proxy: POSTs to Python agent's `/api/chat`, relays SSE events as WebSocket frames (AD-6)
- Message format: typed JSON envelope (AD-8)

### 3. Python AI Agent (`services/agent/`)
- Python 3.12, FastAPI (AD-16), LiteLLM (AD-17)
- HTTP endpoints: `GET /health`, `POST /api/chat` (SSE streaming), `GET /api/providers`
- `LLMService` — thin wrapper around LiteLLM's `acompletion()` with tools parameter (AD-17)
- `MCPBridge` — spawns `mcp-wrapper.js` as long-lived child process, JSON-RPC over stdio (AD-7)
- `ConversationManager` — session-based in-memory chat history, system prompt builder with SKILL.md content (AD-12)
- `AgentOrchestrator` — main loop: receive prompt → snapshot XML → call LLM → execute tool calls → stream progress → return final XML (AD-3, AD-4, AD-5)
- MCP tool schemas discovered at startup via `tools/list` and exposed as LLM function definitions (AD-12)
- Reference docs loaded on-demand based on prompt content (AD-12)

### 4. React Chat Sidebar Plugin (`frontend/sidebar/`)
- React 18+, built with Vite into single IIFE bundle `drawio-agent-plugin.js` (AD-2)
- Entry point: `Draw.loadPlugin(function(ui) { ... })` (AD-1)
- Same-origin DOM injection: creates `<div>` sidebar, mounts React app (AD-2)
- Components: ChatPanel, MessageList, MessageInput, ProviderSelector, TemplateLibrary
- `drawioBridge` module: interfaces with `EditorUi`, `mxGraph`, `mxGraphModel` APIs (AD-18)
- Snapshot-before-request: serializes canvas XML before each chat message (AD-19)
- WebSocket client: connects to `wss://current-host/ws/chat` (AD-13)
- Adaptive theming: reads draw.io's active theme and matches styling

### 5. Docker Images
- **drawio-frontend** (AD-1): `jgraph/drawio` base + `drawio-agent-plugin.js` + custom `PreConfig.js`
- **drawio-api**: `node:22-slim` multi-stage build (build → runtime)
- **drawio-agent** (AD-20): Multi-stage — stage 1: `node:22-slim` for MCP deps; stage 2: `python:3.12-slim` for agent deps; final: `debian:bookworm-slim` with both runtimes

### 6. Local Development (`docker-compose.yml`)
- nginx reverse proxy container for path-based routing (AD-14)
- draw.io frontend, Fastify API, Python agent services
- Volume mounts for hot-reload during development
- No Kubernetes/Gateway API dependency for local dev

### 7. Template Library (`templates/architectures/`)
- JSON spec files matching drawio_plugin's `compile_json_spec` schema (AD-15)
- AWS: 3-tier web app, microservices
- GCP: GKE cluster
- Azure: AKS
- Bundled in the Python agent's Docker image

## Scope Exclusions (Deferred to Future Tracks)
- Multi-user collaboration / shared sessions (Track 2)
- Valkey integration for pub/sub (Track 2)
- CI/CD pipeline and automated image publishing (Track 3)
- Prometheus metrics, Grafana dashboards, OpenTelemetry tracing (Track 4)
- Rate limiting, circuit breakers, PodDisruptionBudgets (Track 4)
- OIDC/JWT authentication — replaces static API key (Track 5, F-01 CRITICAL)
- MCP sandboxing & prompt injection defenses (Track 5, F-02/F-05 HIGH)
- LLM data flow controls & content filtering (Track 5, F-03/F-07 HIGH)
- NPX fallback removal & supply chain hardening (Track 5, F-04 HIGH)
- Security audit logging (Track 5, F-08 HIGH)
- Privacy notice & consent mechanism (Track 5, F-13 MEDIUM)
- Diagram version history

## TRA Security Notes
A pre-implementation Technology Risk Assessment (TRA-Report.html) identified the following items that impact MVP design but are remediated in Track 5:

| Finding | Severity | MVP Impact | Track 5 Phase |
|---------|----------|------------|---------------|
| F-01: Static API key auth | CRITICAL | AD-10 accepted for MVP; Track 5 upgrades to OIDC/JWT | Phase 1 |
| F-02: Prompt injection → MCP | HIGH | No guardrails between LLM output and MCP execution in MVP | Phase 2 |
| F-04: NPX fallback supply chain | HIGH | mcp-wrapper.js npx fallback present in MVP Docker image | Phase 3 |
| F-05: MCP path traversal | HIGH | validate_file/compile_json_spec accept arbitrary paths | Phase 2 |
| F-06: MCP inherits secrets | HIGH | Child process receives full parent environment | Phase 2 |
| F-19: No API versioning | LOW | MVP routes are unversioned; Track 5 adds /api/v1/ | Phase 6 |

## Dependencies on drawio_plugin
The project depends on `~/Development/drawio_plugin` for:
- **MCP server** (`scripts/mcp-wrapper.js`) — spawned as long-lived child process by Python agent
- **Builder tools** — `init_diagram`, `add_container`, `add_node`, `connect`, `finalize`, etc.
- **Validation pipeline** (`scripts/validate.js`) — runs at finalize time
- **JSON spec compiler** (`scripts/build-diagram.js`) — compiles template JSON specs
- **Domain experts** (`skills/drawio/references/`) — AWS, PFD, P&ID reference docs
- **SKILL.md** — system prompt context for AI agent's diagram generation behavior

The drawio_plugin is bundled into the Python agent's Docker image at build time via `COPY`.

## Project Structure
```
drawioAgent/
├── chart/
│   └── drawio-agent/
│       ├── Chart.yaml
│       ├── values.yaml
│       ├── templates/
│       │   ├── _helpers.tpl
│       │   ├── frontend-deployment.yaml
│       │   ├── frontend-service.yaml
│       │   ├── api-deployment.yaml
│       │   ├── api-service.yaml
│       │   ├── agent-deployment.yaml
│       │   ├── agent-service.yaml
│       │   ├── httproute.yaml
│       │   ├── secrets.yaml
│       │   ├── configmap.yaml
│       │   ├── NOTES.txt
│       │   └── tests/
│       │       └── test-connection.yaml
│       └── README.md
├── services/
│   ├── api/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── app.ts
│   │   │   ├── plugins/
│   │   │   │   ├── auth.ts
│   │   │   │   └── websocket.ts
│   │   │   ├── routes/
│   │   │   │   ├── health.ts
│   │   │   │   └── chat.ts
│   │   │   └── services/
│   │   │       └── agent-proxy.ts
│   │   ├── test/
│   │   └── Dockerfile
│   └── agent/
│       ├── pyproject.toml
│       ├── requirements.txt
│       ├── src/
│       │   └── agent/
│       │       ├── __init__.py
│       │       ├── main.py
│       │       ├── llm_service.py
│       │       ├── mcp_bridge.py
│       │       ├── conversation.py
│       │       ├── orchestrator.py
│       │       └── config.py
│       ├── tests/
│       └── Dockerfile
├── frontend/
│   └── sidebar/
│       ├── package.json
│       ├── vite.config.ts
│       ├── tsconfig.json
│       ├── src/
│       │   ├── plugin-entry.ts
│       │   ├── App.tsx
│       │   ├── components/
│       │   │   ├── ChatPanel.tsx
│       │   │   ├── MessageList.tsx
│       │   │   ├── MessageInput.tsx
│       │   │   ├── Message.tsx
│       │   │   ├── ProviderSelector.tsx
│       │   │   └── TemplateLibrary.tsx
│       │   ├── hooks/
│       │   │   ├── useWebSocket.ts
│       │   │   └── useChatStore.ts
│       │   ├── services/
│       │   │   └── drawioBridge.ts
│       │   └── styles/
│       │       └── theme.css
│       ├── test/
│       └── Dockerfile
├── packages/
│   └── shared/
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── types.ts
│           ├── schemas.ts
│           └── validators.ts
├── templates/
│   └── architectures/
│       ├── aws-3tier.json
│       ├── aws-microservices.json
│       ├── gcp-gke.json
│       └── azure-aks.json
├── docker-compose.yml
├── nginx.conf
├── package.json  (root workspace)
├── tsconfig.json (root)
└── README.md
```
