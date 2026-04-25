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
- `GET` — list current user's tokens (`{id, name, last_four, last_used_at, created_at, revoked_at}` shape per the existing serializer).
- `POST` — issue: returns `{token, ...record}` where `token` is the plaintext shown once.
- `DELETE /<uuid>/` — revoke (sets `revoked_at`).

The endpoint is already gated by `IsAuthenticated` + a fresh-2FA check (15-min OTP window). Dev / e2e bypass already covers it.

### Frontend

**Hook (`lib/mcpTokensHooks.ts`):**

- `useMcpTokens()` — `GET /api/mcp/tokens/`.
- `useIssueMcpToken()` — `POST`. Returns the issued record including the plaintext `token`.
- `useRevokeMcpToken(id)` — `DELETE /api/mcp/tokens/<id>/`.

Cache key: `["mcp-tokens", "list"]`.

**Section component (`components/McpTokensSection.tsx`):**

Mounted inside `Settings.tsx` after the FX rates section (Settings is the sensible home for token management; the spec rejects a standalone slug). The section provides:

- Token list table: `name / last_four / last_used_at / created_at / revoked_at`. Revoked rows render dimmed and don't show a revoke button.
- "Issue token" inline form: name field + submit. On success the response payload's `token` plaintext is shown in a one-time-only "copy this now" panel with a copy-to-clipboard button. The plaintext is never stored in React Query cache; the panel state lives only on the section component.
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
2. Open Settings.
3. Click "Issue token", fill `Demo`, submit.
4. Plaintext panel appears with a `slt_…` token; assert it's visible.
5. Close the plaintext panel.
6. List shows the new row with `last_four`.
7. Click Revoke → confirm.
8. Row shows revoked timestamp; revoke button gone.

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
