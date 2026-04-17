# Local development setup (Track 01 bootstrap)

This repository is being bootstrapped in implementation tracks. Track 01 establishes **local/CI parity** for lint, unit tests, and Playwright.

## Prerequisites

- Python **3.14+** (matches CI; use your preferred isolated environment: `python -m venv`, `uv`, etc.)
- Node.js **24+** and npm

## Quick start (full stack)

1. Install system services (Postgres, Redis) as in the root [README](../README.md).
2. `cp .env.example .env` at the repo root and edit if needed.
3. Create local Postgres role/database from repo-root `.env`: `make setup-local-db`.
4. Create `backend/.venv` once: `cd backend && python3 -m venv .venv`.
5. From the repo root: `make install` then `cd backend && .venv/bin/python manage.py migrate` then `make dev`.

Honcho reads repo-root `.env` for processes defined in `Procfile.dev`. Django loads repo-root `.env` first, then `backend/.env` (see `backend/config/env.py`).

## Commands

From repo root:

```bash
make install    # backend install-dev + frontend npm ci (needs backend/.venv)
make setup-local-db  # create role/database from .env POSTGRES_* values
make reset-local-db CONFIRM_RESET_LOCAL_DB=1  # drop + recreate local DB from .env values
make dev        # Honcho: API + Celery (Procfile.dev)
make lint
make test-unit
make test-e2e
make ci
```

### Backend

```bash
cd backend
python -m venv .venv
make install-dev
```

Django defaults to **Postgres** settings from `config.settings.base`. For a quick local bootstrap without Docker, use SQLite — set `SLOTFLOW_USE_SQLITE=1` in repo-root `.env` or export it:

```bash
cd backend
export SLOTFLOW_USE_SQLITE=1
export DJANGO_SETTINGS_MODULE=config.settings.local
python manage.py migrate
python manage.py runserver
```

For the full platform baseline (Postgres + Redis + Celery), use local Postgres/Redis with the defaults in `config.settings.base` (`slotflow` DB/user/password on `127.0.0.1:5432`, Redis on `127.0.0.1:6379`), then prefer **`make dev`** from the repo root instead of separate terminals.

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
make install   # npm ci
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

## Render

Render maps each **process type** to its **own** service with its own Start Command. The repo-root `Procfile` documents suggested commands; paste them into the Render dashboard or a Blueprint. Render does not run the whole `Procfile` on one dyno like Heroku’s multi-process formation.
