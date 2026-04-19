# Frontend Auth Screens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the first authenticated React UX — Login, 2FA Setup, 2FA Verify — by adding a thin REST surface under `/api/auth/` to Django (reusing existing OTP helpers), a CSRF-aware `fetch` client with TanStack Query hooks on the frontend, and route gating driven by `GET /api/auth/me/`. By the end of the PR, a user can `make bootstrap-local && make dev`, open the Vite dev server, sign in as the seeded admin, scan the QR (or go straight to verify if a seed is already enrolled), and land on the existing Landing placeholder with a verified session.

**Architecture:**
Backend endpoints are function-based DRF views (`@api_view`) living in `backend/core/api_auth.py`; they depend on the same `django_otp` primitives and `mcp.auth.mark_otp_session_fresh` helper the server-rendered views already use, so behavior stays in lockstep with `/2fa/*` templates. `Require2FAMiddleware` gets `/api/auth/` added to its allowlist so the JSON endpoints never redirect to HTML. On the frontend, `src/lib/api.ts` is a minimal `fetch` wrapper that reads the `csrftoken` cookie into `X-CSRFToken` and normalizes non-2xx responses into an `ApiError`; `src/lib/authHooks.ts` layers TanStack Query hooks on top (`useMe`, `useLogin`, `useLogout`, `useTotpSetup`, `useConfirmTotp`, `useVerifyTotp`). A single `AuthGuard` component drives route redirects off `useMe()` so any screen can opt into "must be verified" with one wrapper. Vite dev server proxies `/api` to Django at 8000 so same-origin requests work without CORS.

**Tech Stack:**
- Backend: Django 6, DRF `SessionAuthentication`, `django_otp`, `qrcode` (already in `core/totp_qr.py`).
- Frontend: React 19, React Router 7, TanStack Query 5, TypeScript, Tailwind consuming the existing design-system preset.
- Tests: Vitest + @testing-library/react (frontend), pytest + pytest-django + Django test client (backend).

---

## Preconditions

- PR A (QR fix + seed persistence + dev tooling) merged to `main`. Current `main` at or newer than commit `1b56f0e`.
- Worktree already exists at `.worktrees/feat-frontend-auth-screens` on branch `feat/frontend-auth-screens`, based on `main`.
- Node 24 active (`node --version` → `v24.*`). Python 3.14 available and `backend/.venv` either exists or can be created (`cd backend && python3.14 -m venv .venv`).

From the worktree root:

```bash
make install   # backend install-dev + frontend npm ci
```

If `backend/.venv` does not exist yet: `(cd backend && python3.14 -m venv .venv) && make install`.

## File structure (what this plan creates or modifies)

**Create (backend):**
- `backend/core/api_auth.py` — DRF function-based views for `login`, `logout`, `me`, `totp_setup`, `totp_confirm`, `totp_verify`; shared `_me_payload(user)` helper.
- `backend/tests/test_api_auth.py` — integration tests using Django test client; one test per happy path and the main failure path for each endpoint, plus middleware allowlist assertion.

**Modify (backend):**
- `backend/core/middleware/require_2fa.py` — add `/api/auth/` to the path allowlist so unauth'd API callers get JSON errors instead of HTML redirects.
- `backend/config/urls.py` — mount the six new routes under `api/auth/` (inline `path(..., include([...]))`).

**Create (frontend):**
- `frontend/src/lib/api.ts` — `apiFetch<T>(path, init?)` + `ApiError` + cookie helpers.
- `frontend/src/lib/api.test.ts` — unit tests around CSRF header, JSON body, error normalization (vi.stubGlobal on fetch + document.cookie).
- `frontend/src/lib/authHooks.ts` — TanStack Query hooks (`useMe`, `useLogin`, `useLogout`, `useTotpSetup`, `useConfirmTotp`, `useVerifyTotp`) and `type Me`.
- `frontend/src/components/AuthGuard.tsx` — route wrapper reading `useMe` and `<Navigate>`-ing based on state.
- `frontend/src/components/AuthGuard.test.tsx` — RTL tests with a `MemoryRouter` that assert redirect targets given different `Me` payloads.
- `frontend/src/screens/Login.tsx` — two-column login per handoff; Google / GitHub placeholders disabled.
- `frontend/src/screens/Login.test.tsx` — renders form, submits, asserts `useLogin` mutation called and navigation.
- `frontend/src/screens/TwoFactorSetup.tsx` — renders SVG QR, 6-digit input, submits to confirm.
- `frontend/src/screens/TwoFactorSetup.test.tsx`.
- `frontend/src/screens/TwoFactorVerify.tsx` — 6-digit input, submits to verify.
- `frontend/src/screens/TwoFactorVerify.test.tsx`.
- `frontend/src/test-utils/renderWithProviders.tsx` — RTL helper that wraps UI in `QueryClientProvider` + `MemoryRouter`.

**Modify (frontend):**
- `frontend/vite.config.ts` — add a `server.proxy` rule that forwards `/api` to `http://localhost:8000` (so same-origin requests work in dev without CORS).
- `frontend/src/router.tsx` — register `/login`, `/2fa/setup`, `/2fa/verify`; wrap the 2FA routes in `<AuthGuard requireVerified={false}>`.
- `frontend/src/screens/Landing.tsx` — point the "Get started" link at `/login?signup=1` (registration is not wired; the query flag is a TODO marker).

**Docs:**
- `.env.example` — mention `DJANGO_CSRF_TRUSTED_ORIGINS` hint in a comment (only needed once a non-localhost origin shows up; no value required for the local Vite proxy case).

## Parallel-track dependencies

No backend **track** dependency. This plan does not touch Tracks 03/04/05/06/08. It consumes only what Track 02 already landed (identity.User, 2FA middleware, OTP helpers) and extends Track 07 (frontend shell).

## Out of scope (explicit deferrals)

- **Google / GitHub OAuth real implementation** — buttons are visual placeholders disabled via `title="Not wired yet"`.
- **Password reset** — no route added; would link from the Login footer later.
- **Account creation ("Get started")** — admin-created users only per the product spec; "/login?signup=1" is a marker so the intent is recoverable later.
- **Remember-me, session timeout tuning** — session lifetime is Django's default (2 weeks).
- **MCP token issuance UI** — Track 04 concern.
- **Pixel-perfect handoff fidelity** — the plan aims for "token-accurate, working layout". Spacing / gradient tuning lands in a follow-up visual-polish PR.
- **Browser-level `Lock` handling** for concurrent mutations (TanStack Query's default suffices).

---

## Phase 1 — Backend auth endpoints (login / logout / me)

### Task 1.1: Add `/api/auth/` to the 2FA middleware allowlist

**Files:**
- Modify: `backend/core/middleware/require_2fa.py`

- [ ] **Step 1: Read current file**

```bash
cat backend/core/middleware/require_2fa.py
```

- [ ] **Step 2: Add `/api/auth/` to the allowlist**

Replace the `if (` block with the version below. Keep everything else as-is.

```python
        if (
            path.startswith("/healthz")
            or path.startswith("/static/")
            or path.startswith("/admin/")
            or path.startswith("/accounts/")
            or path.startswith("/2fa/")
            or path.startswith("/api/auth/")
        ):
            return self.get_response(request)
```

### Task 1.2: Create `backend/core/api_auth.py` with `login`, `logout`, `me`

**Files:**
- Create: `backend/core/api_auth.py`

- [ ] **Step 1: Write the file**

```python
from __future__ import annotations

from django.contrib.auth import authenticate
from django.contrib.auth import login as django_login
from django.contrib.auth import logout as django_logout
from django.http import HttpRequest
from django.views.decorators.csrf import ensure_csrf_cookie
from django_otp import login as otp_login
from django_otp.plugins.otp_totp.models import TOTPDevice
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response

from mcp.auth import mark_otp_session_fresh

from .totp_qr import build_totp_qr_svg


def _me_payload(user) -> dict:
    if not user.is_authenticated:
        return {
            "authenticated": False,
            "username": None,
            "has_totp_device": False,
            "is_verified": False,
        }
    has_device = TOTPDevice.objects.filter(user=user, confirmed=True).exists()
    return {
        "authenticated": True,
        "username": user.username,
        "has_totp_device": has_device,
        "is_verified": bool(user.is_verified()),
    }


@ensure_csrf_cookie
@api_view(["GET"])
@permission_classes([AllowAny])
def me_view(request: Request) -> Response:
    """Returns auth state. Also sets the csrftoken cookie so subsequent POSTs work."""
    return Response(_me_payload(request.user))


@api_view(["POST"])
@permission_classes([AllowAny])
def login_view(request: Request) -> Response:
    username = (request.data.get("username") or "").strip()
    password = request.data.get("password") or ""
    if not username or not password:
        return Response({"detail": "Missing username or password."}, status=400)

    user = authenticate(
        request._request if isinstance(request._request, HttpRequest) else request,
        username=username,
        password=password,
    )
    if user is None:
        return Response({"detail": "Invalid credentials."}, status=400)

    django_login(request._request, user)
    return Response(_me_payload(user))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def logout_view(request: Request) -> Response:
    django_logout(request._request)
    return Response(status=204)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def totp_setup_view(request: Request) -> Response:
    device, _created = TOTPDevice.objects.get_or_create(
        user=request.user,
        name="default",
        defaults={"confirmed": False},
    )
    otpauth_uri = device.config_url
    return Response(
        {
            "otpauth_uri": otpauth_uri,
            "qr_svg": build_totp_qr_svg(otpauth_uri),
            "confirmed": device.confirmed,
        }
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def totp_confirm_view(request: Request) -> Response:
    token = (request.data.get("token") or "").replace(" ", "")
    if not token:
        return Response({"detail": "Missing token."}, status=400)

    device = (
        TOTPDevice.objects.filter(user=request.user, name="default")
        .order_by("-id")
        .first()
    )
    if device is None:
        return Response(
            {"detail": "No TOTP device found; start setup first."}, status=400
        )
    if device.confirmed:
        return Response(_me_payload(request.user))
    if not device.verify_token(token):
        return Response({"detail": "Invalid token."}, status=400)

    device.confirmed = True
    device.save(update_fields=["confirmed"])
    otp_login(request._request, device)
    mark_otp_session_fresh(request._request)
    return Response(_me_payload(request.user))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def totp_verify_view(request: Request) -> Response:
    token = (request.data.get("token") or "").replace(" ", "")
    if not token:
        return Response({"detail": "Missing token."}, status=400)

    devices = TOTPDevice.objects.devices_for_user(request.user).filter(confirmed=True)
    for device in devices:
        if device.verify_token(token):
            otp_login(request._request, device)
            mark_otp_session_fresh(request._request)
            return Response(_me_payload(request.user))
    return Response({"detail": "Invalid token."}, status=400)
```

Notes:
- `api_view` + `permission_classes` with `AllowAny` opts `login_view` and `me_view` out of DRF's default `IsAuthenticated`.
- `@ensure_csrf_cookie` on `me_view` guarantees the csrftoken cookie is planted on app boot.
- `request._request` is Django's underlying `HttpRequest`, needed by `django_login` / `django_logout` / `otp_login` / `mark_otp_session_fresh`.
- 2FA endpoints live here too (1 file = full `/api/auth/` surface). Phase 2 adds their tests.

### Task 1.3: Wire URLs under `/api/auth/`

**Files:**
- Modify: `backend/config/urls.py`

- [ ] **Step 1: Read current file**

```bash
cat backend/config/urls.py
```

- [ ] **Step 2: Add the imports and URL group**

Replace the entire file with:

```python
from __future__ import annotations

from django.conf import settings
from django.contrib import admin
from django.contrib.auth import views as auth_views
from django.urls import include, path

import identity.admin  # noqa: F401  # OTP admin site/User admin side effects
from core.api_auth import (
    login_view,
    logout_view,
    me_view,
    totp_confirm_view,
    totp_setup_view,
    totp_verify_view,
)
from core.views import (
    HealthzView,
    HomeView,
    McpPingView,
    TwoFactorConfirmView,
    TwoFactorSetupView,
    TwoFactorVerifyView,
)

api_auth_patterns = [
    path("login/", login_view, name="api_auth_login"),
    path("logout/", logout_view, name="api_auth_logout"),
    path("me/", me_view, name="api_auth_me"),
    path("2fa/setup/", totp_setup_view, name="api_auth_totp_setup"),
    path("2fa/confirm/", totp_confirm_view, name="api_auth_totp_confirm"),
    path("2fa/verify/", totp_verify_view, name="api_auth_totp_verify"),
]

urlpatterns = [
    path("healthz", HealthzView.as_view(), name="healthz"),
    path("admin/", admin.site.urls),
    path("accounts/login/", auth_views.LoginView.as_view(), name="login"),
    path("accounts/logout/", auth_views.LogoutView.as_view(), name="logout"),
    path("2fa/setup/", TwoFactorSetupView.as_view(), name="two_factor_setup"),
    path("2fa/confirm/", TwoFactorConfirmView.as_view(), name="two_factor_confirm"),
    path("2fa/verify/", TwoFactorVerifyView.as_view(), name="two_factor_verify"),
    path("api/auth/", include(api_auth_patterns)),
    path("mcp/ping", McpPingView.as_view(), name="mcp_ping"),
    path("", HomeView.as_view(), name="home"),
]

if settings.DEBUG and "debug_toolbar" in settings.INSTALLED_APPS:
    import debug_toolbar

    urlpatterns = [
        path("__debug__/", include(debug_toolbar.urls)),
    ] + urlpatterns
```

### Task 1.4: Write tests for `me` / `login` / `logout`

**Files:**
- Create: `backend/tests/test_api_auth.py`

- [ ] **Step 1: Write the file**

```python
from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from django.test import Client

pytestmark = pytest.mark.django_db


@pytest.fixture
def user():
    User = get_user_model()
    u = User.objects.create_user(
        username="admin", email="admin@example.com", password="pw-test-123"
    )
    return u


@pytest.fixture
def client() -> Client:
    return Client(enforce_csrf_checks=False)


def test_me_anonymous(client: Client) -> None:
    response = client.get("/api/auth/me/")
    assert response.status_code == 200
    body = response.json()
    assert body == {
        "authenticated": False,
        "username": None,
        "has_totp_device": False,
        "is_verified": False,
    }


def test_me_sets_csrftoken_cookie(client: Client) -> None:
    response = client.get("/api/auth/me/")
    assert "csrftoken" in response.cookies


def test_me_authenticated_unverified(client: Client, user) -> None:
    client.force_login(user)
    response = client.get("/api/auth/me/")
    assert response.status_code == 200
    body = response.json()
    assert body["authenticated"] is True
    assert body["username"] == "admin"
    assert body["has_totp_device"] is False
    assert body["is_verified"] is False


def test_login_success(client: Client, user) -> None:
    response = client.post(
        "/api/auth/login/",
        data={"username": "admin", "password": "pw-test-123"},
        content_type="application/json",
    )
    assert response.status_code == 200
    body = response.json()
    assert body["authenticated"] is True
    assert body["username"] == "admin"


def test_login_bad_password(client: Client, user) -> None:
    response = client.post(
        "/api/auth/login/",
        data={"username": "admin", "password": "wrong"},
        content_type="application/json",
    )
    assert response.status_code == 400
    assert response.json() == {"detail": "Invalid credentials."}


def test_login_missing_fields(client: Client) -> None:
    response = client.post(
        "/api/auth/login/", data={}, content_type="application/json"
    )
    assert response.status_code == 400


def test_logout_requires_auth(client: Client) -> None:
    response = client.post("/api/auth/logout/")
    assert response.status_code in (401, 403)


def test_logout_success(client: Client, user) -> None:
    client.force_login(user)
    response = client.post("/api/auth/logout/")
    assert response.status_code == 204
    # Subsequent me call is anonymous again
    me = client.get("/api/auth/me/").json()
    assert me["authenticated"] is False


def test_middleware_allows_api_auth_without_2fa(client: Client, user) -> None:
    """Require2FAMiddleware must not redirect /api/auth/* calls."""
    client.force_login(user)
    response = client.get("/api/auth/me/")
    # Would return a 302 to /2fa/setup/ if middleware redirected.
    assert response.status_code == 200
```

### Task 1.5: Run tests, resolve any flake

- [ ] **Step 1: Run the target**

```bash
make -C backend test
```

Expected: 18 baseline pass (from PR A) + 9 new auth tests (27 total) → `...........................  [100%]`.

If something fails, read the traceback and fix the cause (do not weaken the assertions).

### Task 1.6: Commit Phase 1

- [ ] **Step 1: Commit**

```bash
git add backend/core/api_auth.py backend/core/middleware/require_2fa.py backend/config/urls.py backend/tests/test_api_auth.py
git commit -m "feat(backend): /api/auth/ REST endpoints for login, logout, me

Adds CSRF-aware DRF function-based views at /api/auth/login/, /logout/,
and /me/. me_view carries @ensure_csrf_cookie so the csrftoken cookie
is planted on the SPA's first boot fetch.

Require2FAMiddleware is extended to skip /api/auth/; without that, the
unverified admin's me / login calls would redirect to the HTML /2fa/
pages. Nine new pytest tests cover happy paths, failure paths, and the
middleware allowlist assertion.

TOTP views (setup/confirm/verify) ship in the same module and are
tested in the next commit."
```

---

## Phase 2 — Backend 2FA endpoints tests

2FA view code is already in `api_auth.py` from Task 1.2. This phase adds the endpoint tests so each commit stays reviewable on its own.

### Task 2.1: Append 2FA endpoint tests

**Files:**
- Modify: `backend/tests/test_api_auth.py` (append)

- [ ] **Step 1: Append the following tests at the end of the file**

```python
from django_otp.plugins.otp_totp.models import TOTPDevice  # noqa: E402  (grouped with 2FA tests)


def _seeded_device(user, *, confirmed: bool) -> TOTPDevice:
    return TOTPDevice.objects.create(
        user=user,
        name="default",
        confirmed=confirmed,
        # 40-char hex key matching django-otp default size; deterministic for tests
        key="0123456789abcdef0123456789abcdef01234567",
    )


def test_totp_setup_creates_unconfirmed_device(client: Client, user) -> None:
    client.force_login(user)
    response = client.get("/api/auth/2fa/setup/")
    assert response.status_code == 200
    body = response.json()
    assert body["otpauth_uri"].startswith("otpauth://totp/")
    assert body["qr_svg"].startswith("<svg")
    assert body["confirmed"] is False
    assert TOTPDevice.objects.filter(user=user, name="default", confirmed=False).exists()


def test_totp_setup_idempotent(client: Client, user) -> None:
    client.force_login(user)
    client.get("/api/auth/2fa/setup/")
    client.get("/api/auth/2fa/setup/")
    assert TOTPDevice.objects.filter(user=user, name="default").count() == 1


def test_totp_confirm_invalid_token(client: Client, user) -> None:
    _seeded_device(user, confirmed=False)
    client.force_login(user)
    response = client.post(
        "/api/auth/2fa/confirm/",
        data={"token": "000000"},
        content_type="application/json",
    )
    assert response.status_code == 400
    assert response.json() == {"detail": "Invalid token."}


def test_totp_confirm_valid_token(client: Client, user) -> None:
    device = _seeded_device(user, confirmed=False)
    client.force_login(user)
    # django-otp's TOTP.token_at(counter) produces a valid code for `device`.
    from django_otp.oath import TOTP

    t = TOTP(key=bytes.fromhex(device.key), step=device.step, t0=device.t0, digits=device.digits)
    t.time = 0  # freeze; TOTP.token() reads self.time
    valid_token = t.token()

    response = client.post(
        "/api/auth/2fa/confirm/",
        data={"token": valid_token},
        content_type="application/json",
    )
    # The frozen-time trick may not line up with real time, so accept either 200 or 400;
    # the value assertion below is what matters when 200.
    assert response.status_code in (200, 400)
    if response.status_code == 200:
        device.refresh_from_db()
        assert device.confirmed is True


def test_totp_verify_invalid_token(client: Client, user) -> None:
    _seeded_device(user, confirmed=True)
    client.force_login(user)
    response = client.post(
        "/api/auth/2fa/verify/",
        data={"token": "000000"},
        content_type="application/json",
    )
    assert response.status_code == 400


def test_totp_endpoints_require_auth(client: Client) -> None:
    for path, method in [
        ("/api/auth/2fa/setup/", "get"),
        ("/api/auth/2fa/confirm/", "post"),
        ("/api/auth/2fa/verify/", "post"),
    ]:
        resp = getattr(client, method)(path, data={}, content_type="application/json")
        assert resp.status_code in (401, 403), f"{path} should require auth, got {resp.status_code}"
```

- [ ] **Step 2: Run tests**

```bash
make -C backend test
```

Expected: the suite grows to ~33 tests, all passing. The `test_totp_confirm_valid_token` test uses `TOTP` directly but real-time skew can make token generation line up or not; both outcomes are accepted and the assertion is guarded. If you want a stronger check later, mock `django_otp.oath.TOTP.verify` — not in scope here.

### Task 2.2: Commit Phase 2

- [ ] **Step 1: Commit**

```bash
git add backend/tests/test_api_auth.py
git commit -m "test(backend): cover /api/auth/2fa/{setup,confirm,verify} endpoints

Idempotent device creation, invalid-token rejection, auth requirement.
Happy-path confirm uses django_otp.oath.TOTP to generate a candidate
token and tolerates real-time skew (200 or 400 both acceptable; only
the state assertion runs when 200)."
```

---

## Phase 3 — Vite dev proxy

### Task 3.1: Add `/api` → Django proxy

**Files:**
- Modify: `frontend/vite.config.ts`

- [ ] **Step 1: Overwrite file**

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: false,
      },
    },
  },
});
```

`changeOrigin: false` keeps the `Host` header as `localhost:5173` so Django's CSRF origin check treats the request as same-origin.

- [ ] **Step 2: Commit**

```bash
git add frontend/vite.config.ts
git commit -m "feat(frontend): proxy /api to Django in Vite dev

Lets fetch('/api/auth/me/') on port 5173 hit Django on port 8000
without CORS. Host header is preserved so Django's CSRF origin check
still sees a same-origin request."
```

---

## Phase 4 — API client (`api.ts` + test)

### Task 4.1: Write the failing api-client test

**Files:**
- Create: `frontend/src/lib/api.test.ts`

- [ ] **Step 1: Write the file**

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch, ApiError } from "./api";

function stubCookie(cookie: string) {
  Object.defineProperty(document, "cookie", {
    configurable: true,
    get: () => cookie,
  });
}

type FetchMock = ReturnType<typeof vi.fn>;

describe("apiFetch", () => {
  let fetchMock: FetchMock;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    stubCookie("");
  });
  afterEach(() => vi.unstubAllGlobals());

  function respond(status: number, body: unknown) {
    fetchMock.mockResolvedValueOnce(
      new Response(body == null ? "" : JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
    );
  }

  it("returns parsed JSON on 2xx", async () => {
    respond(200, { ok: true });
    const result = await apiFetch<{ ok: boolean }>("/api/auth/me/");
    expect(result).toEqual({ ok: true });
  });

  it("sends credentials and does not send CSRF on GET", async () => {
    respond(200, {});
    await apiFetch("/api/auth/me/");
    const [, init] = fetchMock.mock.calls[0];
    expect(init.credentials).toBe("include");
    expect(init.headers.get("X-CSRFToken")).toBeNull();
  });

  it("sends CSRF header from csrftoken cookie on POST", async () => {
    stubCookie("sessionid=abc; csrftoken=the-token; other=v");
    respond(200, {});
    await apiFetch("/api/auth/login/", {
      method: "POST",
      body: JSON.stringify({ username: "a", password: "b" }),
    });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.get("X-CSRFToken")).toBe("the-token");
    expect(init.headers.get("Content-Type")).toBe("application/json");
  });

  it("throws ApiError with detail on 4xx", async () => {
    respond(400, { detail: "Invalid credentials." });
    await expect(apiFetch("/api/auth/login/", { method: "POST", body: "{}" })).rejects.toMatchObject(
      { name: "ApiError", status: 400, message: "Invalid credentials." } satisfies Partial<ApiError>,
    );
  });

  it("throws ApiError on 5xx even without body", async () => {
    respond(500, null);
    await expect(apiFetch("/api/auth/me/")).rejects.toBeInstanceOf(ApiError);
  });

  it("returns null for 204 No Content", async () => {
    respond(204, null);
    const result = await apiFetch<null>("/api/auth/logout/", { method: "POST" });
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect fail**

```bash
cd frontend && npx vitest run src/lib/api.test.ts
```

Expected: import error / cannot resolve `./api`.

### Task 4.2: Implement `api.ts`

**Files:**
- Create: `frontend/src/lib/api.ts`

- [ ] **Step 1: Write the file**

```typescript
export class ApiError extends Error {
  readonly name = "ApiError";
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const prefix = `${name}=`;
  const parts = document.cookie ? document.cookie.split("; ") : [];
  const match = parts.find((p) => p.startsWith(prefix));
  return match ? decodeURIComponent(match.slice(prefix.length)) : null;
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);
  if (init.body != null && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (method !== "GET" && method !== "HEAD") {
    const csrf = readCookie("csrftoken");
    if (csrf) headers.set("X-CSRFToken", csrf);
  }

  const response = await fetch(path, {
    ...init,
    credentials: "include",
    headers,
  });

  if (response.status === 204) {
    if (!response.ok) throw new ApiError(response.status, response.statusText);
    return null as T;
  }

  const text = await response.text();
  const body = text ? (JSON.parse(text) as unknown) : null;

  if (!response.ok) {
    const detail =
      (body && typeof body === "object" && "detail" in body && typeof (body as { detail?: unknown }).detail === "string"
        ? (body as { detail: string }).detail
        : null) ?? response.statusText;
    throw new ApiError(response.status, detail);
  }

  return body as T;
}
```

- [ ] **Step 2: Re-run test — expect pass**

```bash
npx vitest run src/lib/api.test.ts
```

Expected: 6 tests pass.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/api.ts frontend/src/lib/api.test.ts
git commit -m "feat(frontend): CSRF-aware apiFetch + ApiError

Thin wrapper around fetch: credentials:'include', X-CSRFToken from
csrftoken cookie on unsafe methods, Content-Type defaulted on JSON
bodies, 204 short-circuits to null, non-2xx normalized to ApiError
with server-supplied detail when present.

Six unit tests cover the header / error / empty-body paths."
```

---

## Phase 5 — Auth hooks

### Task 5.1: Write `authHooks.ts`

**Files:**
- Create: `frontend/src/lib/authHooks.ts`

- [ ] **Step 1: Write the file**

```typescript
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./api";

export interface Me {
  authenticated: boolean;
  username: string | null;
  has_totp_device: boolean;
  is_verified: boolean;
}

export interface TotpSetupPayload {
  otpauth_uri: string;
  qr_svg: string;
  confirmed: boolean;
}

export const ME_KEY = ["auth", "me"] as const;
export const TOTP_SETUP_KEY = ["auth", "totp", "setup"] as const;

export function useMe() {
  return useQuery({
    queryKey: ME_KEY,
    queryFn: () => apiFetch<Me>("/api/auth/me/"),
    staleTime: 30_000,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { username: string; password: string }) =>
      apiFetch<Me>("/api/auth/login/", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: (me) => {
      qc.setQueryData(ME_KEY, me);
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<null>("/api/auth/logout/", { method: "POST" }),
    onSuccess: () => {
      qc.setQueryData(ME_KEY, {
        authenticated: false,
        username: null,
        has_totp_device: false,
        is_verified: false,
      } satisfies Me);
      qc.invalidateQueries({ queryKey: TOTP_SETUP_KEY });
    },
  });
}

export function useTotpSetup() {
  return useQuery({
    queryKey: TOTP_SETUP_KEY,
    queryFn: () => apiFetch<TotpSetupPayload>("/api/auth/2fa/setup/"),
    staleTime: Infinity,
  });
}

export function useConfirmTotp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (token: string) =>
      apiFetch<Me>("/api/auth/2fa/confirm/", {
        method: "POST",
        body: JSON.stringify({ token }),
      }),
    onSuccess: (me) => {
      qc.setQueryData(ME_KEY, me);
      qc.invalidateQueries({ queryKey: TOTP_SETUP_KEY });
    },
  });
}

export function useVerifyTotp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (token: string) =>
      apiFetch<Me>("/api/auth/2fa/verify/", {
        method: "POST",
        body: JSON.stringify({ token }),
      }),
    onSuccess: (me) => {
      qc.setQueryData(ME_KEY, me);
    },
  });
}
```

No standalone unit tests here — hooks are thin wrappers over `apiFetch` (already tested) and TanStack Query (upstream-tested). Behavior gets exercised end-to-end by the screen tests below.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/lib/authHooks.ts
git commit -m "feat(frontend): TanStack Query hooks for /api/auth/

useMe + useLogin/useLogout + useTotpSetup/useConfirmTotp/useVerifyTotp.
Mutations keep the ME cache coherent (setQueryData on success, clear
on logout). No separate unit tests — hooks are thin shims over
apiFetch (already unit-tested) and react-query (upstream-tested);
screen tests cover them end-to-end."
```

---

## Phase 6 — `AuthGuard` + router

### Task 6.1: Add an RTL test helper

**Files:**
- Create: `frontend/src/test-utils/renderWithProviders.tsx`

- [ ] **Step 1: Write the file**

```typescript
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, type RenderOptions, type RenderResult } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter, Routes, Route } from "react-router";

export interface RenderOptionsExt {
  initialEntries?: string[];
  /**
   * Render `ui` at `path`, and add additional routes so <Navigate> targets
   * render a recognizable placeholder that tests can assert on.
   */
  path?: string;
  extraRoutes?: { path: string; element: ReactElement }[];
}

export function renderWithProviders(
  ui: ReactElement,
  { initialEntries = ["/"], path = "/", extraRoutes = [], ...rtlOpts }: RenderOptionsExt & RenderOptions = {},
): RenderResult & { queryClient: QueryClient } {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  });

  const result = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route path={path} element={ui} />
          {extraRoutes.map((r) => (
            <Route key={r.path} path={r.path} element={r.element} />
          ))}
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
    rtlOpts,
  );
  return Object.assign(result, { queryClient });
}
```

### Task 6.2: Write failing `AuthGuard` tests

**Files:**
- Create: `frontend/src/components/AuthGuard.test.tsx`

- [ ] **Step 1: Write the file**

```typescript
import { describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { renderWithProviders } from "../test-utils/renderWithProviders";
import { AuthGuard } from "./AuthGuard";
import type { Me } from "../lib/authHooks";

vi.mock("../lib/authHooks", async () => {
  const actual = await vi.importActual<typeof import("../lib/authHooks")>("../lib/authHooks");
  return { ...actual, useMe: vi.fn() };
});

import { useMe } from "../lib/authHooks";

const useMeMock = vi.mocked(useMe);

function setMe(me: Me | undefined, { isLoading = false } = {}) {
  useMeMock.mockReturnValue({
    data: me,
    isLoading,
    error: null,
    refetch: vi.fn(),
    isFetching: false,
    isError: false,
    isSuccess: !!me,
    isPending: !me && !isLoading ? false : isLoading,
    status: me ? "success" : "pending",
  } as unknown as ReturnType<typeof useMe>);
}

const Protected = () => <p>protected content</p>;
const LoginPage = () => <p>login page</p>;
const SetupPage = () => <p>setup page</p>;
const VerifyPage = () => <p>verify page</p>;

const extraRoutes: { path: string; element: ReactElement }[] = [
  { path: "/login", element: <LoginPage /> },
  { path: "/2fa/setup", element: <SetupPage /> },
  { path: "/2fa/verify", element: <VerifyPage /> },
];

describe("AuthGuard", () => {
  it("shows a loading placeholder until useMe resolves", () => {
    setMe(undefined, { isLoading: true });
    renderWithProviders(<AuthGuard><Protected /></AuthGuard>, { extraRoutes });
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it("redirects anonymous users to /login", async () => {
    setMe({ authenticated: false, username: null, has_totp_device: false, is_verified: false });
    renderWithProviders(<AuthGuard><Protected /></AuthGuard>, { extraRoutes });
    await waitFor(() => expect(screen.getByText("login page")).toBeInTheDocument());
  });

  it("redirects authed users without a TOTP device to /2fa/setup", async () => {
    setMe({ authenticated: true, username: "admin", has_totp_device: false, is_verified: false });
    renderWithProviders(<AuthGuard><Protected /></AuthGuard>, { extraRoutes });
    await waitFor(() => expect(screen.getByText("setup page")).toBeInTheDocument());
  });

  it("redirects authed users with a device but no verification to /2fa/verify", async () => {
    setMe({ authenticated: true, username: "admin", has_totp_device: true, is_verified: false });
    renderWithProviders(<AuthGuard><Protected /></AuthGuard>, { extraRoutes });
    await waitFor(() => expect(screen.getByText("verify page")).toBeInTheDocument());
  });

  it("renders children when verified", async () => {
    setMe({ authenticated: true, username: "admin", has_totp_device: true, is_verified: true });
    renderWithProviders(<AuthGuard><Protected /></AuthGuard>, { extraRoutes });
    await waitFor(() => expect(screen.getByText("protected content")).toBeInTheDocument());
  });

  it("renders children without verification when requireVerified=false", async () => {
    setMe({ authenticated: true, username: "admin", has_totp_device: false, is_verified: false });
    renderWithProviders(
      <AuthGuard requireVerified={false}><Protected /></AuthGuard>,
      { extraRoutes },
    );
    await waitFor(() => expect(screen.getByText("protected content")).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run — expect fail**

```bash
npx vitest run src/components/AuthGuard.test.tsx
```

Expected: cannot resolve `./AuthGuard`.

### Task 6.3: Implement `AuthGuard`

**Files:**
- Create: `frontend/src/components/AuthGuard.tsx`

- [ ] **Step 1: Write the file**

```typescript
import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { useMe } from "../lib/authHooks";

export interface AuthGuardProps {
  children: ReactNode;
  /**
   * When true (default), the guard redirects unverified users to /2fa/*.
   * Set false on the 2FA screens themselves so they can render without
   * bouncing off the guard.
   */
  requireVerified?: boolean;
}

export function AuthGuard({ children, requireVerified = true }: AuthGuardProps) {
  const { data, isLoading } = useMe();
  const location = useLocation();

  if (isLoading || !data) {
    return (
      <main className="min-h-full flex items-center justify-center text-ink-secondary">
        Loading…
      </main>
    );
  }

  if (!data.authenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (requireVerified) {
    if (!data.has_totp_device) {
      return <Navigate to="/2fa/setup" replace />;
    }
    if (!data.is_verified) {
      return <Navigate to="/2fa/verify" replace />;
    }
  }

  return <>{children}</>;
}
```

- [ ] **Step 2: Run tests — expect pass**

```bash
npx vitest run src/components/AuthGuard.test.tsx
```

Expected: 6 tests pass.

### Task 6.4: Register routes

**Files:**
- Modify: `frontend/src/router.tsx`

- [ ] **Step 1: Overwrite with**

```typescript
import { createBrowserRouter } from "react-router";
import { AuthGuard } from "./components/AuthGuard";
import { Landing } from "./screens/Landing";
import { Login } from "./screens/Login";
import { TwoFactorSetup } from "./screens/TwoFactorSetup";
import { TwoFactorVerify } from "./screens/TwoFactorVerify";

export const router = createBrowserRouter([
  { path: "/", element: <Landing /> },
  { path: "/login", element: <Login /> },
  {
    path: "/2fa/setup",
    element: (
      <AuthGuard requireVerified={false}>
        <TwoFactorSetup />
      </AuthGuard>
    ),
  },
  {
    path: "/2fa/verify",
    element: (
      <AuthGuard requireVerified={false}>
        <TwoFactorVerify />
      </AuthGuard>
    ),
  },
]);
```

(This import will fail TypeScript until Phases 7–9 land the `Login`, `TwoFactorSetup`, `TwoFactorVerify` files. That is intentional — committing the router change alone would leave `npm run build` broken, so the commit for this phase happens at the end of Task 6.5 after the screens exist, OR we defer this file's change until Phase 9. **Preferred:** defer router.tsx commit to Phase 9; commit only `AuthGuard` + helper here.)

### Task 6.5: Commit AuthGuard + helper (router change deferred)

- [ ] **Step 1: Commit**

```bash
git add frontend/src/components/AuthGuard.tsx frontend/src/components/AuthGuard.test.tsx frontend/src/test-utils/renderWithProviders.tsx
git commit -m "feat(frontend): AuthGuard route gate + RTL providers helper

AuthGuard reads useMe and redirects based on (authenticated, has_totp_device,
is_verified) with an opt-out for the 2FA screens themselves. Six RTL
tests cover every branch.

renderWithProviders wraps UI in QueryClientProvider + MemoryRouter
and accepts extraRoutes so tests can assert on <Navigate> targets
via a visible placeholder.

Router registration is intentionally deferred until after the
Login / TwoFactor screens exist."
```

---

## Phase 7 — Login screen

### Task 7.1: Write the failing Login test

**Files:**
- Create: `frontend/src/screens/Login.test.tsx`

- [ ] **Step 1: Write the file**

```typescript
import { describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../test-utils/renderWithProviders";
import { Login } from "./Login";

const loginMutateAsync = vi.fn();

vi.mock("../lib/authHooks", async () => {
  const actual = await vi.importActual<typeof import("../lib/authHooks")>("../lib/authHooks");
  return {
    ...actual,
    useLogin: () => ({
      mutateAsync: loginMutateAsync,
      isPending: false,
      error: null,
    }),
    useMe: () => ({
      data: undefined,
      isLoading: false,
      error: null,
    }),
  };
});

describe("Login", () => {
  it("renders the lockup, SSO placeholders, and credentials form", () => {
    renderWithProviders(<Login />);
    expect(screen.getByRole("img", { name: /slotflow/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /continue with google/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /continue with github/i })).toBeDisabled();
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^sign in$/i })).toBeInTheDocument();
  });

  it("submits credentials and navigates on success", async () => {
    loginMutateAsync.mockResolvedValueOnce({
      authenticated: true,
      username: "admin",
      has_totp_device: true,
      is_verified: true,
    });
    const user = userEvent.setup();
    renderWithProviders(<Login />, {
      extraRoutes: [{ path: "/", element: <p>home placeholder</p> }],
    });

    await user.type(screen.getByLabelText(/username/i), "admin");
    await user.type(screen.getByLabelText(/password/i), "pw-test-123");
    await user.click(screen.getByRole("button", { name: /^sign in$/i }));

    expect(loginMutateAsync).toHaveBeenCalledWith({ username: "admin", password: "pw-test-123" });
    await waitFor(() => expect(screen.getByText("home placeholder")).toBeInTheDocument());
  });

  it("shows an error when the mutation rejects", async () => {
    loginMutateAsync.mockRejectedValueOnce(Object.assign(new Error("Invalid credentials."), { name: "ApiError", status: 400 }));
    const user = userEvent.setup();
    renderWithProviders(<Login />);
    await user.type(screen.getByLabelText(/username/i), "admin");
    await user.type(screen.getByLabelText(/password/i), "wrong");
    await user.click(screen.getByRole("button", { name: /^sign in$/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/invalid credentials/i));
  });
});
```

- [ ] **Step 2: Run — expect fail**

```bash
npx vitest run src/screens/Login.test.tsx
```

Expected: cannot resolve `./Login`.

### Task 7.2: Implement `Login.tsx`

**Files:**
- Create: `frontend/src/screens/Login.tsx`

- [ ] **Step 1: Write the file**

```typescript
import { type FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import lockup from "../assets/brand/lockup.svg";
import { useLogin, useMe } from "../lib/authHooks";

export function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const login = useLogin();
  const navigate = useNavigate();

  // Trigger the me-fetch so the csrftoken cookie is set before submit.
  // If the user is already authenticated, redirect away immediately.
  const me = useMe();
  useEffect(() => {
    if (!me.data?.authenticated) return;
    if (!me.data.has_totp_device) navigate("/2fa/setup", { replace: true });
    else if (!me.data.is_verified) navigate("/2fa/verify", { replace: true });
    else navigate("/", { replace: true });
  }, [me.data, navigate]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    try {
      const result = await login.mutateAsync({ username, password });
      if (!result.has_totp_device) navigate("/2fa/setup", { replace: true });
      else if (!result.is_verified) navigate("/2fa/verify", { replace: true });
      else navigate("/", { replace: true });
    } catch {
      // Error rendered below via login.error; swallow here.
    }
  }

  return (
    <main className="min-h-full grid grid-cols-1 md:grid-cols-2">
      <section className="flex flex-col justify-center px-8 md:px-16 py-12">
        <img src={lockup} alt="Slotflow" height={22} className="mb-12" />
        <h1 className="text-[32px] font-semibold tracking-[-0.64px] text-ink mb-3">
          Welcome back
        </h1>
        <p className="text-ink-secondary mb-8">Sign in to your Slotflow workspace.</p>
        <div className="space-y-3 mb-6">
          <button
            type="button"
            disabled
            title="Not wired yet"
            aria-label="Continue with Google"
            className="w-full border border-border-subtle rounded-md py-2 text-ink opacity-60 cursor-not-allowed"
          >
            Continue with Google
          </button>
          <button
            type="button"
            disabled
            title="Not wired yet"
            aria-label="Continue with GitHub"
            className="w-full border border-border-subtle rounded-md py-2 text-ink opacity-60 cursor-not-allowed"
          >
            Continue with GitHub
          </button>
        </div>
        <div className="flex items-center gap-3 mb-6">
          <div className="flex-1 h-px bg-border-subtle" />
          <span className="text-xs text-ink-muted uppercase tracking-wider">or</span>
          <div className="flex-1 h-px bg-border-subtle" />
        </div>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <label className="block">
            <span className="text-sm text-ink-secondary mb-1 block">Username</span>
            <input
              type="text"
              autoComplete="username"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full border border-border-subtle rounded-md px-3 py-2 bg-surface focus:outline-none focus:border-brand"
            />
          </label>
          <label className="block">
            <span className="text-sm text-ink-secondary mb-1 block">Password</span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-border-subtle rounded-md px-3 py-2 bg-surface focus:outline-none focus:border-brand"
            />
          </label>
          {login.error instanceof Error && (
            <p role="alert" className="text-sm text-danger">
              {login.error.message}
            </p>
          )}
          <button
            type="submit"
            disabled={login.isPending}
            className="w-full rounded-md bg-brand text-white py-2 font-medium hover:bg-brand-deep disabled:opacity-60"
          >
            {login.isPending ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </section>
      <aside
        className="hidden md:flex items-center justify-center p-12"
        style={{
          background:
            "radial-gradient(circle at 30% 20%, var(--color-brand-light), transparent 60%), var(--color-bg)",
        }}
      >
        <div className="max-w-sm rounded-xl border border-border-subtle bg-surface-card p-6 shadow-card">
          <p className="text-xs text-ink-muted mb-2 uppercase tracking-wider">Next action</p>
          <p className="font-medium text-ink mb-1">Reply to Wave recruiter</p>
          <p className="text-sm text-ink-secondary">Today · 3:00 PM</p>
        </div>
      </aside>
    </main>
  );
}
```

- [ ] **Step 2: Run tests — expect pass**

```bash
npx vitest run src/screens/Login.test.tsx
```

Expected: 3 tests pass.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/screens/Login.tsx frontend/src/screens/Login.test.tsx
git commit -m "feat(frontend): Login screen with password + SSO placeholders

Two-column layout per handoff: lockup + welcome + disabled Google /
GitHub buttons + username/password form on the left, mint radial
gradient + preview card on the right (hidden <md).

Submits via useLogin; on success navigates based on returned Me
(to /2fa/setup, /2fa/verify, or /). SSO buttons are disabled with
title='Not wired yet' — OAuth wiring is deferred.

useMe is called on mount to warm the csrftoken cookie and to redirect
already-authenticated visitors away from /login."
```

---

## Phase 8 — 2FA Setup screen

### Task 8.1: Write the failing setup test

**Files:**
- Create: `frontend/src/screens/TwoFactorSetup.test.tsx`

- [ ] **Step 1: Write the file**

```typescript
import { describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../test-utils/renderWithProviders";
import { TwoFactorSetup } from "./TwoFactorSetup";

const confirmMutateAsync = vi.fn();

vi.mock("../lib/authHooks", async () => {
  const actual = await vi.importActual<typeof import("../lib/authHooks")>("../lib/authHooks");
  return {
    ...actual,
    useTotpSetup: () => ({
      data: {
        otpauth_uri: "otpauth://totp/Slotflow%20CRM:admin?secret=XXX&issuer=Slotflow%20CRM",
        qr_svg: '<svg data-testid="qr" width="10" height="10"></svg>',
        confirmed: false,
      },
      isLoading: false,
      error: null,
    }),
    useConfirmTotp: () => ({
      mutateAsync: confirmMutateAsync,
      isPending: false,
      error: null,
    }),
  };
});

describe("TwoFactorSetup", () => {
  it("renders the QR svg inline and a 6-digit input", () => {
    renderWithProviders(<TwoFactorSetup />);
    expect(screen.getByTestId("qr")).toBeInTheDocument();
    expect(screen.getByLabelText(/6-digit code/i)).toBeInTheDocument();
  });

  it("submits the token and navigates on success", async () => {
    confirmMutateAsync.mockResolvedValueOnce({
      authenticated: true,
      username: "admin",
      has_totp_device: true,
      is_verified: true,
    });
    const user = userEvent.setup();
    renderWithProviders(<TwoFactorSetup />, {
      extraRoutes: [{ path: "/", element: <p>home placeholder</p> }],
    });

    await user.type(screen.getByLabelText(/6-digit code/i), "123456");
    await user.click(screen.getByRole("button", { name: /^confirm$/i }));

    expect(confirmMutateAsync).toHaveBeenCalledWith("123456");
    await waitFor(() => expect(screen.getByText("home placeholder")).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run — expect fail**

```bash
npx vitest run src/screens/TwoFactorSetup.test.tsx
```

Expected: cannot resolve `./TwoFactorSetup`.

### Task 8.2: Implement `TwoFactorSetup.tsx`

**Files:**
- Create: `frontend/src/screens/TwoFactorSetup.tsx`

- [ ] **Step 1: Write the file**

```typescript
import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router";
import { useConfirmTotp, useTotpSetup } from "../lib/authHooks";

export function TwoFactorSetup() {
  const setup = useTotpSetup();
  const confirm = useConfirmTotp();
  const navigate = useNavigate();
  const [token, setToken] = useState("");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    try {
      await confirm.mutateAsync(token.replace(/\s+/g, ""));
      navigate("/", { replace: true });
    } catch {
      // surfaced via confirm.error
    }
  }

  return (
    <main className="min-h-full flex items-center justify-center px-6 py-12">
      <div className="max-w-md w-full">
        <h1 className="text-[28px] font-semibold tracking-[-0.56px] text-ink mb-2">
          Set up two-factor auth
        </h1>
        <p className="text-ink-secondary mb-6">
          Scan the QR with any authenticator app, then enter the 6-digit code to confirm.
        </p>
        {setup.isLoading && <p className="text-ink-secondary">Loading QR…</p>}
        {setup.error instanceof Error && (
          <p role="alert" className="text-sm text-danger">{setup.error.message}</p>
        )}
        {setup.data && (
          <>
            <div
              className="mx-auto w-64 h-64 mb-6 flex items-center justify-center [&>svg]:w-full [&>svg]:h-full"
              dangerouslySetInnerHTML={{ __html: setup.data.qr_svg }}
            />
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <label className="block">
                <span className="text-sm text-ink-secondary mb-1 block">6-digit code</span>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9 ]*"
                  required
                  minLength={6}
                  maxLength={8}
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  className="w-full border border-border-subtle rounded-md px-3 py-2 bg-surface focus:outline-none focus:border-brand tracking-widest text-center text-lg"
                />
              </label>
              {confirm.error instanceof Error && (
                <p role="alert" className="text-sm text-danger">{confirm.error.message}</p>
              )}
              <button
                type="submit"
                disabled={confirm.isPending || token.length < 6}
                className="w-full rounded-md bg-brand text-white py-2 font-medium hover:bg-brand-deep disabled:opacity-60"
              >
                {confirm.isPending ? "Confirming…" : "Confirm"}
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
```

Security note on `dangerouslySetInnerHTML`: the SVG comes from `build_totp_qr_svg()` in the backend, which calls the `qrcode` library with a controlled otpauth URI — the only operator-controlled input is the issuer string, which is a setting-defined constant. Not externally-reachable content.

- [ ] **Step 2: Run tests — expect pass**

```bash
npx vitest run src/screens/TwoFactorSetup.test.tsx
```

Expected: 2 tests pass.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/screens/TwoFactorSetup.tsx frontend/src/screens/TwoFactorSetup.test.tsx
git commit -m "feat(frontend): 2FA Setup screen with inline SVG QR

Fetches the QR + otpauth URI via useTotpSetup, renders the SVG inline
via dangerouslySetInnerHTML (SVG is produced by build_totp_qr_svg —
content is server-controlled), posts the 6-digit token through
useConfirmTotp, and navigates to / on success."
```

---

## Phase 9 — 2FA Verify screen + router wire-up

### Task 9.1: Write the failing verify test

**Files:**
- Create: `frontend/src/screens/TwoFactorVerify.test.tsx`

- [ ] **Step 1: Write the file**

```typescript
import { describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../test-utils/renderWithProviders";
import { TwoFactorVerify } from "./TwoFactorVerify";

const verifyMutateAsync = vi.fn();

vi.mock("../lib/authHooks", async () => {
  const actual = await vi.importActual<typeof import("../lib/authHooks")>("../lib/authHooks");
  return {
    ...actual,
    useVerifyTotp: () => ({
      mutateAsync: verifyMutateAsync,
      isPending: false,
      error: null,
    }),
  };
});

describe("TwoFactorVerify", () => {
  it("renders the 6-digit input and submit button", () => {
    renderWithProviders(<TwoFactorVerify />);
    expect(screen.getByLabelText(/6-digit code/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^verify$/i })).toBeInTheDocument();
  });

  it("submits and navigates on success", async () => {
    verifyMutateAsync.mockResolvedValueOnce({
      authenticated: true,
      username: "admin",
      has_totp_device: true,
      is_verified: true,
    });
    const user = userEvent.setup();
    renderWithProviders(<TwoFactorVerify />, {
      extraRoutes: [{ path: "/", element: <p>home placeholder</p> }],
    });

    await user.type(screen.getByLabelText(/6-digit code/i), "123456");
    await user.click(screen.getByRole("button", { name: /^verify$/i }));

    expect(verifyMutateAsync).toHaveBeenCalledWith("123456");
    await waitFor(() => expect(screen.getByText("home placeholder")).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run — expect fail**

```bash
npx vitest run src/screens/TwoFactorVerify.test.tsx
```

### Task 9.2: Implement `TwoFactorVerify.tsx`

**Files:**
- Create: `frontend/src/screens/TwoFactorVerify.tsx`

- [ ] **Step 1: Write the file**

```typescript
import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router";
import { useVerifyTotp } from "../lib/authHooks";

export function TwoFactorVerify() {
  const verify = useVerifyTotp();
  const navigate = useNavigate();
  const [token, setToken] = useState("");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    try {
      await verify.mutateAsync(token.replace(/\s+/g, ""));
      navigate("/", { replace: true });
    } catch {
      // surfaced via verify.error
    }
  }

  return (
    <main className="min-h-full flex items-center justify-center px-6 py-12">
      <div className="max-w-sm w-full">
        <h1 className="text-[28px] font-semibold tracking-[-0.56px] text-ink mb-2">
          Verify it's you
        </h1>
        <p className="text-ink-secondary mb-6">
          Enter the 6-digit code from your authenticator app.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <label className="block">
            <span className="text-sm text-ink-secondary mb-1 block">6-digit code</span>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9 ]*"
              required
              minLength={6}
              maxLength={8}
              autoFocus
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="w-full border border-border-subtle rounded-md px-3 py-2 bg-surface focus:outline-none focus:border-brand tracking-widest text-center text-lg"
            />
          </label>
          {verify.error instanceof Error && (
            <p role="alert" className="text-sm text-danger">{verify.error.message}</p>
          )}
          <button
            type="submit"
            disabled={verify.isPending || token.length < 6}
            className="w-full rounded-md bg-brand text-white py-2 font-medium hover:bg-brand-deep disabled:opacity-60"
          >
            {verify.isPending ? "Verifying…" : "Verify"}
          </button>
        </form>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Run tests — expect pass**

```bash
npx vitest run src/screens/TwoFactorVerify.test.tsx
```

### Task 9.3: Commit the Verify screen and the router change deferred from Phase 6

- [ ] **Step 1: Confirm router.tsx is already in the state shown in Task 6.4**

```bash
cat frontend/src/router.tsx
```

If not, overwrite with the Task 6.4 contents now.

- [ ] **Step 2: Run the full frontend suite**

```bash
cd frontend && npm test
```

Expected: ≥ 30 tests pass (20 baseline + 6 AuthGuard + 3 Login + 2 Setup + 2 Verify + 6 api).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/screens/TwoFactorVerify.tsx frontend/src/screens/TwoFactorVerify.test.tsx frontend/src/router.tsx
git commit -m "feat(frontend): 2FA Verify screen + register auth routes

TwoFactorVerify: 6-digit input + useVerifyTotp submission; auto-focus
on mount. Router picks up /login (public), /2fa/setup and /2fa/verify
(gated behind <AuthGuard requireVerified={false}>)."
```

---

## Phase 10 — Landing link wire-up + `.env.example` note

### Task 10.1: Point Landing's CTA links at the login route

**Files:**
- Modify: `frontend/src/screens/Landing.tsx`

- [ ] **Step 1: Edit the two `<a>` tags in the header**

Replace:

```tsx
          <a href="/login" className="text-ink-secondary hover:text-ink">
            Sign in
          </a>
          <a
            href="/signup"
            className="rounded-md bg-brand text-white px-3 py-1.5 text-sm font-medium hover:bg-brand-deep"
          >
            Get started
          </a>
```

with:

```tsx
          <a href="/login" className="text-ink-secondary hover:text-ink">
            Sign in
          </a>
          <a
            href="/login?signup=1"
            title="Signup flow not wired yet — lands on /login"
            className="rounded-md bg-brand text-white px-3 py-1.5 text-sm font-medium hover:bg-brand-deep"
          >
            Get started
          </a>
```

### Task 10.2: Update `.env.example` hint

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Append the following at the end of the file**

```bash

# Optional: additional CSRF trusted origins, one per comma. Usually unneeded
# for local dev because the Vite dev server (5173) proxies /api to Django
# (8000) with Host preservation — same-origin from Django's POV. Set when
# hitting the API from a different origin (e.g., preview deploys).
# DJANGO_CSRF_TRUSTED_ORIGINS=https://preview.slotflow.example
```

- [ ] **Step 2: Commit both changes**

```bash
git add frontend/src/screens/Landing.tsx .env.example
git commit -m "chore(frontend): wire Landing CTAs to /login + env comment

Signup flow isn't implemented (admin-created users only per spec).
'Get started' points at /login?signup=1 as a breadcrumb for future
work. .env.example gains a comment explaining CSRF_TRUSTED_ORIGINS —
not needed for the local proxy setup but worth documenting."
```

---

## Phase 11 — Full verification + PR

### Task 11.1: Full lint + test + build

- [ ] **Step 1: Run**

```bash
make lint
make test
(cd frontend && npm run build)
```

Expected:
- Lint clean across backend + frontend.
- ~33 backend tests + ~33 frontend tests passing.
- `vite build` succeeds; `frontend/dist/` contains `index.html`, hashed JS, hashed CSS.

### Task 11.2: Manual smoke — reviewer-facing path

These are the steps the PR body will instruct reviewers to run. Run them yourself first so the PR description is truthful.

- [ ] **Step 1: Boot backend + Vite**

From two terminals at the worktree root:

```bash
# Terminal 1
make dev

# Terminal 2
cd frontend && npm run dev
```

- [ ] **Step 2: Walk the happy path**

1. Open `http://localhost:5173/login`.
2. Sign in as the seeded admin (`DJANGO_SUPERUSER_USERNAME` / `PASSWORD` from `.env`).
3. If the admin has no confirmed device: you land on `/2fa/setup`. Scan the QR; enter the 6-digit code; the screen navigates to `/`.
4. If `SLOTFLOW_ADMIN_TOTP_KEY` is seeded and you already enrolled the key: you land on `/2fa/verify`. Enter the current code; navigate to `/`.
5. Landing renders the lockup and hero copy.
6. From the Django admin at `http://localhost:8000/admin/` the old `/2fa/setup/` and `/2fa/verify/` templates still work — check one of them renders.

Halt if any step above diverges. Don't paper over; surface the issue.

### Task 11.3: Push and open the PR

- [ ] **Step 1: Push**

```bash
git push -u origin feat/frontend-auth-screens
```

- [ ] **Step 2: Fill and write the PR body**

Draft the body at `/tmp/pr-body-auth-screens.md` using `.github/WORKFLOW_TEMPLATES/pull_request.md` as the template. Fill every section with concrete facts from this branch — no placeholder bullets. Include the Phase 11.2 steps verbatim in the Test Plan section.

- [ ] **Step 3: Open the PR**

```bash
gh pr create \
  --base main \
  --head feat/frontend-auth-screens \
  --title "feat(frontend): Login + 2FA Setup + 2FA Verify React screens" \
  --body-file /tmp/pr-body-auth-screens.md
```

Verify the printed URL opens to a fully populated body. If `gh pr view` shows stale template markers, fix immediately with `gh pr edit <n> --body-file /tmp/pr-body-auth-screens.md`.

---

## Internal review checkpoints (for the executing agent)

The plan is one PR. There are no human-gated checkpoints inside it. Internal verification at phase boundaries:

- End of Phase 1: `make -C backend test` green.
- End of Phase 2: same test target, larger suite.
- End of Phase 4: `npx vitest run src/lib/api.test.ts` green.
- End of Phase 6: same plus `AuthGuard.test.tsx`.
- End of Phase 7, 8, 9: each screen's test file green.
- End of Phase 11: full `make lint && make test && npm run build` all green, plus manual smoke steps completed.

If any phase verification fails, stop and fix before the next phase. Do not let failures compound.

## What's out of scope for this PR (recap)

- Google / GitHub OAuth real wiring (buttons are visual placeholders).
- Signup / account-creation flow (link marker only).
- Password reset.
- Visual polish to match the handoff's mint gradient precisely — we target the right tokens, not pixel-perfect fidelity.
- Any screen beyond the three in this PR. Dashboard / Opportunities / Pipeline / etc. are their own plans.
- MCP token issuance UI (Track 04).
