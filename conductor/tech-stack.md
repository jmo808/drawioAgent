# Technology Stack: DrawIO Agent

## Languages

| Language | Usage | Rationale |
|----------|-------|-----------|
| **TypeScript** | Backend API server, frontend chat sidebar plugin, shared type definitions | Type safety across the full stack; shared interfaces between frontend and backend ensure contract consistency |
| **Python** | AI agent orchestration layer, LLM provider adapters, MCP tool bridge | Rich ecosystem for AI/ML integrations (LangChain, LiteLLM); fast prototyping for multi-provider LLM support |

## Backend

| Component | Technology | Rationale |
|-----------|------------|-----------|
| **API Server** | Fastify (TypeScript) | High-performance Node.js framework with native JSON schema validation, built-in WebSocket support via `@fastify/websocket`, and plugin architecture that aligns with the modular design |
| **AI Agent Service** | Python (FastAPI or standalone) | Orchestrates LLM calls, manages conversation context, and bridges to the drawio_plugin MCP tools. Communicates with the Fastify API server via internal HTTP/gRPC |
| **MCP Tool Runtime** | Node.js (drawio_plugin) | The existing `~/Development/drawio_plugin` runs as a child process or sidecar, exposing MCP tools (`init_diagram`, `add_node`, `connect`, `finalize`, etc.) via stdio or HTTP transport |
| **WebSocket Layer** | `@fastify/websocket` | Real-time bidirectional communication for chat messages, diagram state updates, and collaboration events |

## Frontend

| Component | Technology | Rationale |
|-----------|------------|-----------|
| **Diagram Editor** | draw.io (self-hosted via `jgraph/drawio` Docker image) | Official open-source editor; serves as the base application |
| **Chat Sidebar Plugin** | React 18+ (built via Vite) | Component-based UI compiled into a single JS bundle, injected into draw.io as a plugin. React provides efficient re-rendering for chat message streams |
| **Build Tool** | Vite | Fast HMR during development; produces optimized production bundle for plugin injection |

## Data Storage

| Component | Technology | Rationale |
|-----------|------------|-----------|
| **Session & Real-time State** | Redis (optional) | In-memory store for session state, chat history, and pub/sub for real-time multi-user collaboration. Enabled via Helm values when collaboration features are needed |
| **Default Mode** | Stateless (in-memory/client-side) | Simplest deployment: all state kept in browser localStorage or in-memory on the server. No external database required. Chat history persists per browser session |

## Infrastructure & Deployment

| Component | Technology | Rationale |
|-----------|------------|-----------|
| **Container Runtime** | Docker | Multi-stage builds for both TypeScript (Fastify API) and Python (AI agent) services |
| **Orchestration** | Kubernetes (via Helm chart) | Standard enterprise deployment target; Helm chart packages all components |
| **Base Image** | `jgraph/drawio` | Official self-hosted draw.io Docker image; serves the editor frontend |
| **Ingress** | Configurable (nginx-ingress, Traefik, etc.) | Defined in Helm `values.yaml`; supports TLS termination |

## AI/LLM Integration

| Component | Technology | Rationale |
|-----------|------------|-----------|
| **LLM Abstraction** | LiteLLM or custom adapter pattern (Python) | Unified interface for OpenAI, Gemini, Claude, and Ollama; swap providers via config |
| **MCP Protocol** | stdio transport (Node.js child process) | The drawio_plugin MCP server communicates via stdin/stdout JSON-RPC; the Python agent service spawns and manages it |

## Testing

| Component | Technology | Rationale |
|-----------|------------|-----------|
| **TypeScript Tests** | Vitest | Fast, Vite-native test runner; works for both frontend and backend TypeScript |
| **Python Tests** | pytest | Standard Python test framework with rich plugin ecosystem |
| **E2E Tests** | Playwright | Browser automation for testing the full draw.io + sidebar integration |
| **Helm Tests** | `helm test` + `helm lint` | Validates chart structure and deployment health |

## Key Dependencies

| Package | Version | Purpose |
|---------|---------|--------|
| `@drawio/mcp` | `^1.3.4` | Upstream draw.io MCP server (bundled in drawio_plugin) |
| `@xmldom/xmldom` | `^0.9.10` | XML parsing for diagram manipulation |
| `fastify` | `^5.x` | Backend API framework |
| `@fastify/websocket` | `^11.x` | WebSocket support |
| `react` | `^18.x` | Frontend sidebar UI |
| `vite` | `^6.x` | Frontend build tool |
| `litellm` | `latest` | Python LLM provider abstraction |
