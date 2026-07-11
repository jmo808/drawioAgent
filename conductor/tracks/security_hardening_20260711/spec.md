# Specification: Security Hardening & TRA Remediation

## Overview
Address all findings from the Technology Risk Assessment (TRA) conducted on 2026-07-11. The TRA identified 19 findings (1 Critical, 7 High, 10 Medium, 1 Low) across 6 NIST domains with an overall pre-remediation posture of HIGH, targeting LOW-MEDIUM post-remediation. This track implements the priority remediations that cannot be deferred.

## Prerequisites
- Track 1 (MVP) must be complete
- TRA Report: `TRA-Report.html` (assessment date: 2026-07-11)
- FIPS-199 Classification: MODERATE (C:Moderate, I:Moderate, A:Low)

## Architectural Decisions Record

| # | Decision | Choice | Rationale | TRA Finding |
|---|----------|--------|-----------|-------------|
| SEC-1 | Authentication upgrade | OIDC/JWT middleware with API key fallback for service-to-service | Static API key (AD-10) provides no user identity, attribution, or revocation granularity | F-01 (CRITICAL) |
| SEC-2 | MCP tool call validator | Allowlist-based validator between AgentOrchestrator and MCPBridge | LLM output to MCP execution has no sanitization layer; prompt injection creates arbitrary file access | F-02 (HIGH) |
| SEC-3 | MCP path sandboxing | `path.resolve()` + base directory validation for all file-access tools | `validate_file` and `compile_json_spec` accept arbitrary paths (mcp-wrapper.js L330-346) | F-05 (HIGH) |
| SEC-4 | LLM data flow controls | Default to Ollama (local); require explicit opt-in for cloud providers with UI warning banner | Diagram XML sent to cloud LLM APIs without consent or data classification | F-03 (HIGH) |
| SEC-5 | NPX fallback removal | Remove npx fallback; bundle @drawio/mcp as vendored dependency at build time | Runtime `npx -y` auto-downloads unverified code from npm (mcp-wrapper.js L36-38, L241) | F-04 (HIGH) |
| SEC-6 | MCP child process env sanitization | Explicit env var allowlist in spawn options | Child process inherits all parent secrets including LLM API keys | F-06 (HIGH) |
| SEC-7 | Security audit logging | AU-2-compliant event list with structured JSON and X-Request-ID correlation | Operational logging exists but security events not defined | F-08 (HIGH) |
| SEC-8 | Data classification metadata | Classification field on sessions/diagrams gating cloud LLM usage | No framework to distinguish sensitive from non-sensitive diagram content | F-07 (HIGH) |
| SEC-9 | TLS/encryption requirements | WSS at gateway, TLS for Valkey, document mTLS option for internal comms | Encryption implied but not explicitly mandated | F-09 (MEDIUM) |
| SEC-10 | WebSocket rate limiting | Per-connection token bucket (60 msg/min) for all message types | HTTP rate limiting exists (OB-7) but WebSocket messages are unlimited | F-11 (MEDIUM) |
| SEC-11 | Privacy notice & consent | UI privacy banner before first chat; consent toggle for cloud LLM | No PIA conducted; no consent mechanism for cloud data processing | F-13 (MEDIUM) |
| SEC-12 | MCP resource limits | Max message size (10MB), child process `--max-old-space-size`, 30s timeout | Unbounded JSON-RPC messages and no child process resource constraints | F-18 (MEDIUM) |
| SEC-13 | API versioning | URL-based `/api/v1/` prefix with version header in responses | No versioning strategy for breaking changes | F-19 (LOW) |

## Implementation Phases

### Phase 1: Critical — Authentication & Identity (F-01)
- Add JWT validation middleware to Fastify API server
- Support OIDC providers (Keycloak, Auth0, Dex) via `jsonwebtoken` + JWKS
- Retain static API key as fallback (service-to-service only)
- Helm values: `auth.provider: oidc | apikey | both`
- Per-user rate limits and audit attribution
- **NIST Controls:** IA-2, AC-2, AC-6

### Phase 2: High — MCP Sandboxing & Input Validation (F-02, F-05, F-06, F-18)
- Implement MCP tool call validator (allowlist per request context)
- Add path sandboxing function for all file-access MCP tools
- Sanitize env vars before MCP child process spawn (explicit allowlist)
- Add max message size validation to JSON-RPC parsing (10MB)
- Set `--max-old-space-size` flag on MCP child process
- Implement 30s timeout for MCP operations
- **NIST Controls:** SI-10, AC-3, AC-6, SC-6

### Phase 3: High — Data Flow Controls (F-03, F-07, F-04)
- Default LLM provider to Ollama in Helm values
- Add content filter scanning diagram XML for sensitive patterns before LLM submission
- Display UI warning banner when cloud LLM selected
- Implement data classification metadata on sessions
- Remove npx fallback from mcp-wrapper.js
- Bundle @drawio/mcp via `npm ci --ignore-scripts` at Docker build time
- Add SBOM generation with `syft` or `trivy sbom`
- **NIST Controls:** AC-4, SA-9, AC-20, SR-2, RA-2

### Phase 4: High — Security Audit Logging (F-08)
- Define AU-2-compliant audit event list
- Log: auth attempts, API key usage, diagram access, AI requests, MCP tool invocations, rate limit violations
- Structured JSON with X-Request-ID correlation
- Immutable log output (stdout for K8s log collection)
- **NIST Controls:** AU-2, AU-6, AU-11

### Phase 5: Medium — Encryption, Rate Limiting, Privacy (F-09, F-11, F-13)
- Mandate WSS (TLS-terminated at Gateway) for WebSocket
- Enable TLS for Valkey connections (requirepass + TLS)
- Document mTLS option for API-to-Agent internal communication
- Implement per-connection WebSocket message rate limiting (token bucket)
- Add privacy notice component in sidebar UI
- Add consent toggle for cloud LLM processing
- **NIST Controls:** SC-8, SC-12, SC-28, SC-5, PT-2, PT-4, PT-5

### Phase 6: Medium & Low — Remaining Items (F-10, F-12, F-14, F-15, F-16, F-17, F-19)
- Document multi-runtime image split plan for v2 (F-10)
- Define RTO/RPO targets; enable Valkey RDB snapshots (F-12)
- Define records retention schedule per record type (F-14)
- Add version vectors / sequence numbers for conflict detection (F-15)
- Document ephemeral runner configuration for k8s-cluster (F-16)
- Add optional identity linking for collaboration sessions (F-17)
- Adopt `/api/v1/` URL-based API versioning (F-19)
- **NIST Controls:** CM-7, CP-2, CP-9, AU-11, SI-7, CM-6, CM-3

## Cross-Domain Risk Mitigations

This track specifically breaks the 4 compound risk chains identified in the TRA:

1. **Prompt Injection → File Access → Data Exfiltration** (F-02+F-05+F-03+F-08): Phases 2, 3, and 4 each break a link in this chain
2. **No Identity + Anonymous Collab + No Classification** (F-01+F-17+F-07+F-13): Phases 1, 3, and 5 address identity, classification, and privacy
3. **LLM Data Leakage + No PIA + No Consent** (F-03+F-13): Phases 3 and 5 implement controls
4. **NPX Supply Chain + Multi-Runtime + Self-Hosted Runner** (F-04+F-10+F-16): Phase 3 and Phase 6 address supply chain and infra

## Scope Exclusions
- Full threat modeling exercise (recommended as operational follow-up)
- Incident response plan creation (IR-8) — organizational responsibility
- DPA negotiations with LLM providers — legal/procurement responsibility
- FOIA/e-discovery readiness — depends on organizational requirements
- Full PIA report — requires privacy officer involvement
