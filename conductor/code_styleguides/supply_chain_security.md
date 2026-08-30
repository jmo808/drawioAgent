# Supply Chain Security & Dependency Pinning Styleguide

## GitHub Actions Pinning
- **Mandate**: All GitHub Actions references must use full 40-character commit hashes.
- **Format**: `uses: <owner>/<repo>@<commit_sha> # <semver>`
- **Example**:
  ```yaml
  uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.2.2
  uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4.2.0
  uses: aquasecurity/trivy-action@ed142fd0673e97e23eac54620cfb913e5ce36c25 # v0.36.0
  ```

## Security Scanner Engine Locking
- When configuring vulnerability scanning tools in CI/CD, lock the engine/scanner version in addition to the action wrapper.
- Example:
  ```yaml
  with:
    trivy-version: '0.60.0'
  ```

## Package Dependencies
- Maintain strict lockfile discipline across Node (`package-lock.json`) and Python (`requirements.txt` / virtual environments).
- Never use unpinned versions or floating ranges (`*`, `latest`) in production workflows.
