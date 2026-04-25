# MCP Token Issuance — Design

**Date:** 2026-04-25
**Status:** Approved
**Scope:** First Track 04 PR. Backend-only. `McpToken` model, `POST /api/mcp/tokens/` to issue, `DELETE /api/mcp/tokens/<id>/` to revoke. Both gated on a fresh 2FA session via `mcp.auth.require_fresh_2fa_session`. **No MCP transport, no tool registry, no protocol implementation in this PR** — those land later.

## Goal

Give a 2FA-verified user a way to mint short-lived, revocable, hashed-at-rest tokens that future MCP tools will authenticate against. Establishes the token model, the issuance flow, the revocation flow, and the audit-friendly fields every later MCP work depends on.

## Non-goals

- MCP server / transport (websocket / stdio / http handler) — separate later PR.
- MCP tool registry, schemas, error mapping.
- Authenticator middleware that consumes the token (`Authorization: Bearer …`) on MCP calls — lands when the transport does.
- Workspace binding on the token. Token is bound to a `User`; the active workspace is resolved per-call by the future MCP middleware.
- Rotation flow (issue-then-revoke-old) — pure revoke + re-issue is enough until the UX needs more.
- Frontend "manage tokens" page.

## Architecture

### Model

`backend/mcp/tokens/models.py` (new package — see below):

```py
class McpToken(TimeStampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                             related_name="mcp_tokens")
    name = models.CharField(max_length=120)         # human label, e.g. "Cursor on laptop"
    token_hash = models.CharField(max_length=64, unique=True)  # sha256 hex digest
    last_four = models.CharField(max_length=4)      # surface-only for the UI
    expires_at = models.DateTimeField()
    revoked_at = models.DateTimeField(null=True, blank=True)
    last_used_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("-created_at",)
        indexes = [models.Index(fields=("user", "revoked_at"))]
```

Choices:

- **UUID pk** — matches the rest of the codebase.
- **`token_hash`, not `token`.** The plaintext token is shown to the caller exactly once on issue (via the response payload) and never persisted. The model stores `sha256(token).hexdigest()`, which is plenty for an opaque secret with full entropy. (Argon2 / bcrypt would be overkill — these are random bytes, not human passwords.)
- **`last_four`** for the UI's "tk_xxxxxxxx" preview without storing the secret.
- **`expires_at` is required** at issue time. Default at the API layer is 30 days; caller can override up to 365.
- **`revoked_at` instead of a `revoked: bool`** so we can audit when revocation happened and let the resolver detect race conditions.
- **`last_used_at`** is nullable. The future MCP transport will bump it; for now it stays NULL.

`tokens/` is a package under `mcp/` because PR D's CLAUDE.md note said tokens live there. We make it a real Python package: `mcp/tokens/__init__.py`, `mcp/tokens/models.py`, `mcp/tokens/services.py`, `mcp/tokens/views.py`, `mcp/tokens/serializers.py`, `mcp/tokens/urls.py`. The existing `mcp/models.py` stays empty (default Django scaffold).

### Service layer

`backend/mcp/tokens/services.py`:

- `generate_token(...) -> tuple[McpToken, str]` — creates a row, returns `(record, plaintext)`. The plaintext is the only place the secret is exposed; callers must hand it back to the user immediately and discard.
- `revoke_token(actor: User, token_id: UUID) -> McpToken` — sets `revoked_at` on the row if `actor` owns it; raises `PermissionDenied` otherwise. Idempotent.

Plaintext format: `"slt_" + secrets.token_urlsafe(32)` — `slt_` for "slotflow", urlsafe so it lives cleanly in a header. ~43 chars total.

### Views

`backend/mcp/tokens/views.py`:

- `POST /api/mcp/tokens/` — body: `{"name": "<label>", "ttl_days": <int, optional, max 365>}`. Returns the new token row plus the `plaintext` (one-shot field). 201.
- `DELETE /api/mcp/tokens/<uuid>/` — sets `revoked_at`. Returns 204.
- `GET /api/mcp/tokens/` — list the caller's tokens. Useful preview for any future "tokens" page; cheap to add now.

All three handlers require `IsAuthenticated` and call `require_fresh_2fa_session(request)` first; on `McpAuthError` they return the carried `status_code` (401 or 403).

### Serializers

`backend/mcp/tokens/serializers.py`:

- `McpTokenSerializer(ModelSerializer)` — read-only on `id`, `name`, `last_four`, `expires_at`, `created_at`, `revoked_at`, `last_used_at`. Never exposes `token_hash`.
- `McpTokenIssueSerializer(Serializer)` — write-only, accepts `{name, ttl_days?}`; validates `ttl_days` is in `[1, 365]`.
- A `McpTokenIssueResponseSerializer` (or a hand-rolled dict in the view) renders the row plus the one-shot `plaintext`.

### URLs

`backend/mcp/tokens/urls.py` exposes the three routes. `backend/config/urls.py` mounts:

```py
path("api/mcp/tokens/", include("mcp.tokens.urls")),
```

`Require2FAMiddleware` already lets `/api/auth/...` and `/api/test/_reset/` through; mainstream API paths fall through to the redirect logic. `/api/mcp/...` does NOT need to be allowlisted: the user must be 2FA-verified for token issuance, which is exactly what the middleware enforces. Belt-and-braces: the views explicitly call `require_fresh_2fa_session` for the freshness check.

### Tests (per-category layout from PR #17)

All under `backend/mcp/tests/`:

- `models/mcp_token_test.py` — defaults, `__str__`, cascade on user delete, `revoked_at` nullable, ordering.
- `services/mcp_token_test.py` — `generate_token` returns a row with hash + last_four + a plaintext that hashes to the stored value; idempotent `revoke_token`; non-owner `revoke_token` raises.
- `api/mcp_token_test.py` — DRF tests for the three endpoints:
  - 401 anon on issue/list/revoke
  - 403 when 2FA not fresh (patch `mcp.auth.require_fresh_2fa_session` to raise)
  - 201 issue happy path returns a `plaintext` field exactly once + `last_four`
  - 400 on `ttl_days` out of range
  - 200 list returns only the caller's tokens
  - 204 revoke own token, sets `revoked_at`, second call still 204
  - 403 revoke another user's token
  - 404 revoke nonexistent

### Settings + admin

`backend/mcp/admin.py` registers `McpToken` with read-only `token_hash` (defense in depth — admins can revoke / browse but never see the secret). `list_display = ("name", "user", "last_four", "expires_at", "revoked_at", "last_used_at")`.

`mcp` is already in `INSTALLED_APPS` per PR D; no settings change.

## Frontend / e2e

Zero changes. The `/dashboard/settings` slug is still a stub — a manage-tokens UI is its own later PR.

## Risk & rollback

- One additive migration; no schema change to existing tables.
- New URL surface, but every verb is gated on `IsAuthenticated` + a fresh 2FA session. Token table is empty until a user issues one.
- Plaintext exposure is bounded: the `plaintext` field appears only on the issue response (201) and never in any subsequent GET. This is exactly the GitHub PAT shape.
- Rollback: revert the merge. `manage.py migrate mcp zero` drops the token table.

## Open questions

- Argon2 vs sha256 for the at-rest hash. SHA-256 is sufficient for opaque random secrets with full entropy; Argon2 is for human-chosen passwords. Sticking with sha256.
- TTL ceiling of 365 days. Adjustable later if user demand pushes for shorter or longer.
- Workspace binding deferred until the MCP transport demands it.
