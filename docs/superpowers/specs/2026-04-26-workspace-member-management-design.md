# Workspace Member Management — Track 11 (BE + FE + e2e)

**Date:** 2026-04-26
**Status:** Approved

## Goal

Workspace owners need an in-app surface to manage who can access a workspace: see the roster, change roles (owner / member / viewer), invite teammates by email, revoke pending invitations, and remove or transfer ownership of the workspace. Today the only path to add a member is the Django admin, and there is no UI for role changes, leaves, or transfers.

## Architecture

### Backend (`tenancy` app — no new app)

#### Models

Add `Invitation`:

- `id` UUID primary key.
- `workspace` FK to `tenancy.Workspace` (`CASCADE`).
- `email` `EmailField`, normalized to lowercase on save.
- `role` `CharField` from `MembershipRole.choices`, default `MEMBER`.
- `token` `CharField(max_length=64, unique=True)` — `secrets.token_urlsafe(32)` at creation; embedded in the accept URL.
- `created_by` FK to `AUTH_USER_MODEL`, `SET_NULL` (so deleted-user history doesn't cascade-delete invites).
- `expires_at` `DateTimeField`, default `now() + 7 days`.
- `accepted_at`, `revoked_at` nullable `DateTimeField`s.
- Indexes: `(workspace, email)` partial-or-full + `(token)` unique.
- Property `is_active` — true iff `accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now()`.

#### Service layer (`tenancy/services.py`, new)

- `guard_last_owner(*, membership: Membership, action: str) -> None` — raises `LastOwnerError` if the action would leave the workspace with zero owners (used by role demote + remove + leave + transfer). Action label is for the audit + 4xx body.
- `change_role(*, actor, membership, new_role) -> Membership` — guards last-owner when demoting the only owner.
- `remove_member(*, actor, membership) -> None` — guards last-owner; emits audit `member.removed` (or `member.left` if `actor.pk == membership.user_id`).
- `transfer_ownership(*, actor, target_membership, demote_self: bool=True) -> None` — promotes target to OWNER; if `demote_self`, demotes actor to MEMBER. Atomic + audit `workspace.ownership_transferred`.
- `create_invitation(*, actor, workspace, email, role) -> Invitation` — rejects existing-member email (`ValidationError`); rejects already-pending non-expired invite for same email (returns existing? or 409 — choose 409 for clarity); audit `invitation.created`.
- `revoke_invitation(*, actor, invitation) -> None` — sets `revoked_at`; audit `invitation.revoked`.
- `accept_invitation(*, user, token) -> Membership` — validates active+matching email or just active (matching-email is a soft check; the bearer-of-token contract is the security gate); creates Membership; sets `accepted_at`; audit `invitation.accepted`. Idempotent on already-accepted (200 with existing membership). 409 on revoked/expired.

Each service helper writes a row via `audit.write_audit_event(actor=…, action=…, workspace=workspace, metadata=…)` so the existing notifications fan-out hook surfaces the action to other workspace owners.

#### Endpoints (`tenancy/urls.py`, new include under `/api/workspaces/`)

| Verb | Path | Permission |
|------|------|------------|
| GET | `/api/workspaces/<ws_id>/members/` | any membership |
| PATCH | `/api/workspaces/<ws_id>/members/<m_id>/` | OWNER |
| DELETE | `/api/workspaces/<ws_id>/members/<m_id>/` | OWNER (or self for self-leave) |
| POST | `/api/workspaces/<ws_id>/transfer-ownership/` | OWNER |
| GET | `/api/workspaces/<ws_id>/invitations/` | OWNER |
| POST | `/api/workspaces/<ws_id>/invitations/` | OWNER |
| DELETE | `/api/workspaces/<ws_id>/invitations/<inv_id>/` | OWNER |
| POST | `/api/invitations/<token>/accept/` | authenticated |

Permission enforcement uses `tenancy.permissions.user_has_workspace_role(user, ws, min_role=…)` already in the codebase.

#### Audit + notifications

New action constants — fire through existing `audit.write_audit_event` so the notifications fan-out hook (added in Track 10) surfaces these to the *other* owners:

- `member.role_changed` — metadata `{from, to, target_user_id}`.
- `member.removed` — metadata `{target_user_id}`.
- `member.left` — metadata `{target_user_id}` (the leaver, recorded for symmetry with `member.removed`).
- `invitation.created` — metadata `{email, role}`.
- `invitation.revoked` — metadata `{email}`.
- `invitation.accepted` — metadata `{email}`.
- `workspace.ownership_transferred` — metadata `{from_user_id, to_user_id, demoted_self}`.

#### Tests

- `tenancy/tests/api/members_test.py` — list scoping, role toggle (200), role toggle (last-owner 409), remove other (200), remove self / leave (200), remove last-owner-self (409), transfer happy path, transfer to non-owner-eligible target (404), transfer-without-demote keeps two owners.
- `tenancy/tests/api/invitations_test.py` — create / list / revoke / accept happy paths, dup-email 409, expired-token 409, revoked-token 409, accept by stranger (matching email check is informational; bearer-of-token wins; assert it works), idempotent accept on already-accepted.
- `tenancy/tests/services/` — last-owner guard unit tests.

Approximate count: ~25 new BE tests.

### Frontend

#### New screen: `screens/AcceptInvite.tsx`

Mounted at `/invitations/:token/accept` inside the authenticated app shell. Calls `POST /api/invitations/<token>/accept/`. Success → redirect to `/dashboard/opportunities`. Error → inline error banner with retry. Anonymous bounce: existing `AuthGuard` will redirect to `/login` first; the user can resume after sign-in (we preserve the path on auth bounce as today).

#### New section in `screens/Settings.tsx`

Mounted between the FX block and the MCP tokens block. Single component `MembersSection` with sub-components in the same file or `frontend/src/components/members/`:

- `MembersTable` — rows: avatar/initials + display name + email + role select (owner-only) + remove button (owner-only or self).
- `InviteMemberForm` — email field + role select + submit. Disabled for non-owners.
- `PendingInvitationsTable` — email + role + expires + revoke button (owner-only). Hidden for non-owners.
- `TransferOwnershipDialog` — owner-only; picks a target membership; toggle "demote me to member"; submit.
- `LeaveWorkspaceButton` — confirm dialog; calls remove-self endpoint.

Ownership-aware UI: when the requester is not OWNER, the role select on each row is read-only, the invite/revoke buttons are hidden, and the Leave button is the only mutation available.

#### Hooks (`lib/membersHooks.ts`, new)

`useMembers(workspaceId)`, `useInvitations(workspaceId)`, `useInviteMember`, `useChangeMemberRole`, `useRemoveMember`, `useRevokeInvitation`, `useAcceptInvitation(token)`, `useTransferOwnership`, `useLeaveWorkspace`. Each mutation invalidates the affected list query (members + invitations) plus `workspaces` so the workspace switcher reflects role changes.

#### TestIds

`MEMBERS_SECTION`, `MEMBERS_TABLE`, `MEMBERS_ROW`, `MEMBERS_ROLE_SELECT`, `MEMBERS_REMOVE_BUTTON`, `MEMBERS_INVITE_FORM`, `MEMBERS_INVITE_EMAIL`, `MEMBERS_INVITE_ROLE`, `MEMBERS_INVITE_SUBMIT`, `MEMBERS_PENDING_TABLE`, `MEMBERS_PENDING_ROW`, `MEMBERS_REVOKE_BUTTON`, `MEMBERS_TRANSFER_BUTTON`, `MEMBERS_TRANSFER_DIALOG`, `MEMBERS_TRANSFER_TARGET`, `MEMBERS_TRANSFER_DEMOTE`, `MEMBERS_TRANSFER_SUBMIT`, `MEMBERS_LEAVE_BUTTON`, `MEMBERS_LEAVE_CONFIRM`, `ACCEPT_INVITE_SCREEN`, `ACCEPT_INVITE_ERROR`, `ACCEPT_INVITE_RETRY`.

#### Tests

`MembersSection.test.tsx`, `InviteMemberForm.test.tsx`, `TransferOwnershipDialog.test.tsx`, `AcceptInvite.test.tsx`. ~10 cases.

### E2E

`tests/workspace_members.spec.ts`: stubs `/api/workspaces/<id>/members/`, `/api/workspaces/<id>/invitations/`, `POST /api/workspaces/<id>/invitations/`, `DELETE /api/workspaces/<id>/invitations/<id>/`, `PATCH /api/workspaces/<id>/members/<id>/`, because the seeded workspace has only one user. Asserts: open Settings → see invite form → submit → see pending row → revoke → row disappears; toggle a member's role.

## Test plan

- Backend: ~25 new tests. Total ~454 → ~480.
- Frontend vitest: ~10 cases. Total ~196 → ~206.
- E2E: 1 new spec.

## Risk & rollback

- **Last-owner guard** is the load-bearing invariant. Centralized in `tenancy.services.guard_last_owner` and unit-tested directly. Without it a workspace could end up unmanageable.
- New `Invitation` table is additive. Reverting is one revert + one migration unwind.
- No outbound email delivery in this slice — surface the accept link via clipboard copy. Email send is a follow-up Track.
- Token is `secrets.token_urlsafe(32)` (43-char base64url, ~256 bits). Stored as plain text; the model is private (owner-only listing) and tokens expire in 7 days. Acceptable for this slice; rotate to hashed-token storage if the threat model demands it.

## Out of scope

- Outbound email delivery (link-copy only).
- Bulk invites.
- Per-workspace branding or invite templates.
- SSO / domain auto-join.
- Audit-log surface for `invitation.*` rows (already covered by the AuditLog screen via the existing audit query).
