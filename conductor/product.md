# Initial Concept

Create a Helm package that uses the draw.io self-hosted install (jgraph/drawio Docker image) as the base application, then extends the draw.io editor with a sidebar AI agent chat panel. The chat agent leverages the drawio_plugin (~/Development/drawio_plugin) MCP tools to create and modify diagrams in real-time from natural language conversation. The solution should be deployable to any Kubernetes cluster via Helm, with the draw.io frontend serving the extended UI and a backend service proxying AI/MCP requests.

---

# Product Guide: DrawIO Agent

## Vision
DrawIO Agent is a Kubernetes-deployable, self-hosted diagramming platform that extends the open-source draw.io editor with an AI-powered conversational sidebar. Development teams can generate, modify, and collaborate on architecture and system design diagrams using natural language — all within a secure, enterprise-ready environment that keeps data on-premises.

## Target Users
- **Development teams** collaborating on architecture and system design diagrams
- **Solution architects** designing cloud infrastructure (AWS, GCP, Azure)
- **Engineering managers** who need quick visual documentation of system topologies
- **DevOps engineers** documenting Kubernetes deployments and CI/CD pipelines

## Core Features (MVP)

### 1. Real-Time Diagram Generation from Natural Language
Users type natural language descriptions in the embedded chat sidebar, and the AI agent generates native draw.io XML diagrams in real-time. The diagram appears and updates live in the editor canvas as the AI builds it using the drawio plugin's MCP builder tools (`init_diagram`, `add_container`, `add_node`, `connect`, `finalize`).

### 2. Conversational Diagram Modification
Users can issue modification commands in the chat (e.g., "add an RDS replica in AZ-b", "remove the NAT gateway", "change the ALB to an NLB") and the AI agent applies changes to the existing diagram state using the MCP tools, preserving layout and styling.

### 3. Multi-User Collaboration
Shared diagram sessions allow multiple team members to view and contribute to the same diagram simultaneously. Chat history is shared so the team can see the evolution of design decisions.

### 4. Template Library
Pre-built architecture patterns for AWS, GCP, and Azure that users can select as starting points. Templates leverage the drawio plugin's domain experts (AWS Well-Architected, PFD, P&ID) to ensure topological correctness.

## AI Backend (Multi-Provider)
The agent backend supports multiple LLM providers via a pluggable adapter pattern:
- **OpenAI API** (GPT-4) — widely available, strong natural language understanding
- **Google Gemini API** — multimodal capabilities, strong reasoning
- **Anthropic Claude** (Sonnet/Opus) — excellent at structured output and code generation
- **Ollama** (local LLM) — fully air-gapped, no external API dependency

Providers are configured at deployment time via Helm values. The system uses a unified interface so switching providers requires zero code changes.

## UI Integration
The AI chat is delivered as an **embedded sidebar panel** within the draw.io editor. This is implemented as a draw.io plugin that injects a collapsible right-side panel. The panel contains:
- Chat message history (user + AI messages)
- Input field with send button
- Diagram state indicator (shows current nodes/edges count)
- Provider selector dropdown
- Template quick-launch buttons

## Deployment Model
- **Helm chart** for Kubernetes deployment
- Based on the official `jgraph/drawio` Docker image for the editor frontend
- Custom sidecar/backend service for AI agent processing and MCP tool execution
- Configurable via `values.yaml` for LLM provider, resource limits, ingress, TLS, and persistence

## Non-Functional Requirements
- **Security:** All data stays within the cluster; no external calls unless explicitly configured for cloud LLM APIs. OIDC/JWT authentication with API key fallback. MCP tool sandboxing with path validation. Security audit logging (AU-2 compliant). See TRA Report for full control mapping.
- **Privacy:** Privacy notice displayed before first chat. Consent toggle for cloud LLM data processing. Local LLM (Ollama) as default provider. Data classification metadata on sessions.
- **Performance:** Diagram generation should complete within 10 seconds for typical architectures
- **Scalability:** Horizontal scaling of the AI backend service behind the draw.io frontend
- **Observability:** Structured logging, health checks, and Prometheus metrics endpoints
- **Compliance:** FIPS-199 MODERATE classification. NIST 800-53r5 control mapping across 13 families. Pre-implementation TRA conducted 2026-07-11.

## Security Posture
A Technology Risk Assessment (TRA) was conducted on 2026-07-11 using NIST CSF 2.0 + 800-53r5 framework. Key findings:
- **FIPS-199:** MODERATE (Confidentiality: Moderate, Integrity: Moderate, Availability: Low)
- **Pre-Remediation Posture:** HIGH (19 findings: 1 Critical, 7 High, 10 Medium, 1 Low)
- **Post-Remediation Target:** LOW-MEDIUM
- **Top 3 Priorities:** (1) OIDC/JWT authentication, (2) MCP sandboxing & prompt injection defenses, (3) Supply chain hardening
- **Report:** [`TRA-Report.html`](../TRA-Report.html)
- **Remediation Track:** Track 5 — Security Hardening & TRA Remediation
