# Workspace Switcher — Design

**Date:** 2026-04-25
**Status:** Approved
**Scope:** Backend `GET`/`POST /api/auth/active-workspace/` + DRF tests + a small workspace dropdown in the dashboard header. Replaces the "single membership" shortcut in `OpportunityViewSet._resolve_active_workspace` with a real session-bound choice.

## Goal

Multi-membership users need a way to pick which workspace they're acting in without sending `workspace=<uuid>` on every body. Land the smallest possible primitive: a session-stored UUID that the existing API resolution path can consume.

## Non-goals

- Workspace creation / membership invite flow — separate.
- An MCP client equivalent — Track 04 will pick this up when the transport lands.
- Auto-syncing the active workspace across browser tabs / devices.
- Switching the API's authz model. Membership lookup stays per-call; this PR just gives the resolver a stable input.
- Frontend list-of-workspaces fetch caching beyond the standard TanStack Query window.

## Architecture

### Session storage

The active-workspace UUID lives on the Django `Session` (server-side, signed cookie). Key: `slotflow_active_workspace_id`. Stored as the workspace's UUID string. Validated against the caller's memberships on every read so a stale session value can't promote them into a workspace they no longer belong to.

A small helper module `backend/tenancy/active_workspace.py` exposes:

```py
def get_active_workspace(request) -> Workspace | None:
    """Return the user's active workspace if any, falling back to the only
    membership when exactly one exists. Returns None when the user has no
    memberships, or has many and hasn't picked one yet."""

def set_active_workspace(request, workspace_id: str) -> Workspace:
    """Validate the UUID points at a workspace the caller belongs to and
    persist the choice on the session. Returns the resolved `Workspace`.
    Raises `WorkspaceNotMember` for unknown / non-member UUIDs."""

def clear_active_workspace(request) -> None
```

Validation uses `tenancy.permissions.get_membership(user, workspace)` — same path the rest of the codebase already trusts.

### HTTP surface

`backend/core/api_active_workspace.py` (new). One DRF function-view registered under `/api/auth/active-workspace/`:

- `GET` — returns `{active: {id, name, slug} | null, available: [{id, name, slug}, ...]}`. `available` is ordered by `name`. The endpoint is `IsAuthenticated`-gated; an anonymous caller gets the standard 401/403.
- `POST` — body `{workspace: <uuid>}`. Validates membership; on success returns the same shape as `GET`. 400 on missing/unknown id; 403 when the caller has no membership in that workspace.
- `DELETE` — clears the active workspace; returns 204.

The route is allowlisted by `Require2FAMiddleware` indirectly: `/api/auth/` is already in the middleware bypass set, so unverified users can hit the endpoint as long as they're authenticated. (We *want* this — picking a workspace is part of the post-login flow before TOTP completion when bypass is on; in production the middleware's normal auth chain already gates everything else.)

### View resolution change

`backend/opportunities/views.py` — `_resolve_active_workspace` now:

1. If body has `workspace`, use it (existing path; the serializer already validates membership).
2. Else, call `get_active_workspace(request)`. If non-None, use it.
3. Else, the existing single-membership fallback.
4. Else (multi-membership, no body, no session pick) → 400 with the existing "specify `workspace`" message.

This keeps backward compatibility with callers that send `workspace` explicitly while letting browser users skip the field once they've picked a workspace.

### Frontend

- `frontend/src/lib/activeWorkspaceHooks.ts` (new). Three hooks:
  - `useActiveWorkspace()` — `useQuery` of `GET /api/auth/active-workspace/`.
  - `useSetActiveWorkspace()` — `useMutation` of `POST /api/auth/active-workspace/` with body `{workspace: <id>}`. Invalidates the query + the opportunities list on success (the visible rows shift when the workspace changes).
  - `useClearActiveWorkspace()` — `useMutation` of `DELETE /api/auth/active-workspace/`.
- `frontend/src/components/WorkspaceSwitcher.tsx` (new). Renders inside `DashboardHeader` to the right of the title:
  - When `available.length <= 1`: render the lone workspace name as plain text (or empty when zero), no controls.
  - When `available.length > 1`: a native `<select>` with the active row marked. Switching calls `useSetActiveWorkspace`. While the mutation is pending the select is disabled.
- `frontend/src/components/DashboardHeader.tsx` (modify): mount `<WorkspaceSwitcher />` between the title and the existing user-menu cluster.
- Test ids in `frontend/src/testIds.ts` (mirror to `e2e/support/selectors.ts`):
  - `WORKSPACE_SWITCHER`
  - `WORKSPACE_SWITCHER_LABEL`
  - `WORKSPACE_SWITCHER_SELECT`

### Tests

**Backend** — `backend/core/tests/api/active_workspace_test.py` (new), six cases:
1. Anon GET → 401 / 403.
2. GET with one membership → `active` matches that workspace; `available` has one entry.
3. POST `{workspace: <uuid>}` for a workspace the user belongs to → 200; subsequent GET reflects the choice.
4. POST `{workspace: <uuid>}` for a workspace the user does NOT belong to → 403 / 400, session value untouched.
5. DELETE clears; subsequent GET shows `active=null` (when membership count != 1) or falls back to the lone membership.
6. The opportunities API now uses the session value: a multi-membership user POSTs `/api/opportunities/` without `workspace` after picking workspace B, expects the row to land in B.

**Frontend** — `frontend/src/components/WorkspaceSwitcher.test.tsx` (new), four cases via mocked hooks:
1. Renders a label when there's exactly one workspace (no `<select>`).
2. Renders the `<select>` with available workspaces when there are >= 2.
3. Selecting a different workspace calls `useSetActiveWorkspace().mutate(...)` with the new id.
4. Disables the select while the mutation is pending.

No e2e changes (the existing harness is fine; the API change is backwards compatible).

## Risk & rollback

- One additive endpoint + one view-level resolver change. The opportunities API stays backwards compatible: callers that send `workspace` explicitly are unaffected, and the existing single-membership fallback still catches users who haven't picked one.
- Stale session value can't promote: every read goes through `get_membership`. If a user's membership is revoked, the next GET returns `active=null` until they pick a different one.
- Rollback: revert the merge. The session key becomes harmless dead data on existing sessions; a `flush` (already gated behind dev-only paths) clears it on next reset.

## Open questions

- Whether to surface a "no workspace selected" error state when a multi-membership user has no pick. Today: the API simply 400s the create; the frontend can display the same error. A nicer UX (auto-prompt to pick on first login when there are multiple) lands when invitations do.
- Cookie-vs-session-storage trade-off. Sessions win for now (server-side, signed, no client tampering, automatic CSRF compatibility).
