# Local development setup (Track 01 bootstrap)

This repository is being bootstrapped in implementation tracks. Track 01 establishes **local/CI parity** for lint, unit tests, and Playwright.

## Prerequisites

- Python **3.14+** (matches CI; use your preferred isolated environment: `python -m venv`, `uv`, etc.)
- Node.js **24+** and npm

## Commands

From repo root:

```bash
make lint
make test-unit
make test-e2e
make ci
```

### Backend

```bash
cd backend
python -m pip install -r requirements-dev.txt
make lint
make test
```

### Frontend

```bash
cd frontend
npm ci
npm test
npm run lint
```

### Playwright (e2e)

```bash
cd e2e
npm ci
npx playwright install chromium
npm test
```
