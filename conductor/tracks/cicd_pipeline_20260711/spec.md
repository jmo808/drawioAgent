# Specification: CI/CD Pipeline & Release Automation

## Overview
Establish automated CI/CD pipelines for building, testing, and releasing all DrawIO Agent components. Includes Docker image publishing, Helm chart packaging, and automated testing on every pull request.

## Prerequisites
- Track 1 (MVP) must be complete
- GitHub repository with branch protection configured

## Components

### GitHub Actions Workflows

1. **PR Validation** (`.github/workflows/pr-validate.yml`)
   - Lint (ESLint, Ruff, helm lint)
   - Unit tests (Vitest, pytest)
   - Build verification (TypeScript compile, Docker build)
   - Helm template validation

2. **Docker Image Build & Push** (`.github/workflows/docker-publish.yml`)
   - Multi-platform builds (linux/amd64, linux/arm64)
   - Push to GitHub Container Registry (ghcr.io) or configurable registry
   - Semantic version tagging from git tags
   - Vulnerability scanning (Trivy)

3. **Helm Chart Release** (`.github/workflows/helm-release.yml`)
   - Package Helm chart on release tag
   - Publish to GitHub Pages (chart repository) or OCI registry
   - Update chart version from git tag

4. **E2E Test Suite** (`.github/workflows/e2e-test.yml`)
   - Spin up `kind` cluster with Cilium + Gateway API CRDs
   - `helm install` the chart
   - Run Playwright E2E tests against the deployed stack
   - Collect and publish test results

### Container Registry Strategy
- Default: GitHub Container Registry (ghcr.io)
- Configurable for private registries via GitHub Secrets
- Image tags: `latest`, `v{semver}`, `sha-{commit}`

### Versioning Strategy
- Semantic versioning for Helm chart and Docker images
- Git tags trigger release workflows
- Chart version and appVersion stay in sync
