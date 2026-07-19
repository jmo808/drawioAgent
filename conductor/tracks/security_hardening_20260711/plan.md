# Implementation Plan: Security Hardening & TRA Remediation

## Phase 1: Critical — Authentication & Identity (F-01)

- [x] Task: Implement OIDC/JWT authentication middleware (696863b)
    - [x] Write Tests: Test JWT token validation with valid RS256 token returns 200
    - [x] Write Tests: Test expired JWT returns 401 with descriptive error
    - [x] Write Tests: Test invalid JWT signature returns 403
    - [x] Write Tests: Test JWKS endpoint discovery and key rotation
    - [x] Write Tests: Test API key fallback when `auth.provider` includes `apikey`
    - [x] Write Tests: Test auth bypass for /health, /ready, /metrics endpoints
    - [x] Implement: Add `jsonwebtoken` and `jwks-rsa` dependencies to API server
    - [x] Implement: Create `src/plugins/jwt-auth.ts` with JWKS-based JWT validation
    - [x] Implement: Create `src/plugins/auth-strategy.ts` supporting `oidc | apikey | both` modes
    - [x] Implement: Add `auth.provider`, `auth.jwksUri`, `auth.issuer`, `auth.audience` to Helm values.yaml
    - [x] Implement: Mount auth config from ConfigMap/Secret into API deployment
    - [x] Implement: Add per-user identity extraction from JWT claims to request context
- [x] Task: Conductor - User Manual Verification 'Phase 1: Authentication & Identity' (Protocol in workflow.md) (9cc1536)

## Phase 2: High — MCP Sandboxing & Input Validation (F-02, F-05, F-06, F-18)

- [x] Task: Implement MCP tool call validator (35673de)
    - [x] Write Tests: Test allowlisted tool calls pass validation
    - [x] Write Tests: Test non-allowlisted tool calls are rejected with error
    - [x] Write Tests: Test tool call arguments are sanitized (no path traversal patterns)
    - [x] Implement: Create `src/agent/mcp_validator.py` with allowlist-based tool filtering
    - [x] Implement: Wire validator between AgentOrchestrator and MCPBridge
    - [x] Implement: Log all MCP tool invocations with full arguments for forensics
- [x] Task: Implement path sandboxing for MCP file tools (8022b2e)
    - [x] Write Tests: Test `validatePath()` accepts paths within workspace root
    - [x] Write Tests: Test `validatePath()` rejects `..` traversal attempts
    - [x] Write Tests: Test `validatePath()` rejects absolute paths outside workspace
    - [x] Write Tests: Test `validatePath()` rejects symlinks pointing outside sandbox
    - [x] Implement: Add `validatePath(userPath, baseDir)` function to mcp-wrapper.js
    - [x] Implement: Apply path validation to `validate_file` and `compile_json_spec` handlers
    - [x] Implement: Configure workspace root via `MCP_WORKSPACE_ROOT` env var
- [x] Task: Sanitize MCP child process environment (f4fe249)
    - [x] Write Tests: Test spawned child process receives only allowlisted env vars
    - [x] Write Tests: Test LLM API keys are NOT present in child process environment
    - [x] Implement: Create env var allowlist in mcp-wrapper spawn logic
    - [x] Implement: Add `--max-old-space-size=512` flag to MCP child process spawn
- [x] Task: Implement MCP message size and timeout limits (f4fe249)
    - [x] Write Tests: Test JSON-RPC messages exceeding 10MB are rejected
    - [x] Write Tests: Test MCP operations exceeding 30s timeout are cancelled
    - [x] Implement: Add max message size validation to NDJSON parsing loop
    - [x] Implement: Add configurable timeout to MCP tool call execution
- [x] Task: Conductor - User Manual Verification 'Phase 2: MCP Sandboxing' (Protocol in walkthrough.md)

## Phase 3: High — Data Flow Controls (F-03, F-07, F-04)

- [ ] Task: Implement LLM provider safety controls
    - [ ] Write Tests: Test default provider is Ollama when no explicit provider configured
    - [ ] Write Tests: Test cloud provider selection triggers warning event via WebSocket
    - [ ] Write Tests: Test content filter detects IP addresses in diagram XML
    - [ ] Write Tests: Test content filter detects hostname patterns
    - [ ] Write Tests: Test content filter detects potential credential strings
    - [ ] Implement: Change default `LLM_PROVIDER` to `ollama` in Helm values
    - [ ] Implement: Create `src/agent/content_filter.py` scanning XML for sensitive patterns
    - [ ] Implement: Add `provider_warning` WebSocket message type for cloud provider UI warning
    - [ ] Implement: Add `llm.localDefault: true` to values.yaml with documentation
- [ ] Task: Remove NPX fallback from MCP wrapper
    - [ ] Write Tests: Test mcp-wrapper.js exits with error if local @drawio/mcp not found
    - [ ] Write Tests: Test Docker image contains @drawio/mcp installed via npm ci
    - [ ] Implement: Remove npx fallback code from mcp-wrapper.js
    - [ ] Implement: Add `npm ci --ignore-scripts` to agent Dockerfile for @drawio/mcp
    - [ ] Implement: Add SBOM generation step to agent Dockerfile
- [ ] Task: Implement data classification metadata
    - [ ] Write Tests: Test session creation accepts classification level
    - [ ] Write Tests: Test confidential/restricted sessions reject cloud LLM providers
    - [ ] Implement: Add classification field to session metadata
    - [ ] Implement: Gate cloud LLM usage based on classification level
- [ ] Task: Conductor - User Manual Verification 'Phase 3: Data Flow Controls' (Protocol in workflow.md)

## Phase 4: High — Security Audit Logging (F-08)

- [ ] Task: Implement AU-2-compliant security event logging
    - [ ] Write Tests: Test auth success events are logged with user identity
    - [ ] Write Tests: Test auth failure events are logged with source IP
    - [ ] Write Tests: Test AI chat requests are logged with user, provider, model
    - [ ] Write Tests: Test MCP tool invocations are logged with tool name and arguments
    - [ ] Write Tests: Test rate limit violations are logged
    - [ ] Write Tests: Test all security events include X-Request-ID correlation
    - [ ] Implement: Define audit event schema extending existing structured logging
    - [ ] Implement: Add security event logging to auth middleware
    - [ ] Implement: Add security event logging to agent orchestrator
    - [ ] Implement: Add security event logging to MCP bridge
    - [ ] Implement: Add security event logging to rate limiter
    - [ ] Implement: Ensure audit log entries are marked as non-redactable
- [ ] Task: Conductor - User Manual Verification 'Phase 4: Security Audit Logging' (Protocol in workflow.md)

## Phase 5: Medium — Encryption, Rate Limiting, Privacy (F-09, F-11, F-13)

- [ ] Task: Document and enforce encryption requirements
    - [ ] Implement: Add TLS configuration section to Helm values.yaml
    - [ ] Implement: Document WSS requirement in Gateway API HTTPRoute
    - [ ] Implement: Add Valkey TLS configuration option
    - [ ] Implement: Document mTLS option for API-to-Agent with example
- [ ] Task: Implement WebSocket message rate limiting
    - [ ] Write Tests: Test messages within rate limit are processed
    - [ ] Write Tests: Test messages exceeding rate limit are dropped with warning frame
    - [ ] Write Tests: Test rate limit is per-connection
    - [ ] Implement: Create WebSocket rate limiter middleware (token bucket: 60 msg/min)
    - [ ] Implement: Apply to all WebSocket message types
    - [ ] Implement: Return rate limit warning frame when exceeded
- [ ] Task: Implement privacy notice and consent
    - [ ] Write Tests: Test privacy banner renders on first sidebar load
    - [ ] Write Tests: Test consent toggle state persists in localStorage
    - [ ] Write Tests: Test cloud LLM requests are blocked when consent not given
    - [ ] Implement: Create `PrivacyNotice` React component with dismissable banner
    - [ ] Implement: Create `ConsentToggle` component for cloud LLM opt-in
    - [ ] Implement: Wire consent state to WebSocket provider selection
- [ ] Task: Conductor - User Manual Verification 'Phase 5: Encryption, Rate Limiting, Privacy' (Protocol in workflow.md)

## Phase 6: Medium & Low — Remaining Items (F-10, F-12, F-14, F-15, F-16, F-17, F-19)

- [ ] Task: Address remaining medium and low findings
    - [ ] Implement: Document multi-runtime image split plan in ADR for v2
    - [ ] Implement: Define RTO (1h) / RPO (24h) targets in operational runbook
    - [ ] Implement: Enable Valkey RDB snapshots configuration in values.yaml
    - [ ] Implement: Define records retention schedule document
    - [ ] Implement: Add version field to collaboration session sync messages
    - [ ] Implement: Document ephemeral runner setup for k8s-cluster
    - [ ] Implement: Add optional identity linking field to collaboration join flow
    - [ ] Implement: Adopt `/api/v1/` URL prefix for all API routes
    - [ ] Implement: Add `X-API-Version` response header
- [ ] Task: Conductor - User Manual Verification 'Phase 6: Remaining Items' (Protocol in workflow.md)
