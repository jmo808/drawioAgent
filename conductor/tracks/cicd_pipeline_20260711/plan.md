# Implementation Plan: CI/CD Pipeline & Release Automation

## Phase 1: PR Validation Workflow

- [ ] Task: Create PR validation GitHub Actions workflow
    - [ ] Write Tests: Validate workflow YAML syntax (actionlint)
    - [ ] Implement: Create `.github/workflows/pr-validate.yml`
    - [ ] Implement: Add lint job — ESLint for TypeScript, Ruff for Python
    - [ ] Implement: Add unit test job — Vitest for frontend/API, pytest for agent
    - [ ] Implement: Add build verification job — `tsc --noEmit`, Docker build `--dry-run`
    - [ ] Implement: Add Helm lint job — `helm lint --strict chart/drawio-agent`
    - [ ] Implement: Configure job matrix for parallel execution
    - [ ] Implement: Add test coverage reporting as PR comment
- [ ] Task: Conductor - User Manual Verification 'Phase 1: PR Validation Workflow' (Protocol in workflow.md)

## Phase 2: Docker Image Publishing

- [ ] Task: Create Docker image build and publish workflow
    - [ ] Implement: Create `.github/workflows/docker-publish.yml`
    - [ ] Implement: Trigger on push to `main` and on git tag `v*`
    - [ ] Implement: Multi-platform build using `docker/build-push-action` (linux/amd64, linux/arm64)
    - [ ] Implement: Push to ghcr.io with tags: `latest`, `v{semver}`, `sha-{commit}`
    - [ ] Implement: Build all 3 images (frontend, api, agent) in parallel jobs
    - [ ] Implement: Add Trivy vulnerability scanning step with SARIF output
    - [ ] Implement: Configure GitHub Secrets for registry credentials
    - [ ] Implement: Add image metadata labels (OCI annotations)
- [ ] Task: Conductor - User Manual Verification 'Phase 2: Docker Image Publishing' (Protocol in workflow.md)

## Phase 3: Helm Chart Release

- [ ] Task: Create Helm chart release workflow
    - [ ] Implement: Create `.github/workflows/helm-release.yml`
    - [ ] Implement: Trigger on git tag `v*` push
    - [ ] Implement: Auto-update `Chart.yaml` version and appVersion from git tag
    - [ ] Implement: Package chart with `helm package`
    - [ ] Implement: Publish to GitHub Pages chart repository using `chart-releaser-action`
    - [ ] Implement: Alternatively publish to OCI registry (`helm push` to ghcr.io)
    - [ ] Implement: Create GitHub Release with chart artifact and changelog
- [ ] Task: Conductor - User Manual Verification 'Phase 3: Helm Chart Release' (Protocol in workflow.md)

## Phase 4: E2E Test Workflow

- [ ] Task: Create E2E test GitHub Actions workflow
    - [ ] Implement: Create `.github/workflows/e2e-test.yml`
    - [ ] Implement: Trigger on PR and weekly schedule (cron)
    - [ ] Implement: Spin up `kind` cluster with Cilium CNI and Gateway API CRDs
    - [ ] Implement: Build Docker images and load into kind (`kind load docker-image`)
    - [ ] Implement: `helm install` the chart into the kind cluster with test values
    - [ ] Implement: Wait for all pods to be ready
    - [ ] Implement: Run Playwright E2E tests against the deployed stack (port-forwarded)
    - [ ] Implement: Collect test results, screenshots, and publish as workflow artifacts
    - [ ] Implement: Add test result summary as PR comment
- [ ] Task: Conductor - User Manual Verification 'Phase 4: E2E Test Workflow' (Protocol in workflow.md)
