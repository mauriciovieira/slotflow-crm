# E2E Auth Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver one Playwright test that signs a non-admin user in through the React UI, lands them on `/`, signs them out, and asserts anonymous CTAs return — all running against the real Django + Vite stack under `SLOTFLOW_BYPASS_2FA=1`.

**Architecture:** Add a DEBUG-gated `seed_e2e_user` management command and a bypass-gated `POST /api/test/_reset/` endpoint; wire `data-testid` constants into Login + Landing via a new `frontend/src/testIds.ts`; teach Playwright's `webServer` to spawn (or reuse) `make dev` with the bypass flag; extend the existing CI `e2e` job with a Postgres service, Python, and the bypass env var.

**Tech Stack:** Django 6 / DRF (`@api_view`, management command), Playwright 1.57 (TypeScript `webServer` config + `APIRequestContext`), React 19, pytest + pytest-django, GitHub Actions (`services.postgres`).

**Design spec:** `docs/superpowers/specs/2026-04-22-e2e-auth-harness-design.md`.

---

## Preconditions

- Worktree exists at `.worktrees/feat-e2e-auth-harness` on branch `feat/e2e-auth-harness`, based on `main` at commit `f59687b` (the spec commit).
- Node 24 + Python 3.14 available locally. `backend/.venv` already exists from prior work or `make install` will be re-run.
- `make install` and `make bootstrap-local` (Postgres) succeed from the worktree root before starting Task 1.

## File structure (what this plan creates or modifies)

**Create (backend):**
- `backend/core/management/commands/seed_e2e_user.py` — idempotent non-admin user seed.
- `backend/core/api_test_reset.py` — `POST /api/test/_reset/` view + urlpatterns list.
- `backend/core/tests/services/seed_e2e_user_test.py`
- `backend/core/tests/api/test_reset_test.py`

**Modify (backend):**
- `backend/core/middleware/require_2fa.py` — allowlist `/api/test/`.
- `backend/config/urls.py` — mount `/api/test/` patterns.

**Create (frontend):**
- `frontend/src/testIds.ts` — exported string constants.

**Modify (frontend):**
- `frontend/src/screens/Login.tsx` — add `data-testid` to username/password/submit.
- `frontend/src/screens/Landing.tsx` — add `data-testid` to signed-in header, sign-out button, Get-started CTA.
- `frontend/src/screens/Login.test.tsx` — reference constants.
- `frontend/src/screens/Landing.test.tsx` — reference constants.

**Create (e2e):**
- `e2e/support/api.ts`
- `e2e/support/selectors.ts`
- `e2e/tests/auth.spec.ts`

**Modify (e2e):**
- `e2e/playwright.config.ts` — `baseURL`, `webServer`, trace/screenshot defaults.

**Modify (CI + docs):**
- `.github/workflows/ci.yml` — `e2e` job gains Postgres service, Python, Playwright-needs-stack env.
- `.env.example` — `SLOTFLOW_E2E_PASSWORD` line + reset-endpoint note.
- `CLAUDE.md` — add paragraph under the 2FA section documenting the test-support endpoints.

## Out of scope (explicit deferrals from spec)

- Live TOTP entry, OAuth buttons, MCP token UI, POM/fixture framework, parallel workers, visual regression, multiple workspace roles. All blocked on later tracks per the spec.

---

## Task 1: Backend — `seed_e2e_user` management command (red → green → commit)

**Files:**
- Create: `backend/core/management/commands/seed_e2e_user.py`
- Create: `backend/core/tests/services/seed_e2e_user_test.py`

- [ ] **Step 1: Write the failing tests**

Create `backend/core/tests/services/seed_e2e_user_test.py`:

```python
from __future__ import annotations

from io import StringIO

import pytest
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError

pytestmark = pytest.mark.django_db


def _run(**env):
    """Run the command with optional env overrides, capturing stdout."""
    out = StringIO()
    call_command("seed_e2e_user", stdout=out)
    return out.getvalue()


def test_creates_non_admin_user_when_absent(settings):
    settings.DEBUG = True
    User = get_user_model()
    assert not User.objects.filter(username="e2e").exists()

    _run()

    user = User.objects.get(username="e2e")
    assert user.email == "e2e@slotflow.test"
    assert user.is_staff is False
    assert user.is_superuser is False
    assert user.check_password("e2e-local-only") is True


def test_idempotent_on_repeat_run(settings):
    settings.DEBUG = True
    _run()
    _run()
    User = get_user_model()
    assert User.objects.filter(username="e2e").count() == 1


def test_updates_password_when_env_changes(monkeypatch, settings):
    settings.DEBUG = True
    _run()
    monkeypatch.setenv("SLOTFLOW_E2E_PASSWORD", "rotated-pw")
    _run()
    User = get_user_model()
    user = User.objects.get(username="e2e")
    assert user.check_password("rotated-pw") is True
    assert user.check_password("e2e-local-only") is False


def test_refuses_when_debug_off(settings):
    settings.DEBUG = False
    with pytest.raises(CommandError, match="DEBUG"):
        _run()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `backend/.venv/bin/python -m pytest backend/core/tests/services/seed_e2e_user_test.py -v`
Expected: FAIL — `Unknown command: 'seed_e2e_user'` (or equivalent).

- [ ] **Step 3: Write the command**

Create `backend/core/management/commands/seed_e2e_user.py`:

```python
"""Seed a non-admin user for Playwright e2e runs.

Idempotent. DEBUG-gated so staging/production cannot silently seed a test user.
Password comes from ``SLOTFLOW_E2E_PASSWORD`` (default ``e2e-local-only``).
No TOTP device is created; the e2e run sets ``SLOTFLOW_BYPASS_2FA=1`` so the
auth UI treats the session as verified without TOTP.
"""

from __future__ import annotations

import os

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError

E2E_USERNAME = "e2e"
E2E_EMAIL = "e2e@slotflow.test"
E2E_PASSWORD_ENV = "SLOTFLOW_E2E_PASSWORD"
E2E_PASSWORD_DEFAULT = "e2e-local-only"


class Command(BaseCommand):
    help = (
        "Create or update the non-admin e2e test user. Runs only under DEBUG; "
        "use inside Playwright runs or local dev. Password from "
        f"${E2E_PASSWORD_ENV} (default {E2E_PASSWORD_DEFAULT!r})."
    )

    def handle(self, *args, **options):
        if not settings.DEBUG:
            raise CommandError("seed_e2e_user only runs when DEBUG is True.")

        password = os.environ.get(E2E_PASSWORD_ENV) or E2E_PASSWORD_DEFAULT

        User = get_user_model()
        user, created = User.objects.update_or_create(
            username=E2E_USERNAME,
            defaults={
                "email": E2E_EMAIL,
                "is_staff": False,
                "is_superuser": False,
            },
        )
        user.set_password(password)
        user.save()

        action = "Created" if created else "Updated"
        self.stdout.write(self.style.SUCCESS(f"{action} e2e user {E2E_USERNAME!r}."))
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `backend/.venv/bin/python -m pytest backend/core/tests/services/seed_e2e_user_test.py -v`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/core/management/commands/seed_e2e_user.py backend/core/tests/services/seed_e2e_user_test.py
git commit -m "feat(backend): add seed_e2e_user management command (DEBUG-gated)"
```

---

## Task 2: Backend — `/api/test/_reset/` endpoint + middleware allowlist

**Files:**
- Create: `backend/core/api_test_reset.py`
- Create: `backend/core/tests/api/test_reset_test.py`
- Modify: `backend/core/middleware/require_2fa.py`
- Modify: `backend/config/urls.py`

- [ ] **Step 1: Write the failing tests**

Create `backend/core/tests/api/test_reset_test.py`:

```python
from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from django.test import Client

pytestmark = pytest.mark.django_db


@pytest.fixture
def bypass_on(monkeypatch):
    monkeypatch.setattr(
        "core.api_test_reset.is_2fa_bypass_active", lambda: True
    )
    monkeypatch.setattr(
        "core.middleware.require_2fa.is_2fa_bypass_active", lambda: True
    )


def test_returns_404_when_bypass_inactive():
    """Default test environment has bypass inactive -> 404."""
    client = Client(enforce_csrf_checks=False)
    response = client.post("/api/test/_reset/")
    assert response.status_code == 404


def test_flushes_and_reseeds_when_bypass_active(bypass_on):
    """Pre-existing row should be wiped; e2e user should exist after."""
    User = get_user_model()
    User.objects.create_user(username="ghost", email="ghost@example.com", password="x")

    client = Client(enforce_csrf_checks=False)
    response = client.post("/api/test/_reset/")

    assert response.status_code == 200, response.content
    assert response.json() == {"status": "reset"}
    assert not User.objects.filter(username="ghost").exists()
    assert User.objects.filter(username="e2e", is_staff=False, is_superuser=False).exists()


def test_allowlisted_by_require_2fa_middleware(bypass_on):
    """Anonymous POST should hit the view, not redirect to /2fa/verify."""
    client = Client(enforce_csrf_checks=False)
    response = client.post("/api/test/_reset/")
    assert response.status_code == 200
    assert response.url is None if hasattr(response, "url") else True  # no redirect


def test_csrf_exempt(bypass_on):
    """POST without CSRF token succeeds under bypass."""
    client = Client(enforce_csrf_checks=True)
    response = client.post("/api/test/_reset/")
    assert response.status_code == 200
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `backend/.venv/bin/python -m pytest backend/core/tests/api/test_reset_test.py -v`
Expected: FAIL — 404s from the URL not existing (or the monkeypatch target not importable).

- [ ] **Step 3: Write the view**

Create `backend/core/api_test_reset.py`:

```python
"""Bypass-gated test-support endpoint.

Only reachable when ``is_2fa_bypass_active()`` is True (which requires
``settings.DEBUG=True``). Flushes the database and re-seeds the e2e user so
Playwright runs start from a known baseline.

All authentication is disabled on this view via ``authentication_classes=[]``
so the endpoint can be hit without a CSRF token or a session.
"""

from __future__ import annotations

from django.core.management import call_command
from django.http import Http404
from django.urls import path
from rest_framework.decorators import (
    api_view,
    authentication_classes,
    permission_classes,
)
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response

from core.auth_bypass import is_2fa_bypass_active


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def reset_view(request: Request) -> Response:
    if not is_2fa_bypass_active():
        raise Http404
    call_command("flush", "--noinput", verbosity=0)
    call_command("seed_e2e_user", verbosity=0)
    return Response({"status": "reset"})


api_test_patterns = [
    path("_reset/", reset_view, name="api_test_reset"),
]
```

- [ ] **Step 4: Extend middleware allowlist**

Modify `backend/core/middleware/require_2fa.py`. Add `/api/test/` alongside the existing allowlist:

```python
        if (
            path.startswith("/healthz")
            or path.startswith("/static/")
            or path.startswith("/admin/")
            or path.startswith("/accounts/")
            or path.startswith("/2fa/")
            or path.startswith("/api/auth/")
            or path.startswith("/api/test/")
        ):
            return self.get_response(request)
```

- [ ] **Step 5: Wire the URL**

Modify `backend/config/urls.py`. Add import and pattern:

```python
from core.api_test_reset import api_test_patterns
```

In `urlpatterns`, after the `/api/auth/` include, add:

```python
    path("api/test/", include(api_test_patterns)),
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `backend/.venv/bin/python -m pytest backend/core/tests/api/test_reset_test.py -v`
Expected: 4 passed.

- [ ] **Step 7: Run the full backend test suite**

Run: `make -C backend test-unit` (or `backend/.venv/bin/python -m pytest -q`).
Expected: all previously passing tests still pass; 4 new tests pass.

- [ ] **Step 8: Commit**

```bash
git add backend/core/api_test_reset.py \
        backend/core/middleware/require_2fa.py \
        backend/config/urls.py \
        backend/core/tests/api/test_reset_test.py
git commit -m "feat(backend): add bypass-gated POST /api/test/_reset/ endpoint"
```

---

## Task 3: Frontend — `testIds.ts` + wire `data-testid` attributes

**Files:**
- Create: `frontend/src/testIds.ts`
- Modify: `frontend/src/screens/Login.tsx`
- Modify: `frontend/src/screens/Landing.tsx`
- Modify: `frontend/src/screens/Login.test.tsx`
- Modify: `frontend/src/screens/Landing.test.tsx`

- [ ] **Step 1: Create the constants module**

Create `frontend/src/testIds.ts`:

```ts
// Shared data-testid values. Duplicated verbatim in e2e/support/selectors.ts
// (kept in sync by hand; the e2e package is a standalone npm workspace).
export const TestIds = {
  LOGIN_USERNAME: "login-username",
  LOGIN_PASSWORD: "login-password",
  LOGIN_SUBMIT: "login-submit",
  SIGNED_IN_HEADER: "signed-in-header",
  SIGN_OUT_BUTTON: "sign-out-button",
  LANDING_CTA_PRIMARY: "landing-cta-primary",
} as const;

export type TestId = typeof TestIds[keyof typeof TestIds];
```

- [ ] **Step 2: Update failing unit tests to reference the constants**

In `frontend/src/screens/Login.test.tsx`, add at the top:

```ts
import { TestIds } from "../testIds";
```

Replace the username/password/submit queries with `data-testid` lookups:

```ts
const username = screen.getByTestId(TestIds.LOGIN_USERNAME);
const password = screen.getByTestId(TestIds.LOGIN_PASSWORD);
const submit = screen.getByTestId(TestIds.LOGIN_SUBMIT);
```

In `frontend/src/screens/Landing.test.tsx`, add the same import and replace:
- the "signed in as" text assertion with `screen.getByTestId(TestIds.SIGNED_IN_HEADER)`
- the "sign out" button lookup with `screen.getByTestId(TestIds.SIGN_OUT_BUTTON)`
- the "Get started" CTA check with `screen.getByTestId(TestIds.LANDING_CTA_PRIMARY)`

Keep the existing role/text assertions as secondary checks only where they catch drift not covered by the testid.

- [ ] **Step 3: Run tests to verify they fail**

Run: `(cd frontend && npm test -- --run src/screens/Login.test.tsx src/screens/Landing.test.tsx)`
Expected: FAIL — `Unable to find an element by: [data-testid="login-username"]` etc.

- [ ] **Step 4: Add `data-testid` to Login form inputs + submit**

In `frontend/src/screens/Login.tsx`:
- Add `import { TestIds } from "../testIds";` at the top.
- On the username input, add `data-testid={TestIds.LOGIN_USERNAME}`.
- On the password input, add `data-testid={TestIds.LOGIN_PASSWORD}`.
- On the submit button, add `data-testid={TestIds.LOGIN_SUBMIT}`.

- [ ] **Step 5: Add `data-testid` to Landing signed-in surface + CTA**

In `frontend/src/screens/Landing.tsx`:
- Add `import { TestIds } from "../testIds";` at the top.
- On the `<span className="text-sm text-ink-secondary">` that renders "Signed in as…", add `data-testid={TestIds.SIGNED_IN_HEADER}`.
- On the Sign out button, add `data-testid={TestIds.SIGN_OUT_BUTTON}`.
- On the "Get started" anchor (`/login?signup=1`), add `data-testid={TestIds.LANDING_CTA_PRIMARY}`.

- [ ] **Step 6: Run tests to verify they pass**

Run: `(cd frontend && npm test -- --run src/screens/Login.test.tsx src/screens/Landing.test.tsx)`
Expected: PASS.

- [ ] **Step 7: Run the full frontend suite**

Run: `make -C frontend test`.
Expected: all passing.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/testIds.ts \
        frontend/src/screens/Login.tsx \
        frontend/src/screens/Landing.tsx \
        frontend/src/screens/Login.test.tsx \
        frontend/src/screens/Landing.test.tsx
git commit -m "feat(frontend): add shared testIds + wire data-testid on auth surfaces"
```

---

## Task 4: E2e — `playwright.config.ts` with hybrid webServer

**Files:**
- Modify: `e2e/playwright.config.ts`

- [ ] **Step 1: Replace the config**

Full replacement for `e2e/playwright.config.ts`:

```ts
import { defineConfig } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173";

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: BASE_URL,
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "make -C .. dev",
    url: BASE_URL,
    timeout: 120_000,
    reuseExistingServer: true,
    env: {
      SLOTFLOW_BYPASS_2FA: "1",
    },
    stdout: "pipe",
    stderr: "pipe",
  },
});
```

- [ ] **Step 2: Verify the static smoke test still passes**

The existing `e2e/tests/smoke.spec.ts` uses `page.goto("file://...")` and does not touch `baseURL`, so it should still work. Start a local stack in one shell:

```bash
SLOTFLOW_BYPASS_2FA=1 make dev
```

In a second shell:

```bash
make test-e2e
```

Expected: `1 passed` for the smoke test (Playwright's `reuseExistingServer: true` detects the running Vite dev server and does not re-spawn honcho).

- [ ] **Step 3: Commit**

```bash
git add e2e/playwright.config.ts
git commit -m "chore(e2e): teach Playwright to spawn or reuse make dev with bypass flag"
```

---

## Task 5: E2e — support helpers + first real auth test

**Files:**
- Create: `e2e/support/api.ts`
- Create: `e2e/support/selectors.ts`
- Create: `e2e/tests/auth.spec.ts`

- [ ] **Step 1: Create `e2e/support/selectors.ts`**

```ts
// Mirrors frontend/src/testIds.ts. Kept in sync by hand; see the comment there.
export const TestIds = {
  LOGIN_USERNAME: "login-username",
  LOGIN_PASSWORD: "login-password",
  LOGIN_SUBMIT: "login-submit",
  SIGNED_IN_HEADER: "signed-in-header",
  SIGN_OUT_BUTTON: "sign-out-button",
  LANDING_CTA_PRIMARY: "landing-cta-primary",
} as const;
```

- [ ] **Step 2: Create `e2e/support/api.ts`**

```ts
import type { APIRequestContext } from "@playwright/test";

/**
 * Reset the backend DB and reseed the e2e user.
 *
 * Hits POST /api/test/_reset/, which is only live when the Django server is
 * running under SLOTFLOW_BYPASS_2FA=1 (DEBUG-gated). Throws on non-2xx so a
 * misconfigured target fails the test fast instead of through a 30s timeout.
 */
export async function resetDb(request: APIRequestContext): Promise<void> {
  const response = await request.post("/api/test/_reset/");
  if (!response.ok()) {
    throw new Error(
      `resetDb failed: ${response.status()} ${response.statusText()}. ` +
        `Is SLOTFLOW_BYPASS_2FA=1 set on the backend?`,
    );
  }
}

/**
 * Credentials for the seeded e2e user. The Django seed command reads
 * SLOTFLOW_E2E_PASSWORD from the environment; default is "e2e-local-only".
 */
export const E2E_USER = {
  username: "e2e",
  password: process.env.SLOTFLOW_E2E_PASSWORD ?? "e2e-local-only",
} as const;
```

- [ ] **Step 3: Write the failing auth test**

Create `e2e/tests/auth.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

import { E2E_USER, resetDb } from "../support/api";
import { TestIds } from "../support/selectors";

test.describe("auth flow", () => {
  test.beforeEach(async ({ request }) => {
    await resetDb(request);
  });

  test("authenticated non-admin user can sign in, see home, and sign out", async ({
    page,
    request,
  }) => {
    await page.goto("/login");

    await page.getByTestId(TestIds.LOGIN_USERNAME).fill(E2E_USER.username);
    await page.getByTestId(TestIds.LOGIN_PASSWORD).fill(E2E_USER.password);

    const loginResponse = page.waitForResponse(
      (resp) => resp.url().includes("/api/auth/login/") && resp.request().method() === "POST",
    );
    await page.getByTestId(TestIds.LOGIN_SUBMIT).click();
    const finishedLogin = await loginResponse;
    expect(finishedLogin.status()).toBe(200);

    // Fail fast if the target server is not running under bypass.
    const me = await request.get("/api/auth/me/");
    expect(me.ok()).toBeTruthy();
    const body = await me.json();
    expect(
      body.is_verified,
      "bypass flag not active on target server; set SLOTFLOW_BYPASS_2FA=1",
    ).toBe(true);

    await expect(page).toHaveURL("/");
    await expect(page.getByTestId(TestIds.SIGNED_IN_HEADER)).toBeVisible();

    await page.getByTestId(TestIds.SIGN_OUT_BUTTON).click();

    await expect(page.getByTestId(TestIds.LANDING_CTA_PRIMARY)).toBeVisible();
  });
});
```

- [ ] **Step 4: Run the test end-to-end against a local stack**

Start the stack in shell 1:

```bash
SLOTFLOW_BYPASS_2FA=1 make dev
```

In shell 2:

```bash
make test-e2e
```

Expected: both `smoke.spec.ts` and `auth.spec.ts` pass (`2 passed`).

- [ ] **Step 5: Verify the bypass-missing guard**

Stop `make dev`, restart **without** the flag:

```bash
make dev
```

Run `make test-e2e` again. Expected: `auth.spec.ts` fails with the named error "bypass flag not active on target server; set SLOTFLOW_BYPASS_2FA=1" (and `resetDb` returns 404 before that on the `beforeEach`). Either failure proves the guard works.

Re-stop `make dev` and restart with `SLOTFLOW_BYPASS_2FA=1 make dev` before continuing so later verification runs have a healthy baseline.

- [ ] **Step 6: Commit**

```bash
git add e2e/support/api.ts e2e/support/selectors.ts e2e/tests/auth.spec.ts
git commit -m "test(e2e): add auth flow Playwright test with per-test DB reset"
```

---

## Task 6: CI — add Postgres + Python + bypass env to the `e2e` job

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Replace the existing `e2e:` job**

Open `.github/workflows/ci.yml`. Locate the block that starts with `  e2e:` and runs through the `Upload Playwright report` step. Replace the entire block with:

```yaml
  e2e:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: slotflow
          POSTGRES_PASSWORD: slotflow
          POSTGRES_DB: slotflow
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U slotflow -d slotflow"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    env:
      POSTGRES_HOST: localhost
      POSTGRES_PORT: "5432"
      POSTGRES_DB: slotflow
      POSTGRES_USER: slotflow
      POSTGRES_PASSWORD: slotflow
      DJANGO_SETTINGS_MODULE: config.settings.local
      SLOTFLOW_BYPASS_2FA: "1"
      DJANGO_DEBUG: "1"
    steps:
      - uses: actions/checkout@v6

      - uses: actions/setup-python@v6
        with:
          python-version: "3.14"

      - uses: actions/setup-node@v6
        with:
          node-version-file: ".nvmrc"
          cache: npm
          cache-dependency-path: e2e/package-lock.json

      - name: Install Python tooling
        run: |
          python -m pip install --upgrade pip
          python -m venv backend/.venv
          backend/.venv/bin/pip install -r backend/requirements-dev.txt

      - name: Install frontend dependencies
        working-directory: frontend
        run: npm ci

      - name: Install e2e dependencies
        working-directory: e2e
        run: npm ci

      - name: Install Playwright Chromium
        working-directory: e2e
        run: npx playwright install --with-deps chromium

      - name: Apply migrations
        working-directory: backend
        run: .venv/bin/python manage.py migrate --noinput

      - name: Run Playwright tests
        run: make test-e2e

      - name: Upload Playwright report
        if: failure()
        uses: actions/upload-artifact@v7
        with:
          name: playwright-report
          path: e2e/playwright-report
```

Rationale: the e2e job previously only installed Node + Playwright and relied on a static `file://` fixture. The new auth test boots the real Django+Vite stack via `make dev` (spawned by Playwright's `webServer`), so CI must also install Python, the backend venv, the frontend npm deps, and run migrations against Postgres before Playwright starts. `DJANGO_DEBUG=1` (if read by `config/settings/local.py`; otherwise `DEBUG=True` is already the default for that settings module) plus `SLOTFLOW_BYPASS_2FA=1` unlock `is_2fa_bypass_active()`.

- [ ] **Step 2: Verify `DEBUG` handling**

Confirm `config/settings/local.py` sets `DEBUG = True` unconditionally (it should, per `backend/CLAUDE.md`). If it reads `DJANGO_DEBUG`, keep the env var; if it does not, remove `DJANGO_DEBUG: "1"` from the `env:` block to avoid a misleading no-op. Quick check:

```bash
grep -n "DEBUG" backend/config/settings/local.py
```

Expected: a line like `DEBUG = True`. Adjust the YAML accordingly (remove the `DJANGO_DEBUG` key if unused).

- [ ] **Step 3: Lint the workflow file**

Run `yamllint` or at minimum `actionlint` if installed locally. If neither is available, skip — GitHub Actions will surface syntax errors on push.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: run e2e against real stack with Postgres + SLOTFLOW_BYPASS_2FA"
```

---

## Task 7: Docs — `.env.example` + `CLAUDE.md`

**Files:**
- Modify: `.env.example`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update `.env.example`**

Find the existing `SLOTFLOW_BYPASS_2FA` entry. Immediately below it, add:

```
# Password for the seeded e2e user (make seed_e2e_user). Default if unset:
# "e2e-local-only". Only consulted when SLOTFLOW_BYPASS_2FA=1 is also active
# (DEBUG-gated). Staging/prod ignore this entirely.
SLOTFLOW_E2E_PASSWORD=e2e-local-only
```

Also append a note to the bypass block clarifying that the flag unlocks both middleware bypass **and** `POST /api/test/_reset/` (bypass-gated view used only by Playwright).

- [ ] **Step 2: Update `CLAUDE.md`**

Find the "2FA is mandatory" section. At the end of the paragraph that already documents `SLOTFLOW_BYPASS_2FA`, append:

```markdown
When the bypass flag is active the backend also exposes `POST /api/test/_reset/`,
which flushes the DB and re-runs `seed_e2e_user`. Playwright hits it in
`beforeEach` to start each spec from a known baseline. The endpoint returns 404
when bypass is inactive (i.e., in staging/production regardless of env flag).
```

- [ ] **Step 3: Commit**

```bash
git add .env.example CLAUDE.md
git commit -m "docs: document SLOTFLOW_E2E_PASSWORD + /api/test/_reset/ guardrails"
```

---

## Final verification (before opening the PR)

- [ ] **Full local CI pass**

```bash
make lint
make test-unit
SLOTFLOW_BYPASS_2FA=1 make dev     # shell 1
make test-e2e                       # shell 2
```

Expected: all pass. Stop `make dev` afterwards.

- [ ] **Halt before `git push` / `gh pr create`**

Per the PR #12 pattern: stop here, hand back for a manual smoke by the user, then open the PR.

When clear to open the PR, use `.github/WORKFLOW_TEMPLATES/pull_request.md` as the body template and invoke:

```bash
gh pr create --title "feat(e2e): Playwright auth harness over SLOTFLOW_BYPASS_2FA" \
             --body-file <filled-in-template>.md
```
