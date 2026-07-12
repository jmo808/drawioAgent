# Draw.io AI Agent

A self-hosted diagramming platform that extends the open-source **Draw.io** editor with an AI-powered conversational sidebar.

Draw.io AI Agent allows development teams, engineers, and architects to generate, modify, and refine diagrams (native Draw.io XML) in real-time using natural language. It packages the Draw.io editor, a Fastify API backend, and a Python AI orchestrator service deployable via Helm or run locally via Docker Compose.

---

## 🏗️ Architecture & Component Flow

```
┌────────────────────────────────────────────────────────┐
│                      Web Browser                       │
│ ┌──────────────────────────────┐ ┌───────────────────┐ │
│ │  Draw.io Editor (Tomcat)     │ │ React Sidebar     │ │
│ │  (Embeds drawio-agent-plugin)│ │ (Vite/TypeScript) │ │
│ └──────────────┬───────────────┘ └─────────▲─────────┘ │
└────────────────┼───────────────────────────┼───────────┘
                 │ (Diagram State)           │ (Events & Updates)
                 │                           │
                 ▼                           │ (WebSocket)
┌────────────────────────────────────────────┴───────────┐
│              Fastify API Gateway (Node.js)             │
└────────────────────────┬───────────────────────────────┘
                         │ (SSE - Server-Sent Events)
                         ▼
┌────────────────────────────────────────────────────────┐
│                 Python Agent Service                   │
│   ┌────────────────────────────────────────────────┐   │
│   │           Orchestrator (FastAPI)               │   │
│   └───────────────────────┬────────────────────────┘   │
│                           │ (JSON RPC over Stdio)      │
│                           ▼                            │
│   ┌────────────────────────────────────────────────┐   │
│   │           Draw.io MCP Server (Node)            │   │
│   └────────────────────────────────────────────────┘   │
└───────────────────────────┬────────────────────────────┘
                            │ (LiteLLM)
                            ▼
               ┌──────────────────────────┐
               │   AI LLM Provider        │
               │ (Gemini/OpenAI/Ollama/...)│
               └──────────────────────────┘
```

1.  **React Sidebar (`frontend/sidebar/`):** React-based conversational drawer embedded directly within Draw.io. Loads dynamic templates and communicates via WebSockets.
2.  **API Gateway (`services/api/`):** Node.js Fastify service that coordinates authentication (API Key validation) and proxies WebSockets to the Python service.
3.  **Agent Orchestrator (`services/agent/`):** FastAPI orchestrator running LiteLLM. It accepts SSE chat inputs, fetches the current diagram XML context, invokes MCP layout tools, and pushes canvas updates.
4.  **Draw.io MCP Server (`packages/drawio-mcp`):** Bridges natural language to structural diagram steps (`init_diagram`, `add_node`, `connect`, etc.) and compiles declarative JSON specs into standard Draw.io XML.

---

## 🚀 Quickstart (Local Development)

The entire Draw.io Agent stack is pre-configured to run locally via Docker Compose.

### Prerequisites
*   Docker & Docker Compose (or Podman)
*   Node.js v20+ & npm (optional, for local frontend/plugin build)

### Running the Stack
To start the standard development and demo stack:
```bash
docker compose up --build -d
```

Once up, access the applications at:
*   **Draw.io Editor with AI Sidebar:** [http://localhost:8080](http://localhost:8080)
*   **Fastify API Gateway:** [http://localhost:3000](http://localhost:3000)
*   **Python Agent Service:** [http://localhost:8000](http://localhost:8000)

---

## ⚙️ Configuration & LLM Providers

The agent service uses **LiteLLM**, making it compatible with a wide array of LLM backends. You can configure the LLM provider by editing the environment variables in `docker-compose.yml` or supplying them via K8s/Helm.

| Environment Variable | Description | Example (OpenAI) | Example (Gemini) | Example (Ollama) |
| :--- | :--- | :--- | :--- | :--- |
| `LLM_PROVIDER` | Core model provider class. | `openai` | `gemini` | `ollama` |
| `LLM_MODEL` | The model name passed to LiteLLM. | `gpt-4o` | `gemini/gemini-2.5-pro` | `ollama/llama3` |
| `LLM_API_KEY` | Your developer API secret token. | `sk-proj-...` | `AIzaSy...` | `none` |
| `OPENAI_API_BASE` | Alternative backend host. | (Omit) | (Omit) | `http://host.docker.internal:11434/v1` |

---

## 🔒 Air-Gapped & Offline Deployments

For secure, private, or completely offline enterprise networks:

1.  **Local LLM with Ollama:** Run Ollama locally on your developer machine or a dedicated server.
    ```bash
    ollama run llama3
    ```
2.  **Update Environment Config:** Update the Docker Compose or Helm configurations:
    ```yaml
    LLM_PROVIDER: "ollama"
    LLM_MODEL: "ollama/llama3"
    LLM_API_KEY: "none"
    OPENAI_API_BASE: "http://host.docker.internal:11434/v1"
    ```
3.  **Deploy Private Images:** Build and push the Docker images (`frontend/sidebar`, `services/api`, `services/agent`) to your private image registry and deploy via Helm.

---

## 🤝 Contributing & Testing

### Development Flow
The monorepo structure is managed using **npm workspaces**:
```bash
# Install all root and workspace dependencies
npm install --legacy-peer-deps

# Build the shared packages
npm run build -w @drawio-agent/shared

# Run Vite development server for the sidebar plugin
npm run dev -w sidebar
```

### Integration Testing (Playwright)
To execute the automated end-to-end user flows verifying WebSocket connection, template rendering, and diagram canvas compilation:
```bash
# Ensure the test stack is running
docker compose -f docker-compose.test.yml up -d

# Run the Playwright suite
npx playwright test
```
All tests verify UI components, layout integration, and the MCP compile engine.

---

## 📦 Kubernetes Deployment
Refer to the detailed [Helm Chart Documentation](chart/drawio-agent/README.md) for ingress, Gateway API routing, persistent volumes, and secure cluster-wide deployments.
