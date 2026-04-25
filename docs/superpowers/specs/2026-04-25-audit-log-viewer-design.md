# Audit Log Viewer — Full Slice (BE + FE + e2e)

**Date:** 2026-04-25
**Status:** Approved
**Scope:** Track 08. Surface the existing `audit.AuditEvent` table to workspace owners through a read-only dashboard screen with filters.

## Goal

Workspace owners must be able to inspect security-sensitive activity in their own workspace without dropping into the Django admin. Common questions:

- "Who issued / revoked an MCP token last week?"
- "Which user archived this opportunity?"
- "What happened around this `correlation_id` we saw in the logs?"

## Non-goals

- Editing or deleting audit rows (the table is append-only; admin already blocks writes).
- Cross-workspace global view — owners only see events scoped to workspaces they own.
- Full-text search in `metadata` JSON. We expose structured filters only; metadata is shown verbatim.
- Export to CSV — defer.

## Architecture

### Backend

- **Serializer (`audit/serializers.py`):** `AuditEventSerializer` with fields `id, actor_repr, action, entity_type, entity_id, workspace, correlation_id, metadata, created_at`. Read-only (`fields` enumerated, no `update`/`create`). `actor_repr` is the frozen-at-write label and is the primary "who" surface; we don't expose the actor FK on the wire because the audit log must survive user deletion.
- **View (`audit/views.py`):** `AuditEventListView(ListAPIView)` at `GET /api/audit-events/`. Required query param: `workspace=<uuid>`. Optional: `action`, `entity_type`, `entity_id`. Cursor-keyed pagination is overkill for the volumes we expect; use DRF `PageNumberPagination` with `page_size=50` and a hard cap.
- **Authz:** owner-only. Gate with `user_has_workspace_role(user, workspace, min_role=MembershipRole.OWNER)`. The shipped helper takes a `min_role` kwarg; `require_membership` only enforces *some* membership and does not role-gate, so we use the role-aware helper here directly. Rationale: the audit log can leak who did what across the team; member / viewer roles can already see the data they need through normal screens. We can relax later if a member-visible subset emerges.
- **URL:** `audit/urls.py` → mounted at `/api/audit-events/` from `config/urls.py`.
- **Filtering:** explicit `if param:` chains on the queryset rather than `django-filter`. Keeps the filter surface auditable (no accidental field exposure) and avoids a new dep for three filters.
- **Tests:**
  - `audit/tests/api/list_test.py`: auth required, workspace param required, owner-only, member/viewer return 403, filter by action / entity_type / entity_id, cross-workspace returns its own rows only, pagination keys, ordering newest-first.

### Frontend

- **Hook (`lib/auditEventsHooks.ts`):** `useAuditEvents({workspaceId, action?, entityType?, entityId?, page?})` with `enabled` gate so an unselected workspace doesn't fire a request. Cache key includes all filter inputs.
- **Screen (`screens/AuditLog.tsx`):** new dashboard route `/dashboard/audit`. Header with three text-input filters (action / entity type / entity id) + clear-all button. Below: table of events (timestamp, actor_repr, action, entity, correlation_id). Metadata rendered as a collapsible `<details>` per row showing pretty-printed JSON.
- **Nav (`dashboardNav.ts`):** new `audit` slug between `insights` and `settings`. `NAV_AUDIT` testId.
- **Pagination:** "Load more" button while there is a `next` URL in the DRF response (simpler than numbered pages for an event log).
- **Test ids:** mirror to `e2e/support/selectors.ts`.
- **Vitest:** screen states (loading, error, empty, populated, filter narrows, "Load more" appends, metadata expand/collapse). One file: `screens/AuditLog.test.tsx`.

### E2E

`e2e/tests/audit_log.spec.ts`:

1. Reset DB.
2. Stub `**/api/audit-events/?*` via `page.route` with two fixture rows on first page (action `mcp_token.issued`, `mcp_token.revoked`) and an empty second page. Stubbing keeps the spec from depending on real audit-event seeding plumbing — BE coverage lives in `audit/tests/api/list_test.py`.
3. Login → click `audit` nav.
4. Assert both rows visible.
5. Type `mcp_token.issued` in the action filter → assert only the issued row remains.
6. Click metadata expander → assert metadata content is visible.
7. Click "Load more" against the empty page → assert button disappears.

## Test plan

- Backend: `make -C backend test` — gains ~9 cases, total ~428.
- Frontend vitest: `make -C frontend test` — gains ~6 cases, total ~169.
- E2E: 1 new spec, runs on CI.

## Risk & rollback

- Net-additive surface: one DRF endpoint, one route. Reverting is a single revert commit.
- No schema change. No new env var.
- Owner-only gate is conservative; we can broaden to members later if requested.

## Out of scope reminders

- No metadata search.
- No CSV export.
- No editing.
- No cross-workspace view.
