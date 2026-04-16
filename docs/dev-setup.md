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
python -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements-dev.txt
```

Django defaults to **Postgres** settings from `config.settings.base`. For a quick local bootstrap without Docker, use SQLite:

```bash
cd backend
export SLOTFLOW_USE_SQLITE=1
export DJANGO_SETTINGS_MODULE=config.settings.local
python manage.py migrate
python manage.py runserver
```

For the full platform baseline (Postgres + Redis + Celery), run local Postgres/Redis with the defaults in `config.settings.base` (`slotflow` DB/user/password on `127.0.0.1:5432`, Redis on `127.0.0.1:6379`), then:

```bash
cd backend
export DJANGO_SETTINGS_MODULE=config.settings.local
python manage.py migrate
celery -A config worker -l info
```

Quality gates:

```bash
cd backend
make lint
make test
```

`backend/Makefile` automatically prefers `backend/.venv/bin/python` when present (CI uses the workflow Python environment instead).

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
