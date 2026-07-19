# Contributing to Draw.io Agent

Welcome! We appreciate your contributions to the Draw.io Agent project. Please follow these guidelines to ensure a smooth development and release process.

## 🛠️ Local Development Setup

The project is structured as a monorepo containing frontend, API server, shared packages, and the Python AI agent:
- **`frontend/sidebar/`**: React-based sidebar plugin.
- **`services/api/`**: Fastify gateway server routing WS/HTTP traffic.
- **`services/agent/`**: Python FastAPI service orchestrating LLM calls and spawning the MCP server.
- **`packages/shared/`**: Zod schemas and types shared between backend and client.

### Prerequisites
- Node.js 22 (LTS)
- Python 3.11+
- Docker and Helm 3

### Install Dependencies
Run `npm install` at the root directory to set up the workspaces:
```bash
npm install --legacy-peer-deps
```

Initialize Python environment inside `services/agent`:
```bash
cd services/agent
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

---

## 🧪 Testing Guidelines

Before submitting a Pull Request, ensure that all test suites pass.

### Running TypeScript Tests (Vitest)
```bash
# In the root directory:
npm run test
```

### Running Python Agent Tests (Pytest)
```bash
# In services/agent/:
pytest --cov=src --cov-fail-under=80 tests/
```

### Running Local E2E Tests (Playwright)
Ensure the local compose environment is running, then run Playwright:
```bash
docker compose -f docker-compose.test.yml up -d --build
npx playwright test -c tests/e2e/playwright.config.ts
docker compose -f docker-compose.test.yml down
```

---

## 🚀 Branch Protection & Git Workflow

We enforce the following git standards on the `main` branch:
1. **Pull Requests Required**: Direct pushes to `main` are disabled. All changes must be made via pull requests.
2. **Squash Merges Only**: All commits in a PR will be squashed into a single commit upon merging to maintain a clean history.
3. **Required Status Checks**:
   - `lint` (ESLint and Ruff checks must pass)
   - `test` (Unit tests with coverage threshold >= 80% must pass)
   - `typecheck` (TypeScript type check must compile successfully)
   - `docker-build-verify` (Docker image build verification must pass)
   - `trivy-scan` (No CRITICAL/HIGH vulnerabilities)

### Commit Message Format
Please use clear, descriptive commit messages. Since we use squash merging, the PR title will become the final commit message on `main`. Follow this style:
`feat(component): add support for X` or `fix(auth): resolve memory leak`.
