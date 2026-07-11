# Specification: Observability & Production Hardening

## Overview
Add comprehensive observability (metrics, logging, tracing) and production hardening (rate limiting, circuit breakers, pod disruption budgets) to the DrawIO Agent platform.

## Prerequisites
- Track 1 (MVP) must be complete

## Components

### Metrics (Prometheus)
- **Fastify API Server**: Request rate, latency histograms, WebSocket connection count, error rates
- **Python AI Agent**: LLM call latency per provider, MCP tool call duration, token usage, error rates
- **Custom metrics**: Diagram generation duration, template usage counts, active sessions

### Structured Logging
- JSON-formatted structured logs for all services
- Correlation IDs across service boundaries (request ID propagated from API → agent → MCP)
- Log levels configurable via environment variables
- Compatible with ELK, Loki, or CloudWatch

### Distributed Tracing (OpenTelemetry)
- Trace spans across: WebSocket → API → Agent → LLM → MCP
- OpenTelemetry SDK integration for both TypeScript and Python
- Export to Jaeger, Zipkin, or OTLP-compatible collector

### Production Hardening
- Rate limiting on API endpoints (configurable per-key limits)
- Circuit breaker for LLM provider calls (fail-fast when provider is down)
- Pod Disruption Budgets for zero-downtime upgrades
- Network Policies (Cilium) restricting inter-service communication
- Resource quotas and limit ranges in Helm chart
- Horizontal Pod Autoscaler (HPA) based on CPU/custom metrics

### Grafana Dashboards
- Pre-built dashboards bundled as ConfigMaps in the Helm chart
- Dashboard: API server health (request rate, latency p50/p95/p99, error rate)
- Dashboard: AI agent performance (LLM latency by provider, tool call distribution, token usage)
- Dashboard: System overview (pod health, resource usage, WebSocket connections)
