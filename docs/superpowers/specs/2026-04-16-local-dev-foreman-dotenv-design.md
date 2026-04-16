# Local development: Foreman (`Procfile.dev`) and dotenv

**Status:** Draft for review  
**Date:** 2026-04-16  
**Scope:** Developer experience only (local workflow, env loading, and how production commands stay aligned). No application feature changes.

## 1. Problem

Running the stack today requires multiple terminals and mental overhead: Django, Celery (and optionally Celery Beat), and the frontend dev server are separate processes. README and `docs/dev-setup.md` instruct developers to `export` variables such as `DJANGO_SETTINGS_MODULE` in some flows, which is easy to forget and duplicates what should live in configuration.

The project should offer a **single command** to start the full local stack and a **single, conventional place** for non-secret and local-only configuration so developers rarely type `export` by hand.

## 2. Current state (as of this spec)

- **Backend:** `python-dotenv` is already a dependency. `config.settings.base` calls `load_env(BASE_DIR)`, which loads `backend/.env` when present (`override=False`), so values from the real environment still win.
- **Celery:** `backend/config/celery.py` sets `DJANGO_SETTINGS_MODULE` to `config.settings.local` if unset, reducing the need for exports when starting the worker from the backend package.
- **Frontend:** The repository may add a dev server (e.g. Vite) in a later track; the same process orchestration should cover it.
- **Render:** Deployment is service-based (CI triggers deploy hooks). There is no checked-in `render.yaml` in the repo root at the time of writing; production commands are configured per service in Render.

## 3. Goals

1. **One-shot local stack:** From the repo root (or documented working directory), one command starts API, worker(s), and frontend dev server together.
2. **No routine manual exports:** Required variables for local development are loaded from files and/or process manager defaults; README should not rely on “remember to export X” except for rare overrides.
3. **Clear env layering:** Document what belongs in which file, what is secret, and what is safe to commit as examples.
4. **Production alignment without false equivalence:** Keep **one canonical list of commands** (process types) that matches what Render runs per service, even though Render does **not** execute a Procfile as a multi-process supervisor.

## 4. Non-goals

- Replacing PostgreSQL/Redis installation (Homebrew/mise) with Docker in this spec.
- Changing Render pricing, scaling, or CI triggers.
- Storing production secrets in the repository.

## 5. Render and `Procfile` (important distinction)

**Heroku-style behavior:** A `Procfile` names multiple process types; the platform may run them and scale them.

**Render behavior:** Render does **not** run a `Procfile` as a single multi-process entrypoint. Each process type (web, worker, etc.) is typically a **separate service** with its own **Start Command** and environment. The official migration guidance maps each `Procfile` line to a Render Web Service or Background Worker start command (see [Migrate from Heroku to Render](https://render.com/docs/migrate-from-heroku)).

**Implication for this project:** Checking in a root `Procfile` (and/or `Procfile.dev`) is still valuable:

- **`Procfile.dev`:** Used **only locally** with Foreman (or equivalent) to run many processes on a developer machine.
- **`Procfile` (optional but recommended):** Serves as the **canonical command reference** for production/staging: each line’s command should match what is configured as the Start Command on the corresponding Render service. Render will not “read” the file automatically unless we adopt a blueprint that echoes those strings—teams often duplicate the command in the dashboard or generate `render.yaml` from the same source of truth.

**Recommendation:** Add `Procfile` with `web`, `worker`, and (if used) `beat` lines that mirror Render. Keep `Procfile.dev` for local-only extras (e.g. `frontend` or `vite`) that do not exist as separate production services.

## 6. Alternatives considered

| Approach | Pros | Cons |
|----------|------|------|
| **A. Foreman + `Procfile.dev` + root `.env`** (recommended) | Familiar Heroku-style file format; Foreman loads `.env` for child processes; one command | Requires Foreman (Ruby gem) or a compatible runner |
| **B. Honcho** | Python-native (`pip install honcho`), same Procfile format | Slightly different UX from Foreman; same modeling as A |
| **C. Docker Compose** | Reproducible full stack including DB | Heavier, slower iteration; not requested |
| **D. Makefile targets only** | No extra tools | Does not load `.env` uniformly; tends to duplicate commands |

**Recommendation:** **Option A** (Foreman + `Procfile.dev`). Document **Honcho** as an alternative for contributors who prefer not to install the Foreman gem, using the same `Procfile.dev`.

## 7. Proposed design

### 7.1 Process orchestration (local)

- Add **`Procfile.dev`** at the repository root (or under `backend/` if the team prefers—all tooling must agree on one path; **root is preferred** so frontend and backend commands live together).
- Example process names (exact commands to be finalized during implementation):
  - `web` — Django `runserver` (or `granian`/`uvicorn` if the project later moves to ASGI; keep spec wording generic).
  - `worker` — Celery worker.
  - `beat` — optional, only if scheduled tasks are used locally.
  - `frontend` — npm dev script when the frontend app exposes one.
- **Single entry command** (documented in README), e.g. `foreman start -f Procfile.dev` from repo root.
- Foreman loads a **`.env` file in the current working directory** by default for subprocesses, which removes the need to export variables for each terminal.

### 7.2 Dotenv layout

**Principle:** One developer-facing example file is committed; real local values stay untracked.

| File | Committed? | Purpose |
|------|------------|---------|
| `.env.example` | Yes | Lists all keys used locally with dummy or safe defaults; documents `DJANGO_SETTINGS_MODULE`, `REDIS_URL`, optional `POSTGRES_*`, frontend `VITE_*` if applicable. |
| `.env` | **No** (gitignored) | Developer machine: copy from `.env.example` and adjust. Loaded by Foreman for **all** processes in `Procfile.dev`. |
| `backend/.env` | **No** | Optional legacy path: today the backend loads it via `load_env`. |

**Unifying backend loading with root `.env`:**

- **Preferred:** Add repo-root `.env` to `.gitignore`, provide `.env.example`, and **extend** `load_env` (or `BASE_DIR` resolution) so Django also attempts `Path(__file__).resolve().parents[2] / ".env"` (repo root) **in addition to** `backend/.env`, with clear precedence: real OS environment > root `.env` > `backend/.env` (exact precedence to be implemented with `override=False` consistently).
- **Rationale:** Developers run Foreman from the repo root; Python tools started **without** Foreman (e.g. ad-hoc `python manage.py shell`) should still see the same variables if they load the root file.

**Security:** Never commit secrets. Use `.env.example` with placeholders; document secret rotation and Render Environment Groups for shared staging/production config.

### 7.3 Variables to document (non-exhaustive)

- `DJANGO_SETTINGS_MODULE` — default `config.settings.local` for local dev; set in `.env.example` so Foreman injects it and developers never rely on shell state.
- Database and Redis URLs consistent with `config.settings.base` / `local`.
- Frontend: any `VITE_*` or API base URL variables required for the dev server.

### 7.4 Tooling prerequisites

- Document **Foreman** installation (e.g. `gem install foreman` or bundler, per team preference).
- Optional: document **Honcho** as `honcho start -f Procfile.dev` for parity.

### 7.5 Production parity

- Add **`Procfile`** (production-oriented names only: `web`, `worker`, `beat`) whose commands match Render Start Commands.
- Update internal deployment docs (or README “Deploying” section) with a **table**: process type → Render service type → Start Command string (copied from `Procfile`).
- If the project later adds **`render.yaml`**, generate or maintain it so `startCommand` fields match `Procfile` lines to avoid drift.

## 8. Documentation updates (implementation phase)

- **README:** Replace “three terminals” with “one command” using Foreman; keep a short “without Foreman” subsection for debugging individual processes.
- **`docs/dev-setup.md`:** Same; reference `.env.example` and gitignored `.env`.
- **`.gitignore`:** Add `.env`, `.env.local`, and other common env filenames as needed so secrets are never committed.

## 9. Testing and verification

- **Manual:** Clone fresh copy, `cp .env.example .env`, `foreman start -f Procfile.dev`, confirm API, worker, and frontend (when present) start and talk to Redis/Postgres.
- **CI:** Unchanged expectation: CI does not depend on `.env`; workflows inject env explicitly.

## 10. Success criteria

1. A new contributor can follow README and run the full stack with **one** documented Foreman command and **no** required `export` statements for standard local development.
2. `.env.example` exists and lists variables; `.env` is gitignored.
3. Backend loads environment from repo-root `.env` when Foreman is not used (e.g. direct `manage.py` invocations), with documented precedence vs `backend/.env`.
4. `Procfile` (production commands) matches Render Start Commands; `Procfile.dev` includes local-only processes as needed.
5. Documentation states clearly that Render maps process types to **separate services**, not a single Heroku-style dyno running the whole Procfile.

## 11. Implementation follow-up

After this spec is approved, use the **writing-plans** workflow to break down: `.gitignore` / `.env.example`, `Procfile` files, `load_env` behavior, README and `docs/dev-setup.md`, and optional `render.yaml` alignment.
