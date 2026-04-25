---
applyTo: "e2e/**"
---

# E2E (Playwright)

Read `repo.instructions.md` first.

## Copilot review priorities

- Flag specs that share state across tests; each spec should reset with `POST /api/test/_reset/` in `beforeEach`.
- Flag manual login or TOTP generation; e2e should use the dev-only 2FA bypass.
- Flag hardcoded dev server URLs; use the Playwright config `baseURL`.
- New authenticated-flow tests should set `SLOTFLOW_BYPASS_2FA=1` with `DEBUG=True`.
- Prefer stable user-facing locators over brittle selectors when reviewing Playwright interactions.

## Toolchain

- **Package manager:** `npm` with `package-lock.json`. Install via `make install` at repo root (also installs Playwright Chromium).
- **Run all e2e:** `make test-e2e` (from repo root) or `make -C e2e test`.
- **Single spec:** `(cd e2e && npx playwright test tests/name.spec.ts)`.

## How auth works under e2e

- Set `SLOTFLOW_BYPASS_2FA=1` + `DEBUG=True` so `Require2FAMiddleware` skips redirects and `/api/auth/me/` reports `is_verified=true`. The `DEBUG` gate makes the flag inert in staging/production — by design.
- When the bypass is active the backend exposes `POST /api/test/_reset/`, which flushes the DB and re-runs `seed_e2e_user`. Hit it in `beforeEach` to start each spec from a known baseline. The endpoint returns 404 when bypass is inactive.
- Never compute TOTP in e2e — use the bypass.

## Common mistakes to avoid

- Adding manual login steps that compute OTP codes — use the bypass + `_reset` endpoint instead.
- Sharing state across specs. `beforeEach` should reset.
- Hardcoding the dev server URL. Use the Playwright config's `baseURL`.
