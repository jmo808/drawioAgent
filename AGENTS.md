# Project Steering Guidelines (drawioAgent)

## 🛡️ Supply Chain Security & Cryptographic Pinning
- **GitHub Actions**: Every action in `.github/workflows/*.yml` must be pinned to an immutable 40-character commit SHA with an inline semantic version comment (e.g., `uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.2.2`). Mutable tags (`@v4`, `@v3`) are forbidden.
- **Scanner Tools**: Vulnerability scanners (Trivy) must run directly via Docker pinned to cryptographic `@sha256:...` multi-arch image digests (avoiding secondary wrapper action binary downloads).
- **SARIF Security Publishing**: All vulnerability scans in CI and Release must upload SARIF files directly to the GitHub Security tab via `github/codeql-action/upload-sarif`.
- **Cosign Image Signing**: All container images released to GHCR must be signed using keyless Cosign OIDC signatures.
- **Container Digest Pinning**: All production deployment values must specify cryptographic SHA-256 digests (`digest: sha256:...`).
- **Node & Python Dependencies**: Enforce `package-lock.json` and pinned `requirements.txt`.
