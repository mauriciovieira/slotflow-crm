---
applyTo: "**"
---

# Slotflow CRM — repo-wide agent instructions

You are working in a Django + Vite + Playwright monorepo. **Read `CLAUDE.md` and `AGENTS.md` at the repo root before doing anything non-trivial.** They are the source of truth; this file is a tight repeat of the things agents most often get wrong.

## Copilot code review focus

Copilot code review reads only the beginning of long instruction files. Keep the highest-value review rules here and in `.github/copilot-instructions.md`.

- Prioritize security, auth/authz, data integrity, test gaps, and deployment risk over style nits.
- Local agent commands should use `make` targets when available; GitHub Actions workflows may invoke package tools directly.
- Do not request top-level Node or Python tooling; this repo has package-local toolchains.
- When reviewing PRs, apply the backend, frontend, and e2e scoped instruction files to touched paths.

## Layout (memorize this — do not "discover" it again)

```
slotflow-crm/
├── backend/                  Django 6 + DRF + Celery
│   ├── .venv/                Python virtualenv (created by `make install`)
│   ├── manage.py
│   ├── pyproject.toml        Ruff + pytest config
│   ├── conftest.py           Forces SQLite for the test run
│   ├── config/               Django project (settings, urls, celery)
│   ├── core/ identity/ tenancy/ opportunities/ resumes/
│   ├── interviews/ insights/ fx/ audit/ mcp/
│   └── tests/                Cross-cutting suites only; per-app tests
│                             live under `<app>/tests/<category>/`
├── frontend/                 Vite + TypeScript + React + Vitest
│   └── node_modules/         Installed by `make install` (npm ci)
├── e2e/                      Playwright + Chromium
│   └── node_modules/
├── .github/
│   ├── instructions/         You are reading these
│   └── WORKFLOW_TEMPLATES/pull_request.md   PR body template
└── Makefile                  Canonical entry point — use this
```

There is **no top-level `package.json`** and **no top-level `pyproject.toml`**. Each package owns its own toolchain. The repo-root `Makefile` orchestrates them.

## The single rule that prevents 80% of wasted turns

**Use `make`. Never reinvent the invocation.** Every `make` target encodes the correct virtualenv, settings module, environment variables, working directory, and ordering. If a `make` target exists for what you want, use it.

| Want to do | Run from repo root |
| --- | --- |
| Install everything | `make install` |
| Lint (backend ruff + frontend eslint) | `make lint` |
| Unit tests (backend pytest + frontend vitest) | `make test` |
| Playwright e2e | `make test-e2e` |
| Lint + unit + e2e | `make ci` |
| Backend only | `make -C backend test` / `make -C backend lint` |
| Frontend only | `make -C frontend test` / `make -C frontend lint` |
| Run dev (API + Celery via Honcho) | `make dev` |
| First-run Postgres setup | `make bootstrap-local` |

Raw `pytest`, `npx vitest`, `npm test`, `ruff`, `eslint` are only acceptable when no `make` target covers your case (typically a single test file or a single test ID). Even then, prefer:

```bash
backend/.venv/bin/python -m pytest backend/<app>/tests/<category>/<thing>_test.py::test_name
(cd frontend && npx vitest run src/path/Thing.test.tsx)
(cd e2e && npx playwright test tests/name.spec.ts)
```

## Things agents repeatedly get wrong

1. **`backend/.venv/` exists.** It is created by `make install`. Use `backend/.venv/bin/python` and `backend/.venv/bin/pytest`, not the system Python. Never `pip install` into the system interpreter. If `.venv` is missing, run `cd backend && python -m venv .venv && cd .. && make install` — do **not** `pip install -r requirements.txt` system-wide.
2. **The backend is not "structured differently".** It is a standard Django project where `manage.py`, `pyproject.toml`, and the apps live directly under `backend/`. Each Django app is a sibling of `config/`. This is intentional and documented in `CLAUDE.md`. Treat it as the baseline.
3. **Frontend deps install via `make install`** (which calls `npm ci` under the hood). If `frontend/node_modules` is missing, run `make install` — never `npm install` (use `npm ci` for reproducible installs from the lockfile).
4. **Tests use SQLite, not Postgres.** `backend/conftest.py` sets `SLOTFLOW_USE_SQLITE=1` for the pytest run. Do not provision Postgres just to run tests. Postgres is only needed for `make dev` / `make bootstrap-local`.
5. **`.env` is required for `make` targets that touch the DB.** Copy from `.env.example` if missing. Tests do not need `.env`.
6. **`.claude/settings.local.json` is gitignored** and must stay that way (per-machine permission churn).

## Git workflow (non-negotiable)

- **Never work directly on `main`.** Use a worktree under `.worktrees/<name>/`. From a fresh worktree run `make setup-worktree` to symlink `backend/.venv`, `frontend/node_modules`, `e2e/node_modules` and copy `.env` from the main checkout.
- **Conventional Commits are mandatory.** They drive five independent semantic-release pipelines (backend, frontend, e2e, docs, root). Allowed prefixes: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `style`, `perf`, `ci`, `build`. Subject ≤72 chars, imperative mood. Scope optional, e.g. `feat(interviews): ...`.
- **`fetch.prune` should be on**: `git config --global fetch.prune true`. After a PR merges, drop local branches whose upstream is gone.

## Pull requests

When opening a PR with `gh pr create`:

1. **Fully fill `.github/WORKFLOW_TEMPLATES/pull_request.md` first** — replace every placeholder, every lone `-` bullet, every instructional comment. The body must read like finished review notes for *this* change.
2. Pass it via `--body-file <path>`. Never use the default template text on a real PR.
3. Title in Conventional Commits format.
4. If a PR was opened with empty/generic text, fix it immediately: `gh pr edit <number> --body-file <path>`.

## Domain rules you will hit (see `CLAUDE.md` for detail)

- **2FA is mandatory.** `Require2FAMiddleware` redirects every authenticated route outside an explicit allowlist to `/2fa/setup/` or `/2fa/verify/`. New routes are gated by default — extend the allowlist deliberately, never accidentally.
- **Dev-only 2FA bypass** for Playwright: `SLOTFLOW_BYPASS_2FA=1` + `DEBUG=True`. Always check via `core.auth_bypass.is_2fa_bypass_active()`, never read the env var directly. The `POST /api/test/_reset/` endpoint is exposed only when bypass is active.
- **Workspace authz** goes through `tenancy/permissions.py`: `get_membership`, `user_has_workspace_role`, `require_membership`. Do not roll your own.
- **Audit-worthy actions** call `audit.write_audit_event(*, actor, action, entity=None, workspace=None, correlation_id=None, metadata=None)`. The `AuditEvent` table is append-only; admin writes are disabled.
- **Correlation IDs**: every request carries one on `request.correlation_id`, on the `X-Request-ID` response header, and on a contextvar reachable via `core.middleware.correlation_id.get_correlation_id()`. Use that contextvar from background code (Celery, signals).
- **Celery queues**: `imports`, `render`, `insights`, `fx`, `default`. New tasks belonging to a dedicated queue must be added to `CELERY_TASK_ROUTES` in `config/settings/base.py`.

## When in doubt

`make help` (repo root) prints every target with a short description. Run it before guessing.
