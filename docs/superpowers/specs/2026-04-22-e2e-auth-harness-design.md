# E2E Auth Harness — Design

**Date:** 2026-04-22
**Status:** Approved (brainstorm), plan pending
**Scope:** PR D — first real Playwright end-to-end test over the merged auth flow (PR #12) using the dev-only `SLOTFLOW_BYPASS_2FA` flag.

## Goal

Deliver one Playwright test that exercises the full authenticated UX of a **non-admin** user:

1. Navigate to `/login`.
2. Submit valid credentials.
3. Land on `/` with a signed-in header visible.
4. Click Sign out.
5. Anonymous landing CTAs return.

The test is the canonical regression guard for any future change to the auth surface. It runs in CI on every PR to `main`, locally via `make test-e2e`.

The seeded e2e user is a plain user (`is_staff=False`, `is_superuser=False`). It never touches `/admin`. All interaction is through the React frontend + `/api/auth/*` REST endpoints.

## Non-goals

- Live TOTP entry. Bypass flag short-circuits 2FA; Playwright does not compute OTP codes.
- Multiple test users, role-based authz scenarios, workspace membership tests — blocked on Track 03 (Workspace/Membership models).
- Google / GitHub OAuth — buttons remain disabled placeholders.
- Page Object Model, Playwright fixture framework, parallel workers — deferred until a second UI-heavy spec lands (Track 07).
- MCP token-issuance flow — Track 04.
- Visual regression, accessibility snapshots.

## Architecture

Three moving parts:

### 1. Backend test-support surface (new)

- `backend/core/management/commands/seed_e2e_user.py` — idempotent Django management command. Creates one non-admin user (`username="e2e"`, `email="e2e@slotflow.test"`, `is_staff=False`, `is_superuser=False`). Password sourced from `SLOTFLOW_E2E_PASSWORD` (default `e2e-local-only`). No TOTP device is seeded — the bypass flag makes 2FA verification a no-op at the backend.
  - Guard: refuses to run when `settings.DEBUG=False`. Blocks accidental invocation against staging/prod. The env flag is not required — a developer can seed the test user in normal local dev without setting `SLOTFLOW_BYPASS_2FA`.

- `backend/core/api_test_reset.py` — DRF function view `POST /api/test/_reset/`.
  - Guard: `if not is_2fa_bypass_active(): raise Http404`. Hard-gated on `DEBUG=True` (enforced by `is_2fa_bypass_active()`).
  - Behavior: `call_command("flush", "--noinput", verbosity=0)` then `call_command("seed_e2e_user")`. Returns `{"status": "reset"}` JSON.
  - CSRF-exempt (`@csrf_exempt`) — same-origin test traffic, bypass-gated.

- `backend/core/middleware/require_2fa.py` — path allowlist gains `/api/test/` so the reset endpoint is reachable without a verified session.

- `backend/config/urls.py` — mounts `/api/test/_reset/`.

### 2. Playwright orchestration

- `e2e/playwright.config.ts`:
  - `baseURL: "http://localhost:5173"`.
  - `use: { baseURL, screenshot: "only-on-failure", trace: "retain-on-failure" }`.
  - `webServer: { command: "make -C .. dev", reuseExistingServer: true, url: "http://localhost:5173", env: { SLOTFLOW_BYPASS_2FA: "1" }, timeout: 120_000 }`.
    - `reuseExistingServer: true` means a developer running `SLOTFLOW_BYPASS_2FA=1 make dev` in one shell can immediately run `make test-e2e` in another. CI has no pre-running server, so Playwright spawns honcho itself.
  - `webServer.env` is merged into the honcho child process, so `SLOTFLOW_BYPASS_2FA` propagates to Django and unlocks both `Require2FAMiddleware` bypass and the `/api/test/_reset/` endpoint.

- `e2e/support/api.ts` — `resetDb(request: APIRequestContext): Promise<void>` that POSTs to `/api/test/_reset/` and throws on non-2xx.

- `e2e/support/selectors.ts` — string constants mirroring `frontend/src/testIds.ts`. Duplicated (not imported across package boundary) so `e2e/` stays a standalone npm workspace.

- `e2e/tests/auth.spec.ts` — single `test("authenticated non-admin user can sign in, see home, and sign out")`, wrapped in `test.describe("auth flow")`. `beforeEach` awaits `resetDb(request)`.

### 3. Frontend test-id layer

- `frontend/src/testIds.ts` (new) — exports named string constants used by both unit tests and e2e:
  - `LOGIN_USERNAME`, `LOGIN_PASSWORD`, `LOGIN_SUBMIT`
  - `SIGNED_IN_HEADER`, `SIGN_OUT_BUTTON`
  - `LANDING_CTA_PRIMARY`
- `frontend/src/screens/Login.tsx`, `Landing.tsx`, and the signed-in header/sign-out surface — render `data-testid={TestIds.X}` attributes.
- Existing frontend unit tests updated to reference the same constants. Keeps selectors drift-proof between the two test layers.

### 4. CI

- `.github/workflows/ci.yml` — new `test-e2e` job.
  - `services.postgres: postgres:18` (GitHub Actions service container).
  - `env: { SLOTFLOW_BYPASS_2FA: "1", POSTGRES_HOST: localhost, POSTGRES_PORT: 5432, POSTGRES_DB: slotflow, POSTGRES_USER: slotflow, POSTGRES_PASSWORD: slotflow }` (matching `.env.example` defaults).
  - Steps: checkout, setup python/node via mise, `make install`, `make setup-local-db`, `make test-e2e`.
  - On failure: upload `e2e/playwright-report/` as artifact.
  - Depends on existing `lint` + `test-unit` jobs. Blocks merge to `main`.

## Data flow

### CI run

1. Postgres service container up, role/DB created by `make setup-local-db`.
2. `make test-e2e` → `make -C e2e test` → `npx playwright test`.
3. Playwright `webServer` probes `http://localhost:5173` — unreachable, so spawns `make -C .. dev`. Honcho launches `backend` (8000), `worker`, `frontend` (5173) with `SLOTFLOW_BYPASS_2FA=1` merged into env. Playwright polls until 200 on baseURL (120s timeout).
4. Suite runs. Each `beforeEach` → `POST /api/test/_reset/` → backend flushes + reseeds.
5. Suite exits → Playwright SIGTERMs honcho. Actions runner tears down Postgres.

### Local run

- Dev shell 1: `SLOTFLOW_BYPASS_2FA=1 make dev`.
- Dev shell 2: `make test-e2e`. `reuseExistingServer: true` skips spawn; hits running 5173.

### Auth happy path (single test body)

```
beforeEach: resetDb(request)
test body:
  goto /login
  fill LOGIN_USERNAME, LOGIN_PASSWORD
  click LOGIN_SUBMIT
  wait for POST /api/auth/login/ → 200
  wait for GET /api/auth/me/ → { is_verified: true }   // bypass makes this true unconditionally
  assert getByTestId(SIGNED_IN_HEADER) visible at /
  click getByTestId(SIGN_OUT_BUTTON)
  wait for POST /api/auth/logout/ → 200
  assert getByTestId(LANDING_CTA_PRIMARY) visible
```

## Error handling

- **`seed_e2e_user` on non-DEBUG server** → `CommandError` with named message. CI job fails loudly rather than silently seeding against staging.
- **`/api/test/_reset/` when bypass inactive** → `Http404`. Same protection, same hard gate.
- **Playwright `webServer` timeout** → Playwright surfaces honcho stdout in the failure report. No silent hang.
- **`reuseExistingServer: true` against a server without the bypass flag** (dev forgot to export it) → login succeeds at the backend, but `/api/auth/me/` returns `{ is_verified: false }`, so `AuthGuard` keeps the user on `/2fa/verify`. The test includes an explicit `is_verified === true` assertion immediately after login that throws a named error (`"bypass flag not active on target server; set SLOTFLOW_BYPASS_2FA=1"`) so the failure mode is diagnosed in <1s instead of a 30s timeout.
- **Postgres down in CI** → job fails at `make setup-local-db`. No test run attempted; clear error in CI log.

## Security posture

- `/api/test/_reset/` and `seed_e2e_user` are **both** gated on `is_2fa_bypass_active()`.
- `is_2fa_bypass_active()` already requires `settings.DEBUG=True` **and** `SLOTFLOW_BYPASS_2FA` truthy. Staging/production ship with `DEBUG=False` → the reset endpoint returns 404 and the command refuses to run regardless of env flag.
- `/api/test/` path is allowlisted in `Require2FAMiddleware` only; it is not exempt from Django's other middleware (session, CSRF-exempt is applied per-view).
- `.env.example` documents the bypass flag + reset endpoint together and reiterates the staging/prod guard.

## Components to create / modify

**Create (backend):**
- `backend/core/management/commands/seed_e2e_user.py`
- `backend/core/api_test_reset.py`
- `backend/tests/test_seed_e2e_user.py`
- `backend/tests/test_api_test_reset.py`

**Modify (backend):**
- `backend/core/middleware/require_2fa.py` — allowlist `/api/test/`.
- `backend/config/urls.py` — mount `/api/test/_reset/`.

**Create (frontend):**
- `frontend/src/testIds.ts`

**Modify (frontend):**
- `frontend/src/screens/Login.tsx`, `Landing.tsx`, signed-in header/sign-out surface — add `data-testid` attributes from `testIds.ts`.
- Existing frontend unit tests — reference the same constants.

**Create (e2e):**
- `e2e/support/api.ts`
- `e2e/support/selectors.ts`
- `e2e/tests/auth.spec.ts`

**Modify (e2e):**
- `e2e/playwright.config.ts` — add `baseURL`, `webServer`, trace/screenshot defaults.

**Modify (CI + docs):**
- `.github/workflows/ci.yml` — new `test-e2e` job with Postgres service.
- `.env.example` — add `SLOTFLOW_E2E_PASSWORD` default, document `/api/test/_reset/` alongside `SLOTFLOW_BYPASS_2FA`.
- `CLAUDE.md` — short note under the 2FA section documenting the test-support endpoints' scope and guardrails.

## Testing

### Backend unit tests (SQLite via `conftest.py`)

`backend/tests/test_seed_e2e_user.py`:
- `test_creates_user_when_absent`
- `test_idempotent_on_repeat_run`
- `test_updates_password_when_env_changes`
- `test_refuses_when_debug_off`

`backend/tests/test_api_test_reset.py`:
- `test_returns_404_when_bypass_inactive` (default test settings, `is_2fa_bypass_active` returns False)
- `test_flushes_and_reseeds_when_bypass_active` (monkeypatch `is_2fa_bypass_active` → True; pre-existing row wiped, e2e user present)
- `test_allowlisted_by_require_2fa_middleware` (anonymous POST returns the view's response, not a 2FA redirect)
- `test_csrf_exempt` (POST without CSRF token returns 200 under bypass)

Runs inside `make test-unit` → `make ci`.

### Frontend unit tests

Existing tests for `Login.tsx`, `Landing.tsx`, and any sign-out surface updated to reference `testIds.ts` constants. No new files unless a selector lands on a currently untested component.

### E2E test

`e2e/tests/auth.spec.ts` — single `test("authenticated non-admin user can sign in, see home, and sign out")`. Assertions as described in **Data flow → Auth happy path**.

### Manual smoke (pre-merge halt)

Matches the PR #12 pattern. Before `gh pr create`:

```
# shell 1
SLOTFLOW_BYPASS_2FA=1 make dev

# shell 2
make test-e2e
# expect: 1 passed

# verify the guard: stop shell 1, restart without the flag
make dev                # shell 1, no bypass
make test-e2e           # shell 2
# expect: named failure "bypass flag not active on target server"
```

## CI gating

- New `test-e2e` job is a required check for merge into `main`.
- Playwright HTML report uploaded on failure.

## Open items

None as of approval. New decisions (e.g. POM, parallel workers) are explicitly deferred per **Non-goals**.
