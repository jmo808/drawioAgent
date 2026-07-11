# Specification: CI/CD Pipeline & Release Automation

## Overview
Establish automated CI/CD pipelines for building, testing, and releasing all DrawIO Agent components. Includes Docker image publishing, Helm chart packaging, vulnerability scanning, image signing, and automated E2E testing.

## Prerequisites
- Track 1 (MVP) must be complete
- GitHub repository with branch protection configured
- Self-hosted runner `k8s-cluster` registered with the repository
- Docker, kind, kubectl, Helm, cilium-cli installed on `k8s-cluster`

## Architectural Decisions Record

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| CI-1 | CI platform | GitHub Actions (Node 24+ compatible actions only) | Native GitHub integration; OIDC for ghcr.io; rich ecosystem |
| CI-2 | Runner strategy | Self-hosted `k8s-cluster` for heavy jobs; GitHub-hosted `ubuntu-latest` for lint/test | Fast queue times for lightweight jobs; self-hosted for Docker builds and E2E |
| CI-3 | Container registry | GitHub Container Registry (ghcr.io) with OIDC keyless auth | Free, zero credential setup, images linked to repo, configurable override in values.yaml |
| CI-4 | Helm distribution | OCI registry via ghcr.io (`helm push` as OCI artifact) | Modern Helm 3.8+ approach; one registry for images + charts; no GitHub Pages branch |
| CI-5 | Versioning | Manual semver git tags; non-release commits get `sha-<commit>` + `latest` tags | Full control over release timing; chart version and image versions stay in sync |
| CI-6 | Build strategy | Path-filtered selective builds; release tags build all | Saves CI time; `packages/shared` changes trigger all builds |
| CI-7 | Multi-arch | linux/amd64 + linux/arm64; PR builds amd64-only | Covers x86 + ARM (Graviton, Ampere, Apple Silicon); QEMU for arm64 on release only |
| CI-8 | Vulnerability scanning | Trivy (filesystem scan on PR, image scan on release, SARIF output) | Open-source, comprehensive, native GitHub Security tab integration |
| CI-9 | E2E environment | kind + Cilium CNI + Gateway API CRDs on `k8s-cluster` | Matches production deployment; ephemeral, reproducible, isolated |
| CI-10 | PR checks | Lint, unit tests (>80% coverage), `tsc --noEmit`, Docker build verify, Trivy filesystem | Fast (<5 min), catch the right bugs; no full E2E on PRs |
| CI-11 | Image signing | Cosign keyless with GitHub OIDC (Sigstore transparency log) | Zero key management; industry standard; 3 lines in workflow |
| CI-12 | LLM in E2E | Mock LLM mode (`MOCK_LLM=true`) with pre-recorded tool call fixtures | Fast, deterministic, free; no API keys in CI |
| CI-13 | Merge strategy | Squash merge; branch protection; require PR + status checks; delete branch after merge | Clean linear history; `git log` reads like a changelog |
| CI-14 | Release artifacts | GitHub Release with auto-generated changelog from squash history | Zero manual maintenance; links to all published artifacts + Cosign verify instructions |
| CI-15 | Caching | Aggressive: npm, pip, Docker layers (GHA cache), Playwright browsers | Maximizes cache hits; Docker builds from 5-8min → 30-60s for unchanged layers |
| CI-16 | Workflow structure | 3 files (`ci.yml`, `release.yml`, `e2e.yml`) + reusable workflows | Clean, maps to 3 triggers (PR, tag, cron); shared build logic via reusable workflows |

## Workflow Architecture

### Workflow 1: `ci.yml` — PR Validation

**Trigger:** `pull_request` → `main`
**Runner:** `ubuntu-latest` (GitHub-hosted)
**Duration:** ~3-5 minutes

```
┌─────────────────────────────────────────────────────┐
│  ci.yml (PR Validation)                              │
│                                                       │
│  ┌──────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │  Lint     │  │  Unit Tests  │  │  Type Check  │   │
│  │          │  │              │  │              │   │
│  │ ESLint   │  │ Vitest (TS)  │  │ tsc --noEmit │   │
│  │ Ruff     │  │ pytest (Py)  │  │ all packages │   │
│  │ helm lint│  │ coverage≥80% │  │              │   │
│  └──────────┘  └──────────────┘  └──────────────┘   │
│                                                       │
│  ┌──────────────────┐  ┌─────────────────────────┐   │
│  │  Docker Build     │  │  Trivy Filesystem Scan  │   │
│  │  Verify           │  │                         │   │
│  │                   │  │  SARIF → GitHub Security │   │
│  │  amd64 only       │  │  fail on CRITICAL/HIGH  │   │
│  │  no push          │  │                         │   │
│  └──────────────────┘  └─────────────────────────┘   │
│                                                       │
│  All jobs run in PARALLEL (no dependencies)           │
└─────────────────────────────────────────────────────┘
```

**Path-filtered Docker builds (CI-6):**
- `services/api/**` changed → build `drawio-api` only
- `services/agent/**` changed → build `drawio-agent` only
- `frontend/sidebar/**` changed → build `drawio-frontend` only
- `packages/shared/**` changed → build ALL images
- `chart/**` changed → `helm lint` + `helm template --dry-run` only

### Workflow 2: `release.yml` — Build, Publish & Sign

**Trigger:** `push tags: v*` (on `main` only)
**Runner:** `k8s-cluster` (self-hosted)
**Duration:** ~10-15 minutes

```
┌──────────────────────────────────────────────────────────┐
│  release.yml (Build, Publish & Sign)                      │
│                                                            │
│  ┌────────────────────────────────────────────────────┐   │
│  │  Build & Push Docker Images (parallel matrix)       │   │
│  │                                                     │   │
│  │  ┌─────────────┐ ┌──────────┐ ┌──────────────────┐ │   │
│  │  │ drawio-     │ │ drawio-  │ │ drawio-agent     │ │   │
│  │  │ frontend    │ │ api      │ │ (multi-runtime)  │ │   │
│  │  └─────────────┘ └──────────┘ └──────────────────┘ │   │
│  │                                                     │   │
│  │  Platforms: linux/amd64, linux/arm64                 │   │
│  │  Tags: v{semver}, latest, sha-{commit}              │   │
│  │  Registry: ghcr.io/<org>/drawio-{service}           │   │
│  │  Cache: type=gha,mode=max                           │   │
│  └────────────────────────────────────────────────────┘   │
│                           │                                │
│                           ▼                                │
│  ┌────────────────────────────────────────────────────┐   │
│  │  Trivy Image Scan (per image)                       │   │
│  │  SARIF → GitHub Security tab                        │   │
│  └────────────────────────────────────────────────────┘   │
│                           │                                │
│                           ▼                                │
│  ┌────────────────────────────────────────────────────┐   │
│  │  Cosign Keyless Sign (per image)                    │   │
│  │  OIDC → Sigstore transparency log (Rekor)           │   │
│  └────────────────────────────────────────────────────┘   │
│                           │                                │
│                           ▼                                │
│  ┌────────────────────────────────────────────────────┐   │
│  │  Helm Chart Package & Push                          │   │
│  │  helm package → helm push oci://ghcr.io/…/charts    │   │
│  │  Version from git tag                               │   │
│  └────────────────────────────────────────────────────┘   │
│                           │                                │
│                           ▼                                │
│  ┌────────────────────────────────────────────────────┐   │
│  │  GitHub Release                                     │   │
│  │  Auto-generated changelog from squash merge history │   │
│  │  Links to images, chart, Cosign verify instructions │   │
│  └────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

**Image tagging scheme (CI-5):**
| Trigger | Tags Applied |
|---------|-------------|
| Push tag `v1.2.3` | `v1.2.3`, `v1.2`, `v1`, `latest` |
| Push to `main` (no tag) | `sha-<commit>`, `latest` |

### Workflow 3: `e2e.yml` — End-to-End Testing

**Trigger:** Push tag `v*` + weekly cron (Sunday 02:00 UTC)
**Runner:** `k8s-cluster` (self-hosted)
**Duration:** ~8-12 minutes

```
┌──────────────────────────────────────────────────────────┐
│  e2e.yml (End-to-End Testing on kind+Cilium)              │
│                                                            │
│  1. Create kind cluster (Cilium CNI + Gateway API CRDs)   │
│  2. Build Docker images (amd64) + kind load docker-image  │
│  3. helm install drawio-agent with MOCK_LLM=true          │
│  4. Wait for all pods ready                               │
│  5. kubectl port-forward gateway                          │
│  6. Run Playwright E2E test suite                         │
│  7. Collect results + screenshots → workflow artifacts    │
│  8. Delete kind cluster                                   │
└──────────────────────────────────────────────────────────┘
```

### Reusable Workflow: `reusable-docker-build.yml`

Shared Docker build logic for all 3 services:
- Inputs: `service-name`, `context-path`, `dockerfile-path`, `platforms`, `push` (bool)
- Steps: checkout, setup buildx, login ghcr.io (OIDC), build-push-action with GHA cache
- Used by both `ci.yml` (build-only, amd64) and `release.yml` (build+push, multi-arch)

## Image Metadata

All images include OCI annotation labels:
```dockerfile
LABEL org.opencontainers.image.source="https://github.com/<org>/drawio-agent"
LABEL org.opencontainers.image.description="DrawIO Agent - <service>"
LABEL org.opencontainers.image.licenses="MIT"
LABEL org.opencontainers.image.version="${VERSION}"
LABEL org.opencontainers.image.revision="${GIT_SHA}"
```

## Branch Protection Rules (CI-13)

Applied to `main` branch:
- Require pull request before merge
- Require status checks to pass: `lint`, `test`, `typecheck`, `docker-build-verify`, `trivy-scan`
- Require branches to be up to date before merge
- Squash merge only (merge commits and rebase disabled)
- Auto-delete head branches after merge
- Require 1 approval (configurable for team size)

## Caching Strategy (CI-15)

| Cache Target | Key | Path |
|-------------|-----|------|
| npm modules | `npm-${{ hashFiles('**/package-lock.json') }}` | `~/.npm` |
| pip packages | `pip-${{ hashFiles('**/requirements.txt') }}` | `~/.cache/pip` |
| Docker layers | `docker-${{ github.ref }}-${{ github.sha }}` | GHA cache backend (type=gha) |
| Playwright | `playwright-${{ hashFiles('**/package-lock.json') }}` | `~/.cache/ms-playwright` |

## Mock LLM Mode (CI-12)

The Python agent supports `MOCK_LLM=true` environment variable:
- Instead of calling LiteLLM, reads pre-recorded tool call sequences from `tests/fixtures/llm/`
- Each fixture is a JSON file mapping a prompt pattern to a deterministic response
- Fixtures include: `create-aws-3tier.json`, `modify-add-database.json`, `template-microservices.json`
- Ensures E2E tests are fast (~100ms per "LLM call"), deterministic, and free

## Scope Exclusions
- Automated deployment to staging/production clusters
- GitOps (ArgoCD/Flux) integration
- Release candidate branches
- Canary deployments
- Performance regression testing
- Automated dependency updates (Dependabot/Renovate)
