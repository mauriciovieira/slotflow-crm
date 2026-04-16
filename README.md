# Slotflow CRM

Multi-tenant CRM for job opportunities, interview pipelines, and résumés (MVP). Stack: **Django** (API + admin), **React** (frontend), **PostgreSQL**, **Redis**, and **Celery**.

## Local development (macOS)

### Tooling

| Purpose | How |
|--------|-----|
| Python **3.14** and Node **24** | **[mise](https://mise.jdx.dev/)** — from the repo root: `mise install` (reads `.tool-versions` and `.nvmrc`) |
| PostgreSQL **18** | **Homebrew** (`postgresql@18`), not via mise |
| Redis | **Homebrew** (`redis`), not via mise |

Enable mise in your shell (`mise activate` or your shell integration) so `python` and `node` resolve to the project versions.

### PostgreSQL and Redis (Homebrew)

```bash
brew install postgresql@18 redis
brew services start postgresql@18
brew services start redis
```

Add the PostgreSQL 18 `psql` client to your `PATH` (Apple Silicon often uses `/opt/homebrew/opt/postgresql@18/bin`; Intel: `/usr/local/opt/postgresql@18/bin`):

```bash
export PATH="$(brew --prefix postgresql@18)/bin:$PATH"
```

Create a role and database matching the defaults in Django `config.settings.base` (`slotflow` / `slotflow` on `127.0.0.1:5432`):

```bash
psql postgres -c "CREATE USER slotflow WITH PASSWORD 'slotflow';"
psql postgres -c "CREATE DATABASE slotflow OWNER slotflow;"
```

(If they already exist, ignore the error or run only `CREATE DATABASE` as needed.)

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements-dev.txt
export DJANGO_SETTINGS_MODULE=config.settings.local
python manage.py migrate
python manage.py runserver
```

Useful environment variables (optional; `backend/.env` is loaded automatically when present):

- `POSTGRES_*` — only if you are not using the defaults (`POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_HOST`, `POSTGRES_PORT`)
- `REDIS_URL` — defaults to `redis://127.0.0.1:6379/0`
- `DJANGO_DEBUG=1` — already implied by `local.py`

**Without PostgreSQL:** use SQLite for a quick start: `export SLOTFLOW_USE_SQLITE=1` (see `config.settings.local`).

**Celery (queues):** with Redis running:

```bash
cd backend && source .venv/bin/activate
export DJANGO_SETTINGS_MODULE=config.settings.local
celery -A config worker -l info
```

### Frontend and E2E

```bash
cd frontend && npm ci && npm run lint && npm test
cd e2e && npm ci && npx playwright install chromium && npm test
```

### All checks (lint + tests)

From the repository root:

```bash
make ci
```

More detail and CI parity: `docs/dev-setup.md`. Functional specification: `docs/superpowers/specs/2026-04-16-slotflow-crm-design.md`.
