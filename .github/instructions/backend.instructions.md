---
applyTo: "backend/**"
---

# Backend (Django + DRF + Celery)

Read `repo.instructions.md` first. This file covers backend-specific gotchas.

## Copilot review priorities

- Flag authenticated routes that accidentally bypass `Require2FAMiddleware`, session auth, or workspace checks in `tenancy/permissions.py`.
- Flag direct writes to `AuditEvent`; audit-worthy actions must call `audit.write_audit_event(...)`.
- Flag direct reads of `SLOTFLOW_BYPASS_2FA`; code must use `core.auth_bypass.is_2fa_bypass_active()`.
- For MCP endpoints, verify they enforce a fresh OTP session with `mcp.auth.require_fresh_2fa_session`.
- For new Celery tasks on dedicated queues, verify `CELERY_TASK_ROUTES` is updated.
- Expect focused pytest coverage under the owning app's `tests/<category>/` directory.

## Toolchain

- **Python virtualenv:** `backend/.venv/` (created by `make install`). Use `backend/.venv/bin/python` and `backend/.venv/bin/pytest`. Never use the system interpreter.
- **Lint/format:** Ruff (`make -C backend lint`, `make -C backend format`). Config in `backend/pyproject.toml`.
- **Tests:** pytest (`make -C backend test`). `conftest.py` forces `SLOTFLOW_USE_SQLITE=1`, so tests do not need Postgres.
- **Settings:** `DJANGO_SETTINGS_MODULE` defaults to `config.settings.local` via `manage.py` and `config/celery.py`. Splits: `base` / `local` / `staging` / `production`.

## App layout

Each Django app is a sibling of `config/` directly under `backend/` — `core/`, `identity/`, `tenancy/`, `opportunities/`, `resumes/`, `interviews/`, `insights/`, `fx/`, `audit/`, `mcp/`. New apps must be registered in `config/settings/base.py::INSTALLED_APPS`.

## Test layout (intent-based, not file-type-based)

Per-app tests live under `<app>/tests/<category>/<thing>_test.py`:

| Category | What goes here |
| --- | --- |
| `models/` | Model behavior, validators, manager methods, model `clean()` |
| `admin/` | Django admin configuration, list/detail/permissions |
| `views/` | Plain Django views (e.g. 2FA flow, server-rendered) |
| `api/` | DRF endpoints — serializers, viewsets, permissions, throttling |
| `services/` | Helpers, management commands, domain functions |

`backend/tests/` (the repo-wide directory) is reserved for **cross-cutting** suites that don't belong to a single app. Pytest discovery walks the whole backend tree for `*_test.py` (note the suffix, not the prefix — see `pyproject.toml::tool.pytest.ini_options`).

When adding a test, pick the category by **intent**: a test that hits a DRF route via the test client goes under `api/`, even if the file imports a model. A management-command test goes under `services/`.

## Auth & authz patterns

- Custom user: `AUTH_USER_MODEL = "identity.User"`.
- DRF auth: **session auth only** (`base.py::REST_FRAMEWORK`). No DRF token auth, no JWT.
- 2FA is enforced by `core.middleware.Require2FAMiddleware` for every authenticated request outside `/healthz`, `/static/`, `/admin/`, `/accounts/`, `/2fa/`. New routes are gated by default.
- MCP endpoints additionally require a **fresh** OTP session (default 15 min) via `mcp.auth.require_fresh_2fa_session`. Pattern: call it inside the view and return its `McpAuthError.status_code` on failure — see `core/views.py::McpPingView`.
- Workspace-scoped authz uses `tenancy/permissions.py`: `get_membership(user, workspace)`, `user_has_workspace_role(user, workspace, role)`, `require_membership(...)`. `MembershipRole` values: `owner`, `member`, `viewer`.
- Dev-only 2FA bypass: `SLOTFLOW_BYPASS_2FA=1` + `DEBUG=True`. Always check via `core.auth_bypass.is_2fa_bypass_active()`. The DEBUG gate makes the flag inert in staging/production.

## Audit log

`audit.write_audit_event(*, actor, action, entity=None, workspace=None, correlation_id=None, metadata=None)` is the **only** way to record a security-sensitive action. The helper:

- Freezes `actor_repr` at write so user deletes don't reshape history.
- Derives `entity_type` / `entity_id` from the model class + pk.
- Falls back to `core.middleware.correlation_id.get_correlation_id()` when `correlation_id` is not passed.

`AuditEvent` is append-only — `AuditEventAdmin` has every write permission disabled. Two indexes: `(action, -created_at)` for "last N events of action X", and `(entity_type, entity_id)` for "everything that happened to entity Y".

## Logging

- Every request lands a stable `correlation_id` on `request.correlation_id`, on the `X-Request-ID` response header, and on a `contextvars.ContextVar` reachable via `core.middleware.correlation_id.get_correlation_id()`.
- Upstream `X-Request-ID` is honored when it matches `^[A-Za-z0-9-]{8,64}$`; otherwise a fresh `uuid.uuid4().hex` is minted.
- `SLOTFLOW_LOG_JSON=1` swaps the root console handler to `core.logging.JsonFormatter` (one JSON object per record, includes `correlation_id` and any `extra={...}` kwargs). Default is human-readable for local dev; staging/production turn it on.

## Celery

- Broker + result backend: `REDIS_URL`.
- Queues: `imports`, `render`, `insights`, `fx`, `default`. Register new dedicated-queue tasks in `config/settings/base.py::CELERY_TASK_ROUTES`.
- Local Celery is started by `make dev` via `Procfile.dev` (Honcho). Render runs one process per service — the `Procfile` at the repo root is a reference for Render Start Commands, not a process manager Render reads itself.

## Migrations

- `make migrations` → `makemigrations`. `make migrate` → `migrate`. Both require `backend/.venv` and `.env`.
- App-scoped migrate: `make migrate app=core`.
- Reset DB locally (destructive): `make reset-local-db CONFIRM_RESET_LOCAL_DB=1`. The `CONFIRM_RESET_LOCAL_DB=1` guard exists deliberately — do not work around it.

## Common mistakes to avoid

- Calling `python -m pytest` directly without activating `backend/.venv` — fails because Django, DRF, pytest-django, etc. are only installed inside the venv.
- Adding a new authenticated route and forgetting it is now 2FA-gated.
- Writing audit data via `AuditEvent.objects.create(...)` instead of `write_audit_event(...)`. Don't.
- Reading `os.environ["SLOTFLOW_BYPASS_2FA"]` directly. Use `is_2fa_bypass_active()`.
- Creating tests under `backend/tests/` when they belong under `<app>/tests/<category>/`.
