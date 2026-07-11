# Specification: Observability & Production Hardening

## Overview
Add comprehensive observability (metrics, logging, tracing) and production hardening (rate limiting, circuit breakers, PDBs, HPA, NetworkPolicies) to the DrawIO Agent platform. The approach is integration-first: expose endpoints and ship dashboards/rules, but don't bundle the monitoring stack.

## Prerequisites
- Track 1 (MVP) must be complete
- User has Prometheus + Grafana deployed (e.g., kube-prometheus-stack) for metrics/dashboards
- User has an OTLP-compatible collector (Jaeger, Tempo, Zipkin) for tracing (optional)

## Architectural Decisions Record

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| OB-1 | Observability stack | Assume user has Prometheus + Grafana; expose endpoints + ship dashboards | Standard Helm chart pattern; don't bundle monitoring stack |
| OB-2 | Metrics libraries | `prom-client` (Node.js) + `prometheus-client` (Python) | Native, lightweight, zero abstraction; de facto standard for Prometheus |
| OB-3 | Custom metrics | 9 domain-specific metrics across API + Agent (see table below) | Covers API latency, WS health, LLM performance, MCP reliability |
| OB-4 | Logging libraries | Pino (Fastify built-in) + structlog (Python) | Both JSON-native; Pino is fastest Node.js logger; structlog has processor pipeline |
| OB-5 | Correlation ID | X-Request-ID header propagation (API → Agent → logs) | Enables cross-service log search by single ID; returned to client |
| OB-6 | Distributed tracing | OpenTelemetry SDK with configurable OTLP exporter | Industry standard (CNCF); auto-instrumentation + custom spans; opt-in via env var |
| OB-7 | Rate limiting | Per-API-key via `@fastify/rate-limit`; Valkey store when available, in-memory otherwise | Reuses existing infra; prevents LLM cost runaway; configurable limits. ⚠️ TRA F-11 (MEDIUM): Add per-connection WebSocket rate limiting in Track 5 |
| OB-8 | Circuit breaker | pybreaker wrapping `LLMService.generate()`; per-provider; state as Prometheus gauge | Fast-fail on provider outages; prevents cascading failures; per-provider isolation |
| OB-9 | HPA | CPU-based HPA for agent only (70%, min 1, max 5); fixed replicas for API/frontend | Agent is CPU-bound; API/frontend are lightweight; no custom metrics adapter needed |
| OB-10 | Network policies | Standard K8s NetworkPolicy (L3/L4); optional Cilium FQDN egress for LLM endpoints | Default deny; portability; defense-in-depth |
| OB-11 | PDB | minAvailable: 1 for all services when replicas ≥ 2 | Zero-downtime upgrades; no PDB for single replicas (would block node drains) |
| OB-12 | Grafana dashboards | ConfigMaps with sidecar labels (`grafana_dashboard: "1"`); 3 dashboards | Auto-discovered by kube-prometheus-stack; manual import also possible |
| OB-13 | Alerting | PrometheusRule CRDs with 6 critical alerts; `alerting.enabled: false` default | Opt-in; covers most critical failure modes; requires Alertmanager |
| OB-14 | Resource defaults | Conservative per-component: frontend 256Mi, API 512Mi, agent 1Gi, Valkey 256Mi | Tuned to runtime profile; configurable; works for 1-5 user teams |

## Custom Metrics (OB-3)

### Fastify API Server

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `http_request_duration_seconds` | Histogram | `method`, `route`, `status_code` | Request latency distribution |
| `ws_connections_active` | Gauge | — | Current active WebSocket connections |
| `ws_messages_total` | Counter | `direction` (in/out), `type` | WebSocket messages processed |
| `agent_proxy_duration_seconds` | Histogram | — | Time to proxy request to Python agent |

### Python AI Agent

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `llm_call_duration_seconds` | Histogram | `provider`, `model` | LLM API call latency |
| `llm_tokens_total` | Counter | `type` (prompt/completion), `provider` | Token consumption tracking |
| `mcp_tool_duration_seconds` | Histogram | `tool_name` | MCP tool execution time |
| `mcp_tool_calls_total` | Counter | `tool_name`, `status` (success/error) | MCP tool invocation count |
| `diagram_generation_duration_seconds` | Histogram | — | End-to-end diagram generation time (prompt → final XML) |

## Structured Logging (OB-4, OB-5)

### Log Schema (both services)
```json
{
  "timestamp": "2026-07-11T14:30:00.123Z",
  "level": "info",
  "message": "LLM call completed",
  "requestId": "a3f7e2b1-9c44-4d8a-b2f1-1234567890ab",
  "service": "drawio-agent",
  "provider": "openai",
  "model": "gpt-4",
  "durationMs": 2341,
  "tokenCount": 1523
}
```

### Correlation ID Flow
```
Client → [X-Request-ID: uuid] → API Server (Pino logs with requestId)
         → [X-Request-ID: uuid] → Python Agent (structlog binds requestId)
         → [X-Request-ID: uuid] ← Response headers
         → [X-Request-ID: uuid] ← WebSocket error messages
```

Log level configurable via `LOG_LEVEL` env var (default: `info`). Supports: `trace`, `debug`, `info`, `warn`, `error`, `fatal`.

## Distributed Tracing (OB-6)

### Instrumentation
- **Node.js (API server)**: `@opentelemetry/sdk-node` + `@opentelemetry/auto-instrumentations-node`
  - Auto-instruments: HTTP server/client, Fastify routes, WebSocket
  - Custom spans: `agent.proxy` (SSE proxy call)
- **Python (Agent)**: `opentelemetry-sdk` + `opentelemetry-instrumentation-fastapi` + `opentelemetry-instrumentation-httpx`
  - Auto-instruments: FastAPI routes, outgoing HTTP via httpx
  - Custom spans: `llm.generate` (LLM call), `mcp.tool_call` (MCP invocation), `mcp.init` (MCP state initialization)

### Trace Propagation
- `traceparent` header (W3C Trace Context) propagated from API → Agent
- `X-Request-ID` set as span attribute `request.id` for cross-referencing with logs

### Configuration
```yaml
# values.yaml
tracing:
  enabled: false                    # Set true to enable tracing
  otlpEndpoint: ""                  # e.g., "http://jaeger-collector:4318"
  serviceName: "drawio-agent"       # OTEL service name
  sampleRate: 1.0                   # Sampling rate (0.0 - 1.0)
```
Tracing is opt-in. When `tracing.enabled=false` or `OTEL_EXPORTER_OTLP_ENDPOINT` is unset, the OTEL SDK is not initialized and adds zero overhead.

## Rate Limiting (OB-7)

### Configuration
```yaml
# values.yaml
rateLimiting:
  enabled: true
  http:
    max: 60                         # Requests per window
    windowMs: 60000                 # Window duration (1 minute)
  chat:
    max: 30                         # AI chat requests per window
    windowMs: 60000
  store: "auto"                     # "auto" (Valkey if available, else in-memory), "memory", "valkey"
```

### Excluded Endpoints
`/health`, `/ready`, `/metrics`, `/api/features` — never rate-limited.

### Response Headers
```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 1720713060
Retry-After: 30  (only on 429)
```

## Circuit Breaker (OB-8)

### pybreaker Configuration
```python
circuit_breaker = CircuitBreaker(
    fail_max=5,              # Open after 5 consecutive failures
    reset_timeout=30,        # Half-open after 30 seconds
    state_storage=None,      # In-memory (per-process)
    listeners=[prometheus_listener]  # Expose state as metric
)
```

### Per-Provider Isolation
Each configured LLM provider gets its own circuit breaker instance. If OpenAI's circuit opens (5 consecutive failures), Gemini and Claude remain available. Users can switch providers in the sidebar when one is down.

### Prometheus Metric
`llm_circuit_state{provider}` — gauge: 0=closed, 1=open, 2=half-open

## Kubernetes Hardening

### HPA (OB-9)
```yaml
# templates/agent-hpa.yaml (only for agent)
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
spec:
  scaleTargetRef:
    kind: Deployment
    name: drawio-agent-agent
  minReplicas: 1
  maxReplicas: 5
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
```

### NetworkPolicy (OB-10)
| Source | Destination | Ports | Notes |
|--------|------------|-------|-------|
| Gateway | Frontend pods | 8080 | Ingress only |
| Gateway | API pods | 3000 | Ingress only |
| API pods | Agent pods | 8000 | Internal only |
| API pods | Valkey pods | 6379 | When collaboration enabled |
| Agent pods | LLM endpoints | 443 | Egress (configurable FQDN list via CiliumNetworkPolicy) |
| All others | * | * | **DENY** |

### PDB (OB-11)
```yaml
# templates/pdb.yaml (per service, when replicaCount >= 2)
apiVersion: policy/v1
kind: PodDisruptionBudget
spec:
  minAvailable: 1
  selector:
    matchLabels: ...
```

### Resource Defaults (OB-14)
| Service | Requests (Memory/CPU) | Limits (Memory/CPU) |
|---------|----------------------|---------------------|
| Frontend | 128Mi / 100m | 256Mi / 200m |
| API Server | 128Mi / 100m | 512Mi / 500m |
| Agent | 256Mi / 200m | 1Gi / 1000m |
| Valkey | 128Mi / 100m | 256Mi / 200m |

## Grafana Dashboards (OB-12)

### Dashboard 1: API Server Health
- Request rate (req/s) by route and status code
- Latency heatmap with p50/p95/p99 overlay
- Error rate percentage
- Active WebSocket connections over time
- Agent proxy latency

### Dashboard 2: AI Agent Performance
- LLM call latency by provider (stacked histogram)
- Token usage by provider (prompt vs. completion)
- MCP tool call distribution (bar chart by tool name)
- MCP tool error rate
- Circuit breaker state timeline per provider
- Diagram generation duration distribution

### Dashboard 3: System Overview
- Pod health (ready/not-ready) per Deployment
- CPU and memory usage per pod vs. limits
- Total diagram generations per hour
- Active sessions (when collaboration enabled)
- WebSocket connection trends

## Alerting Rules (OB-13)

| Alert | Condition | Severity | For |
|-------|-----------|----------|-----|
| `DrawIOAgentDown` | Agent pod unhealthy | critical | 5m |
| `HighLLMErrorRate` | LLM error rate > 50% | warning | 5m |
| `LLMCircuitOpen` | Any circuit breaker open | warning | 0m |
| `HighAPILatency` | p99 latency > 10s | warning | 5m |
| `WebSocketConnectionsDrop` | WS connections dropped > 50% | warning | 5m |
| `HighMemoryUsage` | Container memory > 90% of limit | warning | 5m |

All gated by `alerting.enabled: false` (default). Requires Prometheus Operator + Alertmanager.

## Feature Gating Summary

```yaml
# values.yaml observability section
metrics:
  enabled: true                    # Expose /metrics endpoints
  serviceMonitor:
    enabled: false                 # Create ServiceMonitor CRDs
grafana:
  dashboards:
    enabled: true                  # Create dashboard ConfigMaps (when metrics.enabled)
alerting:
  enabled: false                   # Create PrometheusRule CRDs
tracing:
  enabled: false                   # Enable OpenTelemetry tracing
rateLimiting:
  enabled: true                    # Enable API rate limiting
networkPolicy:
  enabled: true                    # Create NetworkPolicy resources
pdb:
  enabled: true                    # Create PDBs (when replicaCount >= 2)
hpa:
  agent:
    enabled: false                 # Enable HPA for agent (requires metrics-server)
```

## Scope Exclusions
- Log aggregation stack (ELK, Loki) — user brings their own
- Custom metrics HPA (WebSocket connections, queue depth) — requires Prometheus Adapter
- KEDA event-driven autoscaling
- Chaos engineering / fault injection
- Performance regression testing
- Canary deployment analysis
