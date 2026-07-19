# ADR 001: Multi-Runtime Container Image Split Plan (v2)

* **Status:** Proposed
* **Date:** 2026-07-19
* **Authors:** Antigravity AI / Google DeepMind

## Context and Problem Statement
Currently, the Draw.io Agent is deployed as three logical workloads (Tomcat Frontend, API Gateway, and Python AI Agent) packaged in separate container images. However, to prepare for version 2 (v2), we need to ensure strict security isolation, minimize dependencies per image, optimize compute scaling, and reduce the overall software supply chain attack surface. 

## Decision
For v2, we will design and enforce a strict multi-runtime split plan:
1. **Frontend Editor Runtime:** Packaging only static web resources (compiled sidebar plugin, HTML/CSS assets) and a minimal web server (e.g., Nginx instead of a full Tomcat JVM stack) to run with pure read-only privileges.
2. **API Gateway Runtime:** A lightweight Node.js/Fastify instance tasked solely with rate limiting, correlation tracing, and OIDC/JWT session authentication.
3. **Python AI Agent Runtime:** An isolated Python 3.14 instance running the LangChain/FastAPI orchestrator, executing inside a completely non-root, read-only sandboxed filesystem.

## Consequences
* **Security:** Clear privilege boundaries. If the frontend editor is compromised via XSS, it cannot access the local file tools or the LLM orchestration logic directly.
* **Performance:** Each service scales independently. The AI Agent runtime can be auto-scaled using GPU/CPU load metrics without duplicating the API Gateway or static assets.
* **Maintenance:** Minimal node package footprint per image, reducing dependency vulnerabilities.
