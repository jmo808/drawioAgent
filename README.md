<p align="center">
  <img src="https://img.shields.io/badge/Draw.io-AI%20Agent-0078D7?style=for-the-badge&logo=diagramsdotnet&logoColor=white" alt="Draw.io AI Agent"/>
</p>

<h1 align="center">Draw.io AI Agent</h1>

<p align="center">
  <strong>Self-hosted diagramming platform that extends the open-source Draw.io editor with an AI-powered conversational sidebar.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="License"/>
  <img src="https://img.shields.io/badge/docker-compose-2496ED?style=flat-square&logo=docker&logoColor=white" alt="Docker"/>
  <img src="https://img.shields.io/badge/helm-v3-0F1689?style=flat-square&logo=helm&logoColor=white" alt="Helm"/>
  <img src="https://img.shields.io/badge/python-3.11+-3776AB?style=flat-square&logo=python&logoColor=white" alt="Python"/>
  <img src="https://img.shields.io/badge/node-20+-339933?style=flat-square&logo=node.js&logoColor=white" alt="Node.js"/>
  <img src="https://img.shields.io/badge/typescript-5.3-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript"/>
</p>

---

Draw.io AI Agent allows development teams, engineers, and architects to **generate, modify, and refine diagrams** (native Draw.io XML) in real-time using natural language. It packages the Draw.io editor, a Fastify API gateway, and a Python AI orchestrator service — deployable via **Helm** or run locally via **Docker Compose**.

## ✨ Key Features

| Feature | Description |
|:---|:---|
| 🧠 **Natural Language Diagramming** | Describe your architecture in plain English — the AI generates draw.io XML with correct shapes, connections, and layout |
| 🔌 **MCP Tool Protocol** | Uses the Model Context Protocol (MCP) for structured, step-by-step diagram construction (`init_diagram`, `add_node`, `connect`, `finalize`) |
| 🏗️ **Domain Expert System** | Built-in shape and validation specialists for AWS, GCP, Kubernetes, flowcharts, sequence diagrams, ER diagrams, and more |
| ⚡ **Real-time Streaming** | SSE-based progress streaming with live canvas updates as the AI builds your diagram |
| 🔄 **Multi-LLM Support** | Switch between Gemini, OpenAI, Ollama, Anthropic, or any LiteLLM-compatible provider with a single env var |
| 🏢 **Air-Gap Ready** | Run fully offline with Ollama — no cloud LLM calls required |
| ☸️ **Production-Ready** | Helm chart with Gateway API routing, persistent volumes, health probes, and autoscaling |
| 🧪 **E2E Tested** | Playwright integration tests covering WebSocket flows, template rendering, and diagram compilation |

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

## 📂 Project Structure

```
drawioAgent/
├── frontend/
│   └── sidebar/           # React + Vite sidebar plugin (TypeScript)
│       ├── src/            # Components, hooks, WebSocket client
│       ├── Dockerfile      # Builds sidebar + Tomcat Draw.io container
│       └── PreConfig.js    # Draw.io plugin bootstrapper
├── services/
│   ├── api/                # Fastify API gateway (Node.js/TypeScript)
│   │   └── src/            # Routes, WebSocket proxy, auth middleware
│   └── agent/              # Python AI orchestrator (FastAPI)
│       ├── src/agent/      # Orchestrator, LLM service, MCP bridge
│       └── tests/          # Unit & integration tests (pytest)
├── packages/
│   └── shared/             # Shared TypeScript types & utilities
├── chart/
│   └── drawio-agent/       # Helm chart for Kubernetes deployment
├── templates/              # Diagram prompt templates (YAML)
├── tests/                  # E2E Playwright test suites
├── scripts/                # Dev & CI helper scripts
├── docker-compose.yml      # Local development stack
├── docker-compose.test.yml # Integration test stack
├── nginx.conf              # Reverse proxy configuration
└── tsconfig.json           # Root TypeScript configuration
```

---

## 🚀 Quickstart (Local Development)

The entire Draw.io Agent stack is pre-configured to run locally via Docker Compose.

### Prerequisites
*   Docker & Docker Compose (or Podman)
*   An LLM API key (Gemini, OpenAI) **or** a local Ollama instance
*   Node.js v20+ & npm _(optional, for local frontend/plugin development)_

### 1. Configure your LLM provider

Copy the example environment file and add your API key:

```bash
cp .env.example .env
# Edit .env with your preferred LLM provider and API key
```

### 2. Start the stack

```bash
docker compose up --build -d
```

### 3. Open the editor

Once all services are healthy, access the applications at:

| Service | URL |
|:---|:---|
| **Draw.io Editor + AI Sidebar** | [http://localhost:8080](http://localhost:8080) |
| **Fastify API Gateway** | [http://localhost:3000](http://localhost:3000) |
| **Python Agent Service** | [http://localhost:8000](http://localhost:8000) |

---

## ⚙️ Configuration & LLM Providers

The agent service uses **LiteLLM**, making it compatible with a wide array of LLM backends. Configure via environment variables in `docker-compose.yml`, `.env`, or Kubernetes secrets.

| Environment Variable | Description | Example (Gemini) | Example (OpenAI) | Example (Ollama) |
| :--- | :--- | :--- | :--- | :--- |
| `LLM_PROVIDER` | Core model provider class | `gemini` | `openai` | `ollama` |
| `LLM_MODEL` | Model name passed to LiteLLM | `gemini-3.5-flash` | `gpt-4o` | `ollama/llama3` |
| `LLM_API_KEY` | Your developer API key | `AIzaSy...` | `sk-proj-...` | `none` |
| `OPENAI_API_BASE` | Alternative backend host | _(Omit)_ | _(Omit)_ | `http://host.docker.internal:11434/v1` |

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

### Python Agent Tests

```bash
cd services/agent
python -m pytest tests/ -v
```

---

## ☸️ Kubernetes Deployment

Refer to the detailed [Helm Chart Documentation](chart/drawio-agent/README.md) for:

- Ingress & Gateway API routing
- Persistent volumes for diagram state
- TLS termination and secure cluster-wide deployments
- Horizontal pod autoscaling
- Resource requests and limits

```bash
helm install drawio-agent ./chart/drawio-agent \
  --namespace drawio \
  --create-namespace \
  --set agent.llm.provider=gemini \
  --set agent.llm.apiKeySecret=llm-api-key
```

---

## 🗺️ Roadmap

- [ ] Multi-user collaborative editing with CRDT sync
- [ ] Diagram version history and diff viewer
- [ ] Visual AI feedback — highlight nodes as the AI modifies them
- [ ] Additional domain experts: UML class diagrams, C4 models, BPMN
- [ ] Plugin marketplace for community-contributed shape libraries

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

---

<p align="center">
  <sub>Built with ❤️ using Draw.io, FastAPI, Fastify, React, and the Model Context Protocol</sub>
</p>
