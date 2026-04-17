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

Create local Postgres user/database from variables defined in repo-root `.env`:

```bash
cp .env.example .env   # first time only
make setup-local-db
```

`make setup-local-db` validates `.env`, reads `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DB` (defaults to `slotflow` if not set), and creates role/database only when missing.

### One command: install and run the stack

1. **Create the backend virtualenv once** (if you do not have `backend/.venv` yet):

   ```bash
   cd backend && python3 -m venv .venv && cd ..
   ```

2. **Environment file:** copy the example and adjust if needed:

   ```bash
   cp .env.example .env
   ```

   Repo-root `.env` is loaded by [Honcho](https://github.com/nickstenning/honcho) for all processes in `Procfile.dev`. Django also loads repo-root `.env` and then `backend/.env` (see `backend/config/env.py`).

3. **Install Python and Node dependencies** (backend dev stack + frontend):

   ```bash
   make install
   ```

4. **Apply migrations** (first time or after model changes):

   ```bash
   cd backend && .venv/bin/python manage.py migrate && cd ..
   ```

5. **Run API + Celery together:**

   ```bash
   make dev
   ```

   This runs `honcho start -f Procfile.dev` from the repo root using `backend/.venv/bin/honcho`.

**Without Honcho** (separate terminals for debugging):

```bash
cd backend && source .venv/bin/activate
python manage.py runserver
# other terminal:
celery -A config worker -l info
```

`manage.py` defaults `DJANGO_SETTINGS_MODULE` to `config.settings.local`. You can set variables in `.env` instead of exporting them manually.

**Useful environment variables** (optional; see `.env.example`):

- `POSTGRES_*` — only if you are not using the defaults (`POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_HOST`, `POSTGRES_PORT`)
- `REDIS_URL` — defaults to `redis://127.0.0.1:6379/0`
- `DJANGO_DEBUG=1` — already implied by `local.py`

**Without PostgreSQL:** use SQLite for a quick start: set `SLOTFLOW_USE_SQLITE=1` in `.env` or export it when running commands (see `config.settings.local`).

### Makefile targets (summary)

| Location | Target | Purpose |
|----------|--------|---------|
| Repo root | `make install` | `backend` `install-dev` + `frontend` `install` (requires `backend/.venv`) |
| Repo root | `make dev` | Honcho: Django + Celery per `Procfile.dev` |
| `backend/` | `make install` | `pip install -r requirements.txt` |
| `backend/` | `make install-dev` | `pip install -r requirements-dev.txt` (includes base + dev tools such as Honcho) |
| `frontend/` | `make install` | `npm ci` |

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

### Deploying (Render)

Render does **not** execute a `Procfile` as a single multi-process app. Each line in the repo-root `Procfile` is a **reference** for the **Start Command** of a separate service (web, worker, etc.). Copy the command from `Procfile` into each Render service, or use [Environment Groups](https://render.com/docs/configure-environment-variables#environment-groups) for shared variables.

More detail and CI parity: `docs/dev-setup.md`. Functional specification: `docs/superpowers/specs/2026-04-16-slotflow-crm-design.md`.
