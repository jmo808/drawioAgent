# Specification: Build DrawIO Agent MVP

## Overview
Build a complete, Helm-deployable platform that extends the self-hosted draw.io editor with an AI-powered chat sidebar. The sidebar enables users to generate and modify native draw.io diagrams via natural language, powered by a multi-provider LLM backend and the drawio_plugin MCP tools.

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────┐
│                    Kubernetes Cluster                     │
│                                                          │
│  ┌──────────────────────┐   ┌────────────────────────┐  │
│  │  draw.io Frontend    │   │  Fastify API Server    │  │
│  │  (jgraph/drawio +    │◄──┤  (TypeScript)          │  │
│  │   React sidebar      │   │  - WebSocket handler   │  │
│  │   plugin bundle)     │   │  - Auth middleware      │  │
│  │                      │   │  - Health endpoints     │  │
│  └──────────────────────┘   └──────────┬─────────────┘  │
│                                         │                │
│                                         ▼                │
│                              ┌────────────────────────┐  │
│                              │  Python AI Agent       │  │
│                              │  - LLM orchestration   │  │
│                              │  - Provider adapters   │  │
│                              │  - MCP tool bridge     │  │
│                              │  - Conversation mgmt   │  │
│                              └──────────┬─────────────┘  │
│                                         │ stdio/JSON-RPC │
│                                         ▼                │
│                              ┌────────────────────────┐  │
│                              │  drawio_plugin MCP     │  │
│                              │  (Node.js child proc)  │  │
│                              │  - Builder tools       │  │
│                              │  - Validation pipeline │  │
│                              │  - Domain experts      │  │
│                              └────────────────────────┘  │
│                                                          │
│  ┌──────────────────────┐                                │
│  │  Redis (optional)    │                                │
│  │  - Session state     │                                │
│  │  - Pub/Sub collab    │                                │
│  └──────────────────────┘                                │
└─────────────────────────────────────────────────────────┘
```

### Communication Flow
1. **User → draw.io + sidebar plugin** (browser): User types in the chat sidebar
2. **Sidebar plugin → Fastify API** (WebSocket): Chat message sent over WS
3. **Fastify API → Python Agent** (internal HTTP): Request forwarded to AI agent
4. **Python Agent → LLM** (HTTP/gRPC): Prompt sent to configured LLM provider
5. **Python Agent → MCP Server** (stdio JSON-RPC): AI generates MCP tool calls
6. **MCP Server → Python Agent** (stdio JSON-RPC): Tool results returned
7. **Python Agent → Fastify API → Sidebar** (WebSocket): Diagram XML streamed back
8. **Sidebar plugin → draw.io canvas** (draw.io Plugin API): XML injected into editor

### Data Flow for Diagram Generation
1. User sends natural language prompt
2. AI agent constructs system prompt with drawio_plugin SKILL.md context
3. AI calls LLM with prompt + tool definitions (MCP tool schemas)
4. LLM returns tool calls (`init_diagram`, `add_container`, `add_node`, `connect`, `finalize`)
5. Agent executes each tool call against the MCP server sequentially
6. `finalize` runs topological corrections + validation
7. Final XML is returned to the frontend and injected into draw.io's mxGraph model

## Component Specifications

### 1. Helm Chart (`chart/drawio-agent/`)
- `Chart.yaml` — name: drawio-agent, version: 0.1.0, appVersion: 0.1.0
- `values.yaml` — all configurable parameters with sensible defaults
- `templates/` — Deployment, Service, Ingress, ConfigMap, Secret manifests
- `templates/NOTES.txt` — post-install instructions
- `templates/_helpers.tpl` — label/name template helpers
- Supports optional Redis subchart toggle

### 2. Fastify API Server (`services/api/`)
- TypeScript, Fastify 5.x with `@fastify/websocket`
- Routes: `GET /health`, `GET /ready`, `WS /ws/chat`
- Auth middleware: API key validation from Kubernetes Secret
- Proxies chat messages to the Python AI agent service
- Streams AI responses back to the client via WebSocket frames

### 3. Python AI Agent (`services/agent/`)
- Python 3.12, using LiteLLM for multi-provider LLM abstraction
- HTTP API (FastAPI or bare ASGI) for receiving requests from Fastify
- MCP client: spawns `drawio_plugin/scripts/mcp-wrapper.js` as a child process
- Conversation manager: maintains chat history per session
- Provider adapters: OpenAI, Gemini, Claude, Ollama
- Configurable via environment variables (LLM provider, API keys, MCP path)

### 4. React Chat Sidebar Plugin (`frontend/sidebar/`)
- React 18+, built with Vite
- Compiled to single JS bundle (`drawio-agent-plugin.js`)
- Injected into draw.io via the plugin mechanism
- Components: ChatPanel, MessageList, MessageInput, ProviderSelector, TemplateLibrary
- WebSocket client for real-time communication with API server
- Adaptive theme: reads draw.io's current theme and matches styling

### 5. Docker Images
- `drawio-frontend` — `jgraph/drawio` + plugin JS bundle + nginx config override
- `drawio-api` — Node.js 22 + Fastify API server
- `drawio-agent` — Python 3.12 + AI agent + bundled drawio_plugin + Node.js runtime

### 6. Template Library (`templates/`)
- JSON spec files for common architecture patterns
- AWS: 3-tier web app, microservices, serverless
- GCP: GKE cluster, Cloud Run, data pipeline
- Azure: AKS, App Service, Event-driven

## Dependencies on drawio_plugin
The project depends on the drawio_plugin (`~/Development/drawio_plugin`) for:
- **MCP server** (`scripts/mcp-wrapper.js`) — spawned as a child process by the Python agent
- **Builder tools** — `init_diagram`, `add_container`, `add_node`, `connect`, `finalize`, etc.
- **Validation pipeline** (`scripts/validate.js`) — runs at finalize time
- **Domain experts** (`skills/drawio/references/`) — AWS, PFD, P&ID reference docs
- **SKILL.md** — system prompt context for the AI agent's diagram generation behavior

The drawio_plugin is bundled into the Python agent's Docker image at build time via `COPY`.
