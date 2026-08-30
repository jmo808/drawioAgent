# Project Steering Guidelines (drawioAgent)

## 🛡️ Supply Chain Security & Dependency Pinning
- **GitHub Actions**: Every action in `.github/workflows/*.yml` must be pinned to an immutable 40-character commit SHA with an inline semantic version comment (e.g., `uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.2.2`). Mutable tags (`@v4`, `@v3`) are forbidden.
- **Scanner Binaries**: The Trivy scanner version in `aquasecurity/trivy-action` must be explicitly specified (e.g., `trivy-version: '0.60.0'`).
- **SARIF Security Publishing**: All vulnerability scans in CI and Release must upload SARIF files directly to the GitHub Security tab via `github/codeql-action/upload-sarif`.
- **Cosign Image Signing**: All container images released to GHCR must be signed using keyless Cosign OIDC signatures.
- **Node & Python Dependencies**: Enforce `package-lock.json` and pinned `requirements.txt`. Do not introduce floating dependencies.
