# Local development: Honcho (`Procfile.dev`) and dotenv

**Status:** Implemented  
**Date:** 2026-04-16  
**Scope:** Developer experience only (local workflow, env loading, Makefile entrypoints, and how production commands stay aligned). No application feature changes.

**Implementation:** Implemented as part of the Honcho/dotenv local development work. Step-by-step plan and task checklist: [`docs/superpowers/plans/2026-04-16-honcho-dotenv-local-dev.md`](../plans/2026-04-16-honcho-dotenv-local-dev.md). Optional future work: `render.yaml` alignment when the team adds a Blueprint (see §7.5).

## 1. Problem

Running the stack today requires multiple terminals and mental overhead: Django, Celery (and optionally Celery Beat), and the frontend dev server are separate processes. README and `docs/dev-setup.md` instruct developers to `export` variables such as `DJANGO_SETTINGS_MODULE` in some flows, which is easy to forget and duplicates what should live in configuration.

The project should offer a **single command** to start the full local stack and a **single, conventional place** for non-secret and local-only configuration so developers rarely type `export` by hand.

## 2. Current state (as of this spec)

- **Backend:** `python-dotenv` is already a dependency. `config.settings.base` calls `load_env(BASE_DIR)`, which loads `backend/.env` when present (`override=False`), so values from the real environment still win.
- **Celery:** `backend/config/celery.py` sets `DJANGO_SETTINGS_MODULE` to `config.settings.local` if unset, reducing the need for exports when starting the worker from the backend package.
- **Frontend:** The repository may add a dev server (e.g. Vite) in a later track; the same process orchestration should cover it.
- **Render:** Deployment is service-based (CI triggers deploy hooks). There is no checked-in `render.yaml` in the repo root at the time of writing; production commands are configured per service in Render.

## 3. Goals

1. **One-shot local stack:** From the repo root, `make dev` starts API, worker(s), and frontend dev server together via Honcho.
2. **One-shot install:** From the repo root, `make install` installs backend and frontend dependencies (see §7.6).
3. **No routine manual exports:** Required variables for local development are loaded from files and/or process manager defaults; README should not rely on “remember to export X” except for rare overrides.
4. **Clear env layering:** Document what belongs in which file, what is secret, and what is safe to commit as examples.
5. **Production alignment without false equivalence:** Keep **one canonical list of commands** (process types) that matches what Render runs per service, even though Render does **not** execute a Procfile as a multi-process supervisor.

## 4. Non-goals

- Replacing PostgreSQL/Redis installation (Homebrew/mise) with Docker in this spec.
- Changing Render pricing, scaling, or CI triggers.
- Storing production secrets in the repository.

## 5. Render and `Procfile` (important distinction)

**Heroku-style behavior:** A `Procfile` names multiple process types; the platform may run them and scale them.

**Render behavior:** Render does **not** run a `Procfile` as a single multi-process entrypoint. Each process type (web, worker, etc.) is typically a **separate service** with its own **Start Command** and environment. The official migration guidance maps each `Procfile` line to a Render Web Service or Background Worker start command (see [Migrate from Heroku to Render](https://render.com/docs/migrate-from-heroku)).

**Implication for this project:** Checking in a root `Procfile` (and/or `Procfile.dev`) is still valuable:

- **`Procfile.dev`:** Used **only locally** with **Honcho** to run many processes on a developer machine.
- **`Procfile` (optional but recommended):** Serves as the **canonical command reference** for production/staging: each line’s command should match what is configured as the Start Command on the corresponding Render service. Render will not “read” the file automatically unless we adopt a blueprint that echoes those strings—teams often duplicate the command in the dashboard or generate `render.yaml` from the same source of truth.

**Recommendation:** Add `Procfile` with `web`, `worker`, and (if used) `beat` lines that mirror Render. Keep `Procfile.dev` for local-only extras (e.g. `frontend` or `vite`) that do not exist as separate production services.

## 6. Alternatives considered

| Approach | Pros | Cons |
|----------|------|------|
| **A. Honcho + `Procfile.dev` + root `.env`** (chosen) | Python-native; same Procfile format as Heroku; Honcho loads `.env` for child processes; aligns with Django/Celery toolchain | Contributors need Python venv with dev deps (including Honcho) for `make dev` |
| **B. Foreman** | Familiar Ruby ecosystem | Extra runtime (Ruby/gem) for a Python-first repo |
| **C. Docker Compose** | Reproducible full stack including DB | Heavier, slower iteration; not requested |
| **D. Makefile targets only** | No procfile runner | Does not load `.env` uniformly; tends to duplicate commands |

**Recommendation:** **Honcho** with `Procfile.dev` at the repo root. Add **Honcho** to `backend/requirements-dev.txt` so it is installed with `make install-dev` (backend) or via root `make install`.

## 7. Proposed design

### 7.1 Process orchestration (local)

- Add **`Procfile.dev`** at the repository root (**root is required** so frontend and backend commands live together and Honcho’s working directory matches `.env`).
- Example process names (exact commands to be finalized during implementation):
  - `web` — Django `runserver` (or `granian`/`uvicorn` if the project later moves to ASGI; keep spec wording generic).
  - `worker` — Celery worker.
  - `beat` — optional, only if scheduled tasks are used locally.
  - `frontend` — npm dev script when the frontend app exposes one.
- **Primary entry command:** `make dev` from the **repository root** (see §7.6), which runs Honcho against `Procfile.dev`.
- **Honcho:** `honcho start -f Procfile.dev` (equivalently invoked by `make dev`). Honcho loads a **`.env` file in the current working directory** for subprocesses, which removes the need to export variables in each terminal.

### 7.2 Dotenv layout

**Principle:** One developer-facing example file is committed; real local values stay untracked.

| File | Committed? | Purpose |
|------|------------|---------|
| `.env.example` | Yes | Lists all keys used locally with dummy or safe defaults; documents `DJANGO_SETTINGS_MODULE`, `REDIS_URL`, optional `POSTGRES_*`, frontend `VITE_*` if applicable. |
| `.env` | **No** (gitignored) | Developer machine: copy from `.env.example` and adjust. Loaded by Honcho for **all** processes in `Procfile.dev`. |
| `backend/.env` | **No** | Optional legacy path: today the backend loads it via `load_env`. |

**Unifying backend loading with root `.env`:**

- **Preferred:** Add repo-root `.env` to `.gitignore`, provide `.env.example`, and **extend** `load_env` (or `BASE_DIR` resolution) so Django also attempts the repo root `.env` **in addition to** `backend/.env`, with clear precedence: real OS environment > root `.env` > `backend/.env` (exact precedence to be implemented with `override=False` consistently).
- **Rationale:** Developers run Honcho from the repo root; Python tools started **without** Honcho (e.g. ad-hoc `python manage.py shell`) should still see the same variables if they load the root file.

**Security:** Never commit secrets. Use `.env.example` with placeholders; document secret rotation and Render Environment Groups for shared staging/production config.

### 7.3 Variables to document (non-exhaustive)

- `DJANGO_SETTINGS_MODULE` — default `config.settings.local` for local dev; set in `.env.example` so Honcho injects it and developers never rely on shell state.
- Database and Redis URLs consistent with `config.settings.base` / `local`.
- Frontend: any `VITE_*` or API base URL variables required for the dev server.

### 7.4 Tooling prerequisites

- **Python venv** under `backend/.venv` (or documented equivalent) with **`make install-dev`** so Honcho and other dev tools are available.
- Document that **`make dev`** at the repo root expects Honcho to be installed (via backend dev dependencies). Direct invocation: `honcho start -f Procfile.dev` from repo root after activating the backend venv (or using `backend/.venv/bin/honcho` from `make dev`).

### 7.5 Production parity

- Add **`Procfile`** (production-oriented names only: `web`, `worker`, `beat`) whose commands match Render Start Commands.
- Update internal deployment docs (or README “Deploying” section) with a **table**: process type → Render service type → Start Command string (copied from `Procfile`).
- If the project later adds **`render.yaml`**, generate or maintain it so `startCommand` fields match `Procfile` lines to avoid drift.

### 7.6 Makefile conventions

Standardize install and dev entrypoints so README stays short.

**Backend** (`backend/Makefile`):

| Target | Behavior |
|--------|----------|
| `make install` | Install production/runtime dependencies: `pip install -r requirements.txt` (using `backend/.venv` when present, same pattern as existing quality targets). |
| `make install-dev` | Install full local dev stack: `pip install -r requirements-dev.txt`, which **already includes** base deps via `-r requirements.txt` in `requirements-dev.txt`. |

**Frontend** (`frontend/Makefile`):

| Target | Behavior |
|--------|----------|
| `make install` | Install frontend dependencies (e.g. `npm ci` once a lockfile workflow exists; `npm install` if documented for bootstrap). Exact command finalized during implementation to match the repo’s npm policy. |

**Repository root** (`Makefile`):

| Target | Behavior |
|--------|----------|
| `make install` | Install **everything** needed for local development: delegate to `$(MAKE) -C backend install-dev` and `$(MAKE) -C frontend install` (order: backend then frontend unless a dependency dictates otherwise). Optionally document one-time system deps (Postgres, Redis, mise) separately in README. |
| `make dev` | Run Honcho from the repo root: `honcho start -f Procfile.dev`, using the backend virtualenv’s `honcho` (e.g. `backend/.venv/bin/honcho` or `cd backend && .venv/bin/honcho ...` with root as cwd for `.env` — implementation must ensure **working directory is repo root** so `.env` and `Procfile.dev` resolve correctly). |

**Note:** Root `make dev` must not silently fail if `.venv` is missing; it should error with a clear message pointing to `make install` / `make install-dev`.

## 8. Documentation updates (implementation phase)

- **README:** Replace “three terminals” with `make install` once, then `make dev`; keep a short “without Honcho” subsection for debugging individual processes.
- **`docs/dev-setup.md`:** Same; reference `.env.example` and gitignored `.env`; document backend/frontend/root Make targets.
- **`.gitignore`:** Add `.env`, `.env.local`, and other common env filenames as needed so secrets are never committed.

## 9. Testing and verification

- **Manual:** Clone fresh copy, `cp .env.example .env`, run `make install` at repo root, then `make dev`; confirm API, worker, and frontend (when present) start and talk to Redis/Postgres.
- **CI:** Unchanged expectation: CI does not depend on `.env`; workflows inject env explicitly.

## 10. Success criteria

1. A new contributor can follow README: `make install`, then `make dev`, with **no** required `export` statements for standard local development.
2. `.env.example` exists and lists variables; `.env` is gitignored.
3. Backend loads environment from repo-root `.env` when Honcho is not used (e.g. direct `manage.py` invocations), with documented precedence vs `backend/.env`.
4. `Procfile` (production commands) matches Render Start Commands; `Procfile.dev` includes local-only processes as needed.
5. Documentation states clearly that Render maps process types to **separate services**, not a single Heroku-style dyno running the whole Procfile.
6. `make install` / `make install-dev` / `make dev` behave as specified in §7.6 for backend, frontend, and repo root.

## 11. Implementation follow-up

**Done:** The **writing-plans** breakdown is in [`docs/superpowers/plans/2026-04-16-honcho-dotenv-local-dev.md`](../plans/2026-04-16-honcho-dotenv-local-dev.md); implementation matches that plan (root `.env` / `.env.example`, `Procfile` + `Procfile.dev`, Honcho + gunicorn deps, Make targets, `load_env` repo root, README and `docs/dev-setup.md`). **Not done here:** optional `render.yaml` alignment (still no checked-in Blueprint at land time).
