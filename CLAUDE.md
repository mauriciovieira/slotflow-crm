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

**Always prefer `make` targets over running `pytest`, `npm`, `ruff`, or `eslint` directly.** The Makefiles at repo root and in `backend/`, `frontend/`, `e2e/` encode the canonical invocation — including the correct virtualenv, settings module, environment variables, and cross-package ordering. Reach for a raw command only when a `make` target doesn't exist for what you need (single-test runs, one-off debugging).

All from the repo root. Requires `backend/.venv` to exist first (`cd backend && python -m venv .venv`).

```bash
make install            # backend install-dev + frontend npm ci + e2e npm ci + Playwright Chromium
make bootstrap-local    # setup-local-db + migrate + ensure-superuser (first-run Postgres path)
make dev                # Honcho runs API + Celery via Procfile.dev
make lint               # ruff check/format + eslint
make test               # backend pytest + frontend vitest
make test-e2e           # Playwright
make ci                 # lint + test-unit + test-e2e
```

From a subdirectory, `make -C backend test`, `make -C frontend lint`, etc., keep you on the `make` path.

Raw commands are only appropriate for things `make` doesn't cover — typically single-test runs:

```bash
backend/.venv/bin/python -m pytest backend/core/tests/views/healthz_test.py::test_healthz_returns_ok
(cd frontend && npx vitest run src/screens/Landing.test.tsx)
(cd e2e && npx playwright test tests/name.spec.ts)
```

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
- `opportunities/`, `resumes/`, `interviews/`, `insights/`, `fx/`, `audit/` — domain apps, mostly scaffolds. Add models/views here as each track lands. Tests live under `<app>/tests/<category>/<thing>_test.py` where `<category>` is one of `models`, `admin`, `views`, `api`, `services` (intent-based: a DRF endpoint test goes under `api/`, a Django-view test under `views/`, a management command or helper under `services/`). The repo-wide `backend/tests/` directory is reserved for cross-cutting suites that don't belong to a single app. Pytest discovery walks the whole backend tree for `*_test.py` files — see `backend/pyproject.toml::tool.pytest.ini_options`.
- `mcp/` — MCP (Model Context Protocol) integration. `mcp/auth.py` holds session-freshness enforcement for MCP endpoints.

### 2FA is mandatory

`Require2FAMiddleware` redirects any authenticated request outside `/healthz`, `/static/`, `/admin/`, `/accounts/`, `/2fa/` to `/2fa/setup/` (no confirmed TOTP device) or `/2fa/verify/`. When you add a new route, it will be gated by 2FA by default — test with a verified session or extend the middleware allowlist deliberately. Session auth is the only DRF auth class (`base.py::REST_FRAMEWORK`).

MCP endpoints additionally require a **fresh** OTP session (default 15 minutes) via `mcp.auth.require_fresh_2fa_session`. `mark_otp_session_fresh` is called after successful TOTP confirm/verify. Pattern for new MCP-style endpoints: call `require_fresh_2fa_session(request)` inside the view and return its `McpAuthError.status_code` on failure — see `core/views.py::McpPingView`.

**Dev-only 2FA bypass** (`core/auth_bypass.py::is_2fa_bypass_active`): when `SLOTFLOW_BYPASS_2FA` is truthy **and** `settings.DEBUG` is True, `Require2FAMiddleware` skips the redirect and `/api/auth/me/` reports `is_verified=true`. The DEBUG gate makes the flag inert in staging/production. Exists so Playwright e2e can exercise authenticated flows without computing TOTP. Never read the env var directly — always call `is_2fa_bypass_active()`. When the bypass flag is active the backend also exposes `POST /api/test/_reset/`, which flushes the DB and re-runs `seed_e2e_user`. Playwright hits it in `beforeEach` to start each spec from a known baseline. The endpoint returns 404 when bypass is inactive (i.e., in staging/production regardless of env flag).

### Audit log

`audit.write_audit_event(*, actor, action, entity=None, workspace=None, correlation_id=None, metadata=None)` is the canonical way to record a security-sensitive action (token issuance, opportunity archive, manual admin override, etc.). The helper freezes `actor_repr` at write so deletes don't reshape history, derives `entity_type`/`entity_id` from the model class + pk, and falls back to `core.middleware.correlation_id.get_correlation_id()` when no id is passed. The `AuditEvent` table is append-only; `AuditEventAdmin` has every write permission disabled. Two indexes are pre-built: `(action, -created_at)` for "last N events of action X" and `(entity_type, entity_id)` for "everything that ever happened to entity Y".

### Logging

Every request lands a stable `correlation_id` on `request.correlation_id`, on the `X-Request-ID` response header, and on a `contextvars.ContextVar` reachable via `core.middleware.correlation_id.get_correlation_id()`. The middleware reads `X-Request-ID` from upstream when it matches a safe charset (`^[A-Za-z0-9-]{8,64}$`), otherwise it mints a fresh `uuid.uuid4().hex`. The contextvar resets after each request so it does not leak between threads.

`SLOTFLOW_LOG_JSON=1` switches the root console handler to `core.logging.JsonFormatter`, which emits one JSON object per record (`timestamp`, `level`, `logger`, `message`, `module`, `func`, `line`, plus `correlation_id` when set, plus any `extra={...}` kwargs). Default is the human-readable `verbose` format so `make dev` output stays scannable; staging/production turn it on.

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

