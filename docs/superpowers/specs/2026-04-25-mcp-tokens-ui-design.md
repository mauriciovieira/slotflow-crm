# MCP Tokens UI — Full Slice (FE + e2e)

**Date:** 2026-04-25
**Status:** Approved
**Scope:** First slice of Track 07. Surface the existing `/api/mcp/tokens/` endpoint in the dashboard. List the user's tokens, issue a new one (plaintext shown once), revoke per-row. Backend already exists — no BE changes.

## Goal

Let the user manage MCP tokens from the UI without dropping into the admin or curl. The plaintext token is the secret a CLI / agent will paste; we show it once at issue time and never again.

## Non-goals

- Per-token scope picker (the BE doesn't have scopes today).
- Token rotation / refresh flows.
- Token export to file.
- A standalone `/dashboard/mcp-tokens` route — keeps the surface as a section on `Settings` to avoid sprawling top-level nav.

## Architecture

### Backend

No changes. `/api/mcp/tokens/` already provides:
- `GET` — list current user's tokens (`{id, name, last_four, expires_at, created_at, updated_at, revoked_at, last_used_at}` shape per the existing serializer).
- `POST` — issue: returns `{...record, plaintext}` where `plaintext` is the secret shown once. Field name is `plaintext`, not `token`.
- `DELETE /<uuid>/` — revoke (sets `revoked_at`).

The endpoint is gated by `IsAuthenticated` + a fresh-OTP-session check (15-min window). The dev `SLOTFLOW_BYPASS_2FA` flag does **not** extend to the freshness gate — that is a deliberate security boundary. Backend tests monkey-patch `require_fresh_2fa_session` for fixtures; the e2e spec stubs the MCP endpoints via Playwright `page.route` rather than bending the gate.

### Frontend

**Hook (`lib/mcpTokensHooks.ts`):**

- `useMcpTokens()` — `GET /api/mcp/tokens/`.
- `useIssueMcpToken()` — `POST`. Returns the issued record including the `plaintext` secret.
- `useRevokeMcpToken(id)` — `DELETE /api/mcp/tokens/<id>/`.

Cache key: `["mcp-tokens", "list"]`.

**Section component (`components/McpTokensSection.tsx`):**

Mounted inside `Settings.tsx` after the FX rates section (Settings is the sensible home for token management; the spec rejects a standalone slug). The section provides:

- Token list table: `name / last_four / last_used / created`. Revoked rows render dimmed; the actions cell shows a "revoked" label in place of the revoke button instead of a separate `revoked_at` column.
- "Issue token" inline form: name field + submit. The form uses `noValidate` and surfaces empty-name errors via the section's own inline error path so the custom error renders consistently in jsdom and real browsers. On success the response payload's `plaintext` value is shown in a one-time-only "copy this now" panel with a copy-to-clipboard button. The plaintext is never stored in React Query cache; the panel state lives only on the section component.
- Per-row inline-confirm revoke. Mutation failure surfaces inline.

**Test ids:** mirror `e2e/support/selectors.ts`.

**Frontend tests (Vitest):**

- List loading / error / empty / populated.
- Issue form happy path — assert plaintext shown once, list invalidated.
- Revoke confirm flow.
- Revoked row hides the revoke button.

### E2E

`e2e/tests/mcp_tokens.spec.ts`:

1. Reset → login (via `loginAsE2EUser`).
2. Stub `**/api/mcp/tokens/` and `**/api/mcp/tokens/<id>/` via Playwright `page.route`. The MCP endpoints' fresh-OTP-session gate is **not** weakened by `SLOTFLOW_BYPASS_2FA`; stubbing keeps the e2e exercising the FE flow without bending that boundary. The BE shape stays covered by `backend/mcp/tests/api/mcp_token_test.py`.
3. Open Settings.
4. Click "Issue token", fill `My laptop`, submit.
5. Plaintext panel appears with the stubbed value; assert input value matches.
6. Dismiss the plaintext panel — assert it disappears.
7. List shows the single row with `last_four`.
8. Click Revoke → confirm.
9. Row remains in the list (revoked rows render dimmed); revoke button is gone.

## Test plan

- Backend: no new cases.
- Frontend vitest gains ~6 cases.
- E2E gains 1 spec.

## Risk & rollback

- No schema or BE changes.
- Frontend adds a section to an existing screen; reverting is one revert commit.
- Plaintext is rendered in plain DOM. Caller still has to copy / paste; we don't auto-copy or POST it anywhere else.

## Out of scope reminders

- No scopes.
- No standalone route.
- No token rotation.
