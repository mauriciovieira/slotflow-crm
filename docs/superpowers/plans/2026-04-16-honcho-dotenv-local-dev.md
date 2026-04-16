# Honcho, dotenv, and Makefile local dev — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship repo-root Honcho (`Procfile.dev`), `.env` / `.env.example`, dual `load_env` (repo root then `backend/.`), Make targets (`install`, `install-dev`, `dev`), and production `Procfile` reference per `docs/superpowers/specs/2026-04-16-local-dev-honcho-dotenv-design.md`.

**Architecture:** Python loads env files in order: OS environment (unchanged) → repo-root `.env` → `backend/.env`, all with `override=False`. Root `make dev` runs `backend/.venv/bin/honcho` with cwd = repo root so Honcho reads root `.env`. Backend and frontend installs are delegated via Make; root `make install` runs backend `install-dev` then frontend `install`.

**Tech Stack:** Honcho, python-dotenv (existing), GNU Make, npm (`npm ci` with lockfile).

---

### Task 1: Repo-root env gitignore

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1:** Append ignore rules for `.env`, `.env.local`, and `.env.*.local` (keep `.env.example` tracked).

```gitignore
# Local env (never commit secrets)
.env
.env.local
.env.*.local
```

- [ ] **Step 2: Commit**

```bash
git add .gitignore
git commit -m "chore: gitignore local .env files"
```

---

### Task 2: Extend `load_env` for repo-root `.env`

**Files:**
- Modify: `backend/config/env.py`

- [ ] **Step 1:** Load repo-root `.env` before `backend/.env`. `BASE_DIR` in settings is the `backend/` directory, so repo root is `base_dir.parent`.

```python
def load_env(base_dir: Path) -> None:
    """Load local `.env` files if present (never required in production).

    Precedence for duplicate keys (with override=False): OS environment, then
    repo-root `.env`, then `backend/.env`.
    """

    repo_root = base_dir.parent
    load_dotenv(repo_root / ".env", override=False)
    load_dotenv(base_dir / ".env", override=False)
```

- [ ] **Step 2:** Run backend tests (no behavior change if files absent).

```bash
cd backend && make test
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add backend/config/env.py
git commit -m "feat: load repo-root .env before backend/.env"
```

---

### Task 3: Add `.env.example` at repository root

**Files:**
- Create: `.env.example`

- [ ] **Step 1:** Add documented keys aligned with `config.settings.base` / local dev (placeholders only).

```dotenv
# Copy to `.env` at the repo root and adjust. Never commit `.env`.

DJANGO_SETTINGS_MODULE=config.settings.local

# Optional overrides (defaults match local Postgres/Redis in base settings)
# POSTGRES_DB=slotflow
# POSTGRES_USER=slotflow
# POSTGRES_PASSWORD=slotflow
# POSTGRES_HOST=127.0.0.1
# POSTGRES_PORT=5432

REDIS_URL=redis://127.0.0.1:6379/0

# Quick start without Postgres: uncomment in backend-only workflows if needed
# SLOTFLOW_USE_SQLITE=1

# Frontend (when a Vite app is added)
# VITE_API_BASE_URL=http://127.0.0.1:8000
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "chore: add repo-root .env.example"
```

---

### Task 4: Add Honcho to dev requirements

**Files:**
- Modify: `backend/requirements-dev.txt`

- [ ] **Step 1:** Pin Honcho after the existing `-r requirements.txt` line.

```
honcho==2.0.0
```

(If PyPI resolution fails, bump to the latest 2.x pin.)

- [ ] **Step 2:** Reinstall and smoke-test import.

```bash
cd backend && python3 -m pip install -r requirements-dev.txt -q && python3 -c "import honcho; print('ok')"
```

- [ ] **Step 3: Commit**

```bash
git add backend/requirements-dev.txt
git commit -m "chore: add honcho to dev requirements"
```

---

### Task 5: Add `gunicorn` for production `Procfile` web process

**Files:**
- Modify: `backend/requirements.txt`

- [ ] **Step 1:** Add a pinned `gunicorn` (WSGI server for Render-style `web` commands).

```
gunicorn==23.0.0
```

- [ ] **Step 2:** `pip install` and quick `gunicorn --help` or import check.

- [ ] **Step 3: Commit**

```bash
git add backend/requirements.txt
git commit -m "chore: add gunicorn for production WSGI"
```

---

### Task 6: `Procfile.dev` and `Procfile`

**Files:**
- Create: `Procfile.dev`
- Create: `Procfile`

- [ ] **Step 1:** `Procfile.dev` — run Django and Celery from `backend/` using the local venv. No `beat` (not configured in repo yet). No `frontend` process until a `npm run dev` script exists (avoids Honcho failing).

```
web: bash -c 'cd backend && exec .venv/bin/python manage.py runserver'
worker: bash -c 'cd backend && exec .venv/bin/celery -A config worker -l info'
```

- [ ] **Step 2:** `Procfile` — commands intended for Render **Start Command** fields (run from repo layout; set `DJANGO_SETTINGS_MODULE` for production). `PORT` is set by Render for web services.

```
web: bash -c 'cd backend && export DJANGO_SETTINGS_MODULE=config.settings.production && exec gunicorn config.wsgi:application --bind 0.0.0.0:${PORT:-8000}'
worker: bash -c 'cd backend && export DJANGO_SETTINGS_MODULE=config.settings.production && exec celery -A config worker -l info'
```

- [ ] **Step 3: Commit**

```bash
git add Procfile.dev Procfile
git commit -m "chore: add Procfile.dev for Honcho and Procfile for Render parity"
```

---

### Task 7: Backend Makefile — `install` and `install-dev`

**Files:**
- Modify: `backend/Makefile`

- [ ] **Step 1:** Add phony targets and pip installs using existing `PY` helper.

```makefile
.PHONY: lint format test install install-dev

install:
	$(PY) -m pip install -r requirements.txt

install-dev:
	$(PY) -m pip install -r requirements-dev.txt
```

(Keep `lint`, `format`, `test` as they are; ensure `.PHONY` line includes new targets.)

- [ ] **Step 2:** Dry run.

```bash
cd backend && make install-dev
```

Expected: completes without error in a clean venv.

- [ ] **Step 3: Commit**

```bash
git add backend/Makefile
git commit -m "feat(backend): add make install and install-dev"
```

---

### Task 8: Frontend Makefile — `install`

**Files:**
- Modify: `frontend/Makefile`

- [ ] **Step 1:**

```makefile
.PHONY: lint test install

install:
	npm ci
```

- [ ] **Step 2:** `cd frontend && make install`

- [ ] **Step 3: Commit**

```bash
git add frontend/Makefile
git commit -m "feat(frontend): add make install (npm ci)"
```

---

### Task 9: Root Makefile — `install` and `dev`

**Files:**
- Modify: `Makefile` (repo root)

- [ ] **Step 1:** Add `install` (backend `install-dev` then frontend `install`) and `dev` (Honcho with checks).

```makefile
.PHONY: lint test-unit test-e2e ci install dev

install:
	$(MAKE) -C backend install-dev
	$(MAKE) -C frontend install

dev:
	@test -x backend/.venv/bin/honcho || (echo >&2 "Missing backend/.venv and Honcho. Run: make install"; exit 1)
	@cd "$(CURDIR)" && exec backend/.venv/bin/honcho start -f Procfile.dev
```

- [ ] **Step 2:** Verify `make dev` fails clearly without venv (optional manual), and succeeds after `make install` when Postgres/Redis are up (manual).

- [ ] **Step 3: Commit**

```bash
git add Makefile
git commit -m "feat: add root make install and make dev (Honcho)"
```

---

### Task 10: README and `docs/dev-setup.md`

**Files:**
- Modify: `README.md`
- Modify: `docs/dev-setup.md`

- [ ] **Step 1:** README — Replace multi-terminal backend section with: system deps (Postgres/Redis/mise) unchanged; then `cp .env.example .env`, `make install` at repo root, `make dev`. Document `make -C backend install` vs `install-dev` for production-only installs. Short “Without Honcho” subsection: run `manage.py` and `celery` manually from `backend/` with venv.

- [ ] **Step 2:** `docs/dev-setup.md` — Mirror Make targets; link `.env.example`; note Render maps each `Procfile` line to a separate service (not one dyno).

- [ ] **Step 3: Commit**

```bash
git add README.md docs/dev-setup.md
git commit -m "docs: document make install, make dev, and env files"
```

---

## Self-review (spec coverage)

| Spec section | Task |
|--------------|------|
| Honcho + `Procfile.dev` | Task 4, 6, 9 |
| Root `.env` + `.env.example` + gitignore | Task 1–3 |
| `load_env` repo root | Task 2 |
| Makefile table §7.6 | Task 7–9 |
| Production `Procfile` | Task 5–6 |
| Docs | Task 10 |

**Gaps addressed:** No `frontend` line in `Procfile.dev` until `npm run dev` exists — documented in README. No `beat` until Celery Beat is configured.

---

**Plan complete and saved to `docs/superpowers/plans/2026-04-16-honcho-dotenv-local-dev.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — Dispatch a fresh subagent per task, review between tasks.

**2. Inline Execution** — Execute tasks in this session with checkpoints.

**Which approach?**

(In this session we execute inline: user confirmed with “sim”.)
