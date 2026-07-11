# DrawIO Agent

A self-hosted diagramming platform that extends the open-source draw.io editor with an AI-powered conversational sidebar.

## Overview

DrawIO Agent allows development teams and architects to generate and modify diagrams (native draw.io XML) in real-time using natural language. It packages draw.io, a Fastify API backend, and a Python AI agent service deployable via Helm or run locally via Docker Compose.

## Project Structure

- `frontend/sidebar/` - React plugin injected into draw.io editor
- `services/api/` - Fastify API server proxying WebSocket/SSE requests
- `services/agent/` - FastAPI service managing LLM, conversation, and MCP tools
- `packages/shared/` - Shared TypeScript types and validators
- `chart/` - Kubernetes deployment Helm chart

## Quickstart

(Quickstart guide placeholder)
