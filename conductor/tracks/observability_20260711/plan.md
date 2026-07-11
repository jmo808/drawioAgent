# Implementation Plan: Observability & Production Hardening

## Phase 1: Structured Logging & Correlation IDs

- [ ] Task: Implement structured JSON logging for Fastify API server
    - [ ] Write Tests: Test log output is valid JSON with required fields (timestamp, level, message, requestId)
    - [ ] Write Tests: Test correlation ID is propagated in `X-Request-ID` header to agent proxy requests
    - [ ] Implement: Configure Fastify's built-in pino logger with JSON serializer
    - [ ] Implement: Add request ID middleware that generates or propagates `X-Request-ID` header
    - [ ] Implement: Configure log level via `LOG_LEVEL` environment variable
    - [ ] Implement: Add WebSocket connection/disconnection logging with session context
- [ ] Task: Implement structured logging for Python AI agent
    - [ ] Write Tests: Test log output is valid JSON with required fields (timestamp, level, message, request_id)
    - [ ] Write Tests: Test correlation ID from incoming `X-Request-ID` header is included in all log entries
    - [ ] Implement: Configure `structlog` with JSON renderer and timestamp processor
    - [ ] Implement: Add correlation ID middleware to FastAPI (extract from request header)
    - [ ] Implement: Log LLM calls (provider, model, token count), MCP tool invocations (tool name, duration), and errors
- [ ] Task: Conductor - User Manual Verification 'Phase 1: Structured Logging & Correlation IDs' (Protocol in workflow.md)

## Phase 2: Prometheus Metrics

- [ ] Task: Add Prometheus metrics to Fastify API server
    - [ ] Write Tests: Test `GET /metrics` endpoint returns Prometheus text format
    - [ ] Write Tests: Test request duration histogram is recorded for each route
    - [ ] Write Tests: Test WebSocket connection gauge increments/decrements correctly
    - [ ] Implement: Add `fastify-metrics` plugin with `prom-client` Prometheus client
    - [ ] Implement: Custom metrics: `ws_connections_active` (gauge), `ws_messages_total` (counter), `agent_proxy_duration_seconds` (histogram)
    - [ ] Implement: Expose `GET /metrics` endpoint (excluded from auth middleware)
- [ ] Task: Add Prometheus metrics to Python AI agent
    - [ ] Write Tests: Test `GET /metrics` endpoint returns Prometheus text format
    - [ ] Write Tests: Test LLM call duration is recorded per provider
    - [ ] Implement: Add `prometheus-client` library
    - [ ] Implement: Custom metrics: `llm_call_duration_seconds{provider,model}` (histogram), `mcp_tool_duration_seconds{tool}` (histogram), `llm_tokens_total{type,provider}` (counter), `diagram_generation_duration_seconds` (histogram)
    - [ ] Implement: Expose `GET /metrics` endpoint
- [ ] Task: Update Helm chart with metrics annotations
    - [ ] Implement: Add Prometheus scrape annotations to all pod template specs
    - [ ] Implement: Add optional ServiceMonitor CRDs (for Prometheus Operator users)
    - [ ] Implement: Add `metrics.enabled` toggle in `values.yaml`
- [ ] Task: Conductor - User Manual Verification 'Phase 2: Prometheus Metrics' (Protocol in workflow.md)

## Phase 3: Production Hardening

- [ ] Task: Implement rate limiting
    - [ ] Write Tests: Test rate limiter blocks requests exceeding configured threshold (429 response)
    - [ ] Write Tests: Test rate limit headers are returned (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `Retry-After`)
    - [ ] Write Tests: Test per-API-key rate tracking
    - [ ] Implement: Add `@fastify/rate-limit` plugin with configurable limits
    - [ ] Implement: Per-API-key rate limiting (using Redis store when available, in-memory otherwise)
- [ ] Task: Implement circuit breaker for LLM calls
    - [ ] Write Tests: Test circuit opens after N consecutive LLM failures (default: 5)
    - [ ] Write Tests: Test circuit half-opens after timeout and allows one test request
    - [ ] Write Tests: Test circuit closes after successful test request
    - [ ] Write Tests: Test user receives graceful error message when circuit is open
    - [ ] Implement: Add circuit breaker wrapper around `LLMService.generate()` using `pybreaker`
    - [ ] Implement: Return user-friendly error response when circuit is open ("AI service temporarily unavailable")
    - [ ] Implement: Circuit breaker state metrics exposed via Prometheus
- [ ] Task: Add Kubernetes production manifests to Helm chart
    - [ ] Write Tests: Test PDB renders correctly with default values
    - [ ] Write Tests: Test HPA renders with correct metrics and thresholds
    - [ ] Write Tests: Test NetworkPolicy renders with correct ingress/egress rules
    - [ ] Implement: `templates/pdb.yaml` — PodDisruptionBudget for each Deployment (minAvailable: 1)
    - [ ] Implement: `templates/hpa.yaml` — HorizontalPodAutoscaler for agent Deployment (CPU 70%, min 1, max 5)
    - [ ] Implement: `templates/networkpolicy.yaml` — Cilium NetworkPolicy restricting traffic (frontend→api, api→agent, agent→LLM endpoints)
    - [ ] Implement: Add resource requests/limits with sensible defaults in values.yaml
- [ ] Task: Conductor - User Manual Verification 'Phase 3: Production Hardening' (Protocol in workflow.md)

## Phase 4: Grafana Dashboards & Distributed Tracing

- [ ] Task: Create Grafana dashboard ConfigMaps
    - [ ] Implement: API server health dashboard JSON (request rate, latency p50/p95/p99, error rate, WS connections)
    - [ ] Implement: AI agent performance dashboard JSON (LLM latency by provider, tool call distribution, token usage)
    - [ ] Implement: System overview dashboard JSON (pod health, resource usage, WebSocket connections, diagram count)
    - [ ] Implement: Add dashboards to Helm chart as optional ConfigMaps (`grafana.dashboards.enabled`)
    - [ ] Implement: Configure dashboard provisioning annotations for Grafana sidecar
- [ ] Task: Add OpenTelemetry distributed tracing
    - [ ] Write Tests: Test trace spans are created for API request handling
    - [ ] Write Tests: Test trace context is propagated from API → Agent via `traceparent` header
    - [ ] Implement: Add `@opentelemetry/sdk-node` and `@opentelemetry/auto-instrumentations-node` to API server
    - [ ] Implement: Add `opentelemetry-sdk` and `opentelemetry-instrumentation-fastapi` to Python agent
    - [ ] Implement: Configure OTLP exporter via `OTEL_EXPORTER_OTLP_ENDPOINT` env var
    - [ ] Implement: Create custom spans for LLM calls and MCP tool invocations
    - [ ] Implement: Propagate `traceparent` header across API → Agent boundary
- [ ] Task: Update documentation
    - [ ] Document metrics endpoints and complete list of available Prometheus metrics
    - [ ] Document Grafana dashboard import process and dashboard descriptions
    - [ ] Document tracing configuration for Jaeger, Zipkin, and OTLP collectors
    - [ ] Document rate limiting configuration and per-key limits
    - [ ] Update Helm chart README with observability and hardening parameters
- [ ] Task: Conductor - User Manual Verification 'Phase 4: Grafana Dashboards & Distributed Tracing' (Protocol in workflow.md)
