# Hardening — Track 12 (BE)

**Date:** 2026-04-26
**Status:** Approved

## Goal

Tighten the backend before opening up the app to outside users. Three concrete changes:

1. Rate-limit the auth endpoints so credential-stuffing and TOTP brute-force don't get a free pass.
2. Add a Content-Security-Policy and a strict Permissions-Policy so a stored-XSS in the frontend can't pivot to data exfiltration / camera access / etc.
3. Make the production settings actually production: HSTS, secure cookies, SSL redirect, Redis-backed throttle cache.

## Architecture

### Rate limits

Two new throttle classes in `core/throttling.py` driven by DRF's existing `SimpleRateThrottle` machinery:

- `LoginRateThrottle` (anon, scope `auth_login`) — caps **per source IP** on `/api/auth/login/`.
- `LoginUsernameRateThrottle` (scope `auth_login_username`) — caps **per attempted username**, regardless of source IP. This is the bucket that defends against a distributed attack on a single account from N proxies.
- `TwoFactorRateThrottle` (scope `auth_2fa`) — caps **per authenticated user** (with IP fallback) on `/api/auth/2fa/{setup,confirm,verify}/`.

Default rates (overridable via env):

- `auth_login`: 10/min
- `auth_login_username`: 10/min
- `auth_2fa`: 30/min

Rationale: 30/min on the 2FA endpoints is generous enough that a legitimate user fat-fingering the TOTP code stays clear of the cap, but caps an attacker brute-forcing the 6-digit space at ≪1% expected hit rate per day.

The throttle counters live in the DRF default cache. Production swaps `default` to a Redis-backed `RedisCache` so all web workers share one bucket — without that, in-process `LocMemCache` would split the bucket per process and turn a `10/min` policy into `10/min × num_workers`.

### Security headers

New `core/middleware/security_headers.py::SecurityHeadersMiddleware` mounted right after Django's `SecurityMiddleware`. It adds three headers per response:

- **Content-Security-Policy** — production policy (no `unsafe-eval`, `unsafe-inline` only on `style-src` for Tailwind dynamic-class needs); a relaxed DEBUG variant for the Vite dev server's HMR (`'unsafe-eval'`, `ws:`/`wss:` connect-src).
- **Permissions-Policy** — explicit `()` denylist for every powerful feature (camera, microphone, geolocation, USB, payment, …). Listing each feature keeps the policy auditable and resists silent permission grants when the browser ships a new feature.
- **Referrer-Policy** — `strict-origin-when-cross-origin`. Defensively re-asserted; Django's `SecureMiddleware` already sets it via `SECURE_REFERRER_POLICY`, but we set it again so a settings drift can't quietly downgrade.

Each header is set with `setdefault` so a downstream view that needs a relaxed policy (admin debug panels, etc.) can still override.

### Production settings

`config/settings/production.py` now enforces:

- HSTS: `SECURE_HSTS_SECONDS=31536000` (1 year), `SECURE_HSTS_INCLUDE_SUBDOMAINS=False`, `SECURE_HSTS_PRELOAD=False`. Subdomain-include and preload stay off until every subdomain is verified HTTPS-ready; flip via env (`DJANGO_SECURE_HSTS_INCLUDE_SUBDOMAINS=1`, `DJANGO_SECURE_HSTS_PRELOAD=1`).
- `SECURE_PROXY_SSL_HEADER=("HTTP_X_FORWARDED_PROTO", "https")` — Render and most PaaS terminate TLS at the edge.
- `SECURE_SSL_REDIRECT=True` (env-overridable).
- `SESSION_COOKIE_SECURE=True`, `CSRF_COOKIE_SECURE=True`.
- `CACHES.default` swapped to Redis when `REDIS_URL` is set, so DRF throttles share one counter across web workers.

Base settings carry the always-true defaults (`SECURE_CONTENT_TYPE_NOSNIFF`, `SECURE_REFERRER_POLICY`, `X_FRAME_OPTIONS=DENY`, cookie HttpOnly + SameSite=Lax) so a misconfigured override module never silently downgrades.

## Test plan

- BE: gains 9 cases. Total ~499 → ~508.
  - `core/tests/api/login_throttle_test.py` — anon-IP cap, per-username cap (across IPs), distinct-username isolation, 2FA per-user cap.
  - `core/tests/middleware/security_headers_test.py` — every response carries CSP / Permissions-Policy / Referrer-Policy / X-Frame-Options.
  - `core/tests/middleware/csp_production_test.py` — production CSP omits `'unsafe-inline'` from `script-src` and never includes `'unsafe-eval'`.
  - `core/tests/services/production_settings_test.py` — production settings boot with the secure defaults; reject the dev placeholder secret.

## Risk & rollback

- All changes are additive at the response/middleware layer plus settings-only changes. Reverting is one revert; no migration.
- The HSTS year-long header is sticky on browsers — once a user visits `slotflow.example.com` over HTTPS, their browser will refuse plain HTTP for 12 months. Keep `INCLUDE_SUBDOMAINS` / `PRELOAD` off until subdomain coverage is verified.
- Redis cache swap depends on `REDIS_URL` being set; in absence the production settings fall back to the LocMem default, which silently downgrades the throttle to per-process. The deploy checklist needs to assert `REDIS_URL` is present.

## Out of scope

- Rate-limiting other endpoints (e.g., per-tenant quotas on opportunities). Auth-only for this slice.
- WAF / IP reputation / Cloudflare-tier defenses.
- Account lockout policy (we throttle, we don't lock; product call deferred).
- Email-on-suspicious-login. Audit log already records every login.
