# Implementation Plan: CI/CD Pipeline & Release Automation

## Phase 1: PR Validation Workflow (`ci.yml`)

- [ ] Task: Create reusable Docker build workflow (CI-16)
    - [ ] Write Tests: Validate workflow YAML syntax with `actionlint`
    - [ ] Implement: Create `.github/workflows/reusable-docker-build.yml`
    - [ ] Implement: Define inputs: `service-name`, `context-path`, `dockerfile-path`, `platforms` (default: `linux/amd64`), `push` (bool, default: false)
    - [ ] Implement: Steps: checkout → setup buildx → login ghcr.io (OIDC, `docker/login-action@v4`) → build-push-action with GHA cache (`cache-from: type=gha`, `cache-to: type=gha,mode=max`)
    - [ ] Implement: OCI annotation labels (source, description, version, revision) via `docker/metadata-action@v6`
    - [ ] Implement: Verify all actions are Node 24+ compatible (CI-1)
- [ ] Task: Create PR validation workflow (CI-10)
    - [ ] Write Tests: Validate workflow YAML syntax with `actionlint`
    - [ ] Implement: Create `.github/workflows/ci.yml`, trigger on `pull_request` → `main`
    - [ ] Implement: **Lint job** (`ubuntu-latest`) — ESLint for TypeScript (`npx eslint .`), Ruff for Python (`ruff check .`), `helm lint --strict chart/drawio-agent`
    - [ ] Implement: **Unit test job** (`ubuntu-latest`) — Vitest for frontend + API (`npm test -- --coverage`), pytest for agent (`pytest --cov --cov-fail-under=80`); upload coverage report as PR comment
    - [ ] Implement: **Type check job** (`ubuntu-latest`) — `tsc --noEmit` for all TypeScript packages
    - [ ] Implement: **Docker build verify job** (`ubuntu-latest`) — path-filtered selective builds (CI-6):
        - Use `dorny/paths-filter@v3` to detect changed services
        - Call `reusable-docker-build.yml` for each changed service (amd64, no push)
        - `packages/shared/**` changes trigger all 3 builds
    - [ ] Implement: **Trivy filesystem scan job** (`ubuntu-latest`) — `aquasecurity/trivy-action@v0.30` with `scan-type: fs`, `format: sarif`, upload to GitHub Security tab; fail on CRITICAL/HIGH
    - [ ] Implement: Configure all jobs to run in PARALLEL (no inter-job dependencies)
    - [ ] Implement: Add caching for npm (`actions/cache` on `~/.npm` keyed by `package-lock.json`) and pip (`~/.cache/pip` keyed by `requirements.txt`) (CI-15)
- [ ] Task: Conductor - User Manual Verification 'Phase 1: PR Validation Workflow' (Protocol in workflow.md)

## Phase 2: Release Workflow (`release.yml`)

- [ ] Task: Create Docker image build, push, and sign workflow (CI-3, CI-5, CI-7, CI-11)
    - [ ] Write Tests: Validate workflow YAML syntax with `actionlint`
    - [ ] Implement: Create `.github/workflows/release.yml`, trigger on `push tags: v*`
    - [ ] Implement: **Extract version** step — strip `v` prefix from tag (e.g., `v1.2.3` → `1.2.3`)
    - [ ] Implement: **Build & push** job (`k8s-cluster`) — matrix build for 3 services (frontend, api, agent):
        - Call `reusable-docker-build.yml` with `push: true`, `platforms: linux/amd64,linux/arm64`
        - Image tags via `docker/metadata-action@v6`: `v{semver}`, `v{major}.{minor}`, `v{major}`, `latest`, `sha-{commit}`
        - Registry: `ghcr.io/${{ github.repository_owner }}/drawio-{service}`
        - GHA cache enabled (`cache-from: type=gha`, `cache-to: type=gha,mode=max`) (CI-15)
    - [ ] Implement: **Trivy image scan** job (per image, after push) — `aquasecurity/trivy-action@v0.30` with `scan-type: image`, SARIF output to GitHub Security tab
    - [ ] Implement: **Cosign sign** job (per image, after push) — `sigstore/cosign-installer@v3` → `cosign sign --yes ghcr.io/...@${DIGEST}` with OIDC identity (CI-11)
    - [ ] Implement: Add `permissions: id-token: write, packages: write, contents: write` for OIDC + ghcr.io + releases
- [ ] Task: Create Helm chart package and publish step (CI-4)
    - [ ] Implement: **Update Chart.yaml** step — sed/yq to set `version` and `appVersion` from git tag
    - [ ] Implement: **Helm package** step — `helm package chart/drawio-agent`
    - [ ] Implement: **Helm push** step — `helm push drawio-agent-${VERSION}.tgz oci://ghcr.io/${{ github.repository_owner }}/charts`
    - [ ] Implement: Login to ghcr.io OCI registry via `helm registry login`
- [ ] Task: Create GitHub Release step (CI-14)
    - [ ] Implement: **GitHub Release** step — `softprops/action-gh-release@v2` (or native `gh release create`)
    - [ ] Implement: Auto-generate release notes from squash merge history (`generate_release_notes: true`)
    - [ ] Implement: Release body template with links to:
        - Docker images on ghcr.io (all 3 services)
        - Helm chart OCI artifact
        - Cosign verification command (`cosign verify --certificate-identity-regexp ...`)
        - Upgrade instructions (`helm upgrade drawio-agent oci://ghcr.io/.../charts/drawio-agent --version ${VERSION}`)
- [ ] Task: Conductor - User Manual Verification 'Phase 2: Release Workflow' (Protocol in workflow.md)

## Phase 3: E2E Test Workflow (`e2e.yml`)

- [ ] Task: Create Mock LLM mode for Python agent (CI-12)
    - [ ] Write Tests: Test `MOCK_LLM=true` returns fixture responses instead of calling LiteLLM
    - [ ] Write Tests: Test mock provider matches prompt pattern to correct fixture file
    - [ ] Write Tests: Test unknown prompt pattern returns a generic "I can help with diagrams" response
    - [ ] Implement: Create `MockLLMProvider` class in `src/agent/llm_service.py` (selected when `MOCK_LLM=true`)
    - [ ] Implement: Create fixture directory `services/agent/tests/fixtures/llm/`
    - [ ] Implement: Create fixtures: `create-aws-3tier.json`, `modify-add-database.json`, `template-microservices.json`
    - [ ] Implement: Each fixture contains `{promptPattern: string, toolCalls: ToolCall[], finalResponse: string}`
    - [ ] Implement: Mock provider matches incoming prompt against fixture patterns (regex or keyword match)
- [ ] Task: Create E2E test workflow (CI-9)
    - [ ] Write Tests: Validate workflow YAML syntax with `actionlint`
    - [ ] Implement: Create `.github/workflows/e2e.yml`, trigger on `push tags: v*` + `schedule: cron: '0 2 * * 0'` (weekly Sunday)
    - [ ] Implement: **Create kind cluster** step — `kind create cluster --config .github/kind-config.yaml`
    - [ ] Implement: Create `.github/kind-config.yaml` with:
        - `disableDefaultCNI: true` (Cilium will manage CNI)
        - Port mappings for Gateway API
    - [ ] Implement: **Install Cilium** step — `cilium install --version 1.16 --set gatewayAPI.enabled=true`
    - [ ] Implement: **Apply Gateway API CRDs** step — `kubectl apply -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.2.0/standard-install.yaml`
    - [ ] Implement: **Build images** step — build all 3 Docker images (amd64 only)
    - [ ] Implement: **Load images into kind** step — `kind load docker-image` for all 3 images
    - [ ] Implement: **Helm install** step — `helm install drawio-agent chart/drawio-agent --set agent.env.MOCK_LLM=true --set agent.image.tag=local --set api.image.tag=local --set frontend.image.tag=local --wait --timeout 120s`
    - [ ] Implement: **Wait for pods** step — `kubectl wait --for=condition=ready pod -l app.kubernetes.io/instance=drawio-agent --timeout=120s`
    - [ ] Implement: **Port forward** step — `kubectl port-forward svc/drawio-agent-gateway 8080:80 &`
    - [ ] Implement: **Run Playwright** step — `npx playwright test --reporter=html`
    - [ ] Implement: **Collect artifacts** step — upload Playwright report + screenshots as workflow artifacts (`actions/upload-artifact@v4`)
    - [ ] Implement: **Cleanup** step (always) — `kind delete cluster`
- [ ] Task: Create Playwright E2E test suite
    - [ ] Write Tests: Test draw.io loads with sidebar plugin visible
    - [ ] Write Tests: Test sidebar chat input accepts text and sends message
    - [ ] Write Tests: Test AI response (mocked) generates diagram on canvas
    - [ ] Write Tests: Test template selection generates expected diagram
    - [ ] Write Tests: Test provider selector is functional
    - [ ] Write Tests: Test health endpoints return 200 (frontend /, API /health, agent /health)
    - [ ] Implement: Create `tests/e2e/` directory with Playwright config
    - [ ] Implement: Create `playwright.config.ts` pointing at `http://localhost:8080`
    - [ ] Implement: Create page object models for sidebar, canvas, and chat
- [ ] Task: Conductor - User Manual Verification 'Phase 3: E2E Test Workflow' (Protocol in workflow.md)

## Phase 4: Branch Protection & Documentation

- [ ] Task: Configure branch protection rules (CI-13)
    - [ ] Implement: Create `.github/branch-protection.md` documenting the required settings:
        - Require PR before merge
        - Required status checks: `lint`, `test`, `typecheck`, `docker-build-verify`, `trivy-scan`
        - Require branches up to date
        - Squash merge only
        - Auto-delete head branches
        - Require 1 approval
    - [ ] Implement: Alternatively, create a setup script using `gh api` to configure branch protection programmatically
- [ ] Task: Create `.github/release-drafter.yml` for PR labeling
    - [ ] Implement: Label categories: `feature`, `bugfix`, `docs`, `dependencies`, `breaking`
    - [ ] Implement: Auto-label rules based on file paths (`services/*` → `feature`, `chart/*` → `helm`, etc.)
- [ ] Task: Documentation
    - [ ] Implement: Update project README with CI/CD section:
        - Badge status (CI, release, E2E)
        - How to trigger a release (push version tag)
        - How to verify image signatures (`cosign verify`)
        - How to install from OCI registry
    - [ ] Implement: Create `CONTRIBUTING.md` with:
        - PR workflow (branch → PR → squash merge)
        - Required status checks
        - Commit message guidelines
        - Running tests locally (`npm test`, `pytest`, `helm lint`)
    - [ ] Implement: Create `.github/PULL_REQUEST_TEMPLATE.md` with checklist:
        - [ ] Tests added/updated
        - [ ] Lint passes
        - [ ] Documentation updated (if applicable)
- [ ] Task: Conductor - User Manual Verification 'Phase 4: Branch Protection & Documentation' (Protocol in workflow.md)

## Phase: Review Fixes
- [x] Task: Apply review suggestions d54859a
