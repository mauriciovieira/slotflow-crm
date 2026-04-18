# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

Three sibling packages orchestrated from the repo root:

- `backend/` — Django 6 + DRF + Celery; the API, admin, MCP endpoints.
- `frontend/` — Vite/TypeScript + Vitest (currently a scaffold; real app not yet implemented).
- `e2e/` — Playwright test harness.

`AGENTS.md` applies to all AI coding agents (Cursor, Claude, Copilot). Read it for the git/PR workflow rules — worktrees under `.worktrees/`, Conventional Commits, `gh pr create` with the filled-in `.github/WORKFLOW_TEMPLATES/pull_request.md` body.

`DESIGN.md` is the Mintlify-inspired visual design spec for any frontend work (colors, type scale, spacing, radii). Consult it before building UI.

## Common commands

All from the repo root. Requires `backend/.venv` to exist first (`cd backend && python -m venv .venv`).

```bash
make install            # backend install-dev + frontend npm ci
make bootstrap-local    # setup-local-db + migrate + ensure-superuser (first-run Postgres path)
make dev                # Honcho runs API + Celery via Procfile.dev
make lint               # ruff check/format + eslint
make test               # backend pytest + frontend vitest
make test-e2e           # Playwright
make ci                 # lint + test-unit + test-e2e
```

Backend (from `backend/`, `.venv/bin/python` is preferred when present):

```bash
.venv/bin/python manage.py migrate
.venv/bin/python manage.py runserver
.venv/bin/celery -A config worker -l info
.venv/bin/python -m pytest tests/test_healthz.py         # single test file
.venv/bin/python -m pytest tests/test_healthz.py::test_healthz_returns_ok   # single test
.venv/bin/python -m ruff format .                        # autoformat
```

Frontend (from `frontend/`): `npm test` (Vitest, `node` environment), `npm run lint`. Run a single test with `npx vitest run path/to/file.test.ts`.

E2E (from `e2e/`): `npx playwright install chromium` once, then `npm test`. Run a single test with `npx playwright test tests/name.spec.ts`.

## Database bootstrap

Local Postgres (Homebrew `postgresql@18`) is the default. The repo never creates the DB implicitly — you must run `make setup-local-db` (reads `.env` for `POSTGRES_*`, creates role with `CREATEDB` so Django tests can create the test DB). Reset with `make reset-local-db CONFIRM_RESET_LOCAL_DB=1`.

Alternative: set `SLOTFLOW_USE_SQLITE=1` in `.env` for a no-Postgres quick start. The pytest `conftest.py` already forces this for the test run, so **backend tests always use SQLite** regardless of your local dev DB.

## Env loading

`backend/config/env.py::load_env` loads repo-root `.env` first, then `backend/.env` (neither overrides OS env). Honcho (`Procfile.dev`) reads repo-root `.env` for all processes. `DJANGO_SETTINGS_MODULE` defaults to `config.settings.local` via `manage.py` and `config/celery.py`.

## Architecture

### Django apps (all live under `backend/`)

Project config is `config/`; each domain is a first-class app. When adding a new app, register it in `config/settings/base.py::INSTALLED_APPS` and, for Celery tasks, route new queues under `CELERY_TASK_ROUTES`.

- `core/` — shared models (`TimeStampedModel`, `SoftDeleteModel`), views (`HealthzView`, `HomeView`, 2FA flow), `Require2FAMiddleware`, placeholder Celery tasks wired to named queues (`imports`, `render`, `insights`, `fx`), `ensure_superuser` management command.
- `identity/` — custom `User` model (`AUTH_USER_MODEL = "identity.User"`) and admin side-effects (OTP admin site).
- `tenancy/` — multi-tenant primitives: `Workspace`, `Membership` with `MembershipRole` (owner/member/viewer). `tenancy/permissions.py` exposes `get_membership`, `user_has_workspace_role`, `require_membership` — use these for any workspace-scoped authz.
- `opportunities/`, `resumes/`, `interviews/`, `insights/`, `fx/`, `audit/` — domain apps, mostly scaffolds. Add models/views here as each track lands.
- `mcp/` — MCP (Model Context Protocol) integration. `mcp/auth.py` holds session-freshness enforcement for MCP endpoints.

### 2FA is mandatory

`Require2FAMiddleware` redirects any authenticated request outside `/healthz`, `/static/`, `/admin/`, `/accounts/`, `/2fa/` to `/2fa/setup/` (no confirmed TOTP device) or `/2fa/verify/`. When you add a new route, it will be gated by 2FA by default — test with a verified session or extend the middleware allowlist deliberately. Session auth is the only DRF auth class (`base.py::REST_FRAMEWORK`).

MCP endpoints additionally require a **fresh** OTP session (default 15 minutes) via `mcp.auth.require_fresh_2fa_session`. `mark_otp_session_fresh` is called after successful TOTP confirm/verify. Pattern for new MCP-style endpoints: call `require_fresh_2fa_session(request)` inside the view and return its `McpAuthError.status_code` on failure — see `core/views.py::McpPingView`.

### Celery

Broker + result backend both default to `REDIS_URL`. Four named queues (`imports`, `render`, `insights`, `fx`) plus `default`. When adding a task, register it in `CELERY_TASK_ROUTES` if it belongs on a dedicated queue; otherwise it runs on `default`.

### Settings split

`config/settings/{base,local,staging,production}.py`. `local.py` sets `DEBUG=True` and honors `SLOTFLOW_USE_SQLITE`. `base.py` reads all secrets/config from env vars with local-friendly defaults.

## Deployment (Render)

Render runs **one process per service**, not the whole `Procfile`. The repo-root `Procfile` is a **reference** for Render Start Commands — copy each line into the matching service (web, worker). Never assume Render will fan out the Procfile.

## Release automation

Five independent SemVer lines, all driven by Conventional Commits on `main` via a single consolidated workflow (`.github/workflows/release.yml`) that runs each line sequentially:

- Backend: `python-semantic-release` driven by `backend/pyproject.toml`; tags `backend-v{version}`, scope `^backend`.
- Frontend: `semantic-release` with `semantic-release-commit-filter`; tags `frontend-v{version}`.
- E2E: same as frontend but under `e2e/`; tags `e2e-v{version}`.
- Docs: same pattern under `docs/` (a minimal `docs/package.json` anchors the toolchain); tags `docs-v{version}`.
- Root: `.release/root/` with a local filter plugin that excludes commits whose files all live under `backend/`, `frontend/`, `e2e/`, `docs/`, or equal `RELEASES.md`; tags `root-v{version}`; notes written to repo-root `CHANGELOG.md`.

`RELEASES.md` at the repo root is a chronological index across all five lines (not a changelog itself). After each package release, the workflow prepends a dated entry via `scripts/prepend-root-changelog.sh`. Design: `docs/superpowers/specs/2026-04-18-five-package-releases-design.md`.

## House rules (from AGENTS.md)

- Superpowers brainstorming sessions use worktrees under `.worktrees/`.
- Conventional Commits are required — they drive all five semantic-release pipelines.
- Keep local git in sync: `git fetch origin --prune`; after a PR merges, remove local branches whose upstream is gone.
- PR bodies come from `.github/WORKFLOW_TEMPLATES/pull_request.md` — fill it in fully before `gh pr create`; never ship with placeholder text.

