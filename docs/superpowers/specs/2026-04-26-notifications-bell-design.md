# Notifications Bell — Track 10 (BE + FE + e2e)

**Date:** 2026-04-26
**Status:** Approved

## Goal

Workspace owners need an in-app signal when teammates take security-relevant or workflow-relevant actions (token issuance, opportunity archive, stage change). The audit log records these events but there is no UI surface that *notifies* the user.

## Architecture

### Backend

- **App `notifications`**: new Django app registered in `INSTALLED_APPS`.
- **Model `Notification`**: per-recipient row with `recipient` (FK to `AUTH_USER_MODEL`, CASCADE), `kind` (string key the FE can switch on), `payload` (JSON, FE-friendly subset of audit metadata), `workspace` (FK, optional), `read_at` (nullable). Index `(recipient, read_at, -created_at)` for the bell's unread query.
- **Service `notifications.services`**:
  - `create_notification(*, recipient, kind, payload, workspace)` — write one row.
  - `notify_workspace_owners(*, workspace, actor, kind, payload)` — fan out to every workspace OWNER except the actor (system actions where `actor=None` notify all owners).
  - `mark_read(*, recipient, ids)` / `mark_all_read(*, recipient)` — flip `read_at` filtered by recipient (so a malicious caller can't flip another user's rows).
- **Audit fan-out hook**: `audit.write_audit_event` calls `notify_workspace_owners` whenever the audit row carries a workspace. Workspace-less events (system-only) skip the fan-out — the audit log itself is the durable record. Only a small FE-friendly subset of metadata leaks into the notification payload (`title`, `company`, `name`, `stage`, `from`, `to`).
- **Endpoints** (mounted at `/api/notifications/`):
  - `GET /api/notifications/?unread=1` — paginated list, recipient-scoped.
  - `GET /api/notifications/unread-count/` — `{count}` for the bell badge.
  - `POST /api/notifications/mark-read/` body `{ids: []}` — marks the listed rows read for the requester.
  - `POST /api/notifications/mark-all-read/` — flips every unread row for the requester.
- **Tests**: `tests/services/fanout_test.py` (creation, owners-only, actor-exclusion, audit auto-hook, no-workspace skip, mark-read scoping, mark-all-read scoping); `tests/api/list_test.py` (auth, scoping, ordering, unread filter, response shape, unread-count, mark-read happy path, mark-read non-list 400, mark-read foreign-id no-op, mark-all-read).

### Frontend

- **Hook `lib/notificationsHooks.ts`**:
  - `useNotifications()` — query the list.
  - `useUnreadNotificationCount()` — query the count, with a 30s polling interval (`refetchIntervalInBackground: false`) so a teammate's action surfaces without manual reload.
  - `useMarkNotificationsRead()` / `useMarkAllNotificationsRead()` — mutations that invalidate both list and count caches on success.
- **Component `components/NotificationsBell.tsx`**: bell button in `DashboardHeader` with an unread-count badge (clamped to "99+"). Clicking toggles a popover panel; outside-click closes it (document-level `mousedown` listener bound only while open). Per-row "Mark read" buttons; a header-level "Mark all read" disabled while unread is zero. Read rows render dimmed with the mark-read button hidden. `kind` → human phrasing in `describeKind` with a fallback for unknown kinds.
- **Wiring**: mounted in `DashboardHeader`. `DashboardHeader.test.tsx` stubs the bell to a no-op so header-focused tests don't need to mock the new hooks.
- **Tests** (`NotificationsBell.test.tsx`): 8 vitest cases — badge hidden at zero / shown / clamped to 99+, open panel + render rows, empty state, mark-read mutation, mark-all-read mutation, mark-all-read disabled at zero unread.

### E2E

- `tests/notifications_bell.spec.ts`: stubs `/api/notifications/*` via `page.route` because the seed e2e workspace has only one user (so a real fan-out never lands a notification for the actor). Exercises badge → open panel → mark-read → badge disappears.

## Test plan

- Backend: gains 16 cases. Total ~454 → ~470.
- Frontend vitest: gains 8 cases. Total ~185 → ~193.
- E2E: 1 new spec.

## Risk & rollback

- One additive table + one new endpoint surface + one new FE component. Reverting is a single revert commit.
- Audit fan-out fires inside `audit.write_audit_event` — a buggy notification write could in principle take down audit writes. Mitigated by `@transaction.atomic` on `create_notification` (rolls back its own row on error) and the surrounding audit transaction. Worth watching after deploy.
- 30s polling for the badge adds N requests/min/user. Acceptable for current scale; revisit if user count grows.
