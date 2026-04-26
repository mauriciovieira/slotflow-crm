# Opportunity Stage History — Slice 9a (BE + FE + e2e)

**Date:** 2026-04-25
**Status:** Approved
**Scope:** First slice of Track 09. Record every stage change on an Opportunity to a durable history table, expose it via DRF, and render it on the OpportunityDetail screen. Kanban / drag-and-drop is the next slice (9b).

## Goal

Workspace members must be able to see when an opportunity moved between stages, who moved it, and what the previous stage was. Today the only signal is the current stage on the row — the prior states are lost.

## Non-goals

- Drag-and-drop kanban board (slice 9b).
- Editing or deleting transition rows (append-only, like `audit.AuditEvent`).
- Filtering / pagination on the history endpoint — short list per opportunity, render in full.
- Backfilling historical transitions for opportunities that were touched before this slice. Existing rows start with an empty history; the timeline begins at deploy.

## Architecture

### Backend

- **Model `OpportunityStageTransition`** (in `opportunities/models.py`): UUID pk, FK `opportunity` (CASCADE), `from_stage`, `to_stage` (both `OpportunityStage` choices), `actor` FK (`SET_NULL`), `actor_repr` (frozen-at-write so the row survives user deletion). `Meta.ordering = ("-created_at",)`, index `(opportunity, -created_at)`.
- **Service `record_stage_transition(*, actor, opportunity, from_stage, to_stage)`** (in `opportunities/services.py`): writes the history row + an `opportunity.stage_changed` `AuditEvent`. Caller asserts the transition actually happened — the helper does not lock or compare.
- **Viewset hook**: `OpportunityViewSet.perform_update` snapshots `serializer.instance.stage` *before* `serializer.save()`, then calls `record_stage_transition` only when the new stage differs. The serializer save runs inside DRF's request transaction, so no extra lock is needed for ordering.
- **History endpoint**: `@action(detail=True, methods=["get"], url_path="stage-history")` on the viewset → `GET /api/opportunities/<id>/stage-history/`. Returns the chronological list (newest first). Workspace membership is enforced by the existing `IsWorkspaceMember` permission — anyone who can read the opportunity can read its history. Viewer role is allowed (read-only).
- **Serializer `OpportunityStageTransitionSerializer`** (read-only): `id, opportunity, from_stage, to_stage, actor_repr, created_at`. Actor FK is *not* exposed; `actor_repr` is the human label that survives user deletion.
- **Tests**: `opportunities/tests/api/stage_history_test.py`. PATCH with changed stage records a row; PATCH with unchanged stage / non-stage fields does not; PATCH setting stage to its current value is a no-op; the history endpoint returns rows newest-first and the documented field shape; anonymous gets 401/403; non-member gets 403/404; viewer can GET but cannot PATCH (and the failed PATCH writes no transition).

### Frontend

- **Hook `useStageHistory(id)`** (in `lib/opportunitiesHooks.ts`): `useQuery` against `GET /api/opportunities/<id>/stage-history/`. New cache key `["opportunities", "stage-history", <id>]`.
- **Update mutation invalidation**: `useUpdateOpportunity.onSuccess` busts both `OPPORTUNITIES_KEY` and the per-opportunity `stageHistoryKey`. Cheap; avoids threading the before/after stage through the mutation.
- **Component `<OpportunityStageHistorySection opportunityId={...} />`**: card mounted on `OpportunityDetail.tsx` after the resumes section. Loading / error (with refetch) / empty / populated branches each keyed by their own testId. Each row renders `from_stage → to_stage` with the user-facing labels from `STAGE_LABEL`, plus `actor_repr` and a localized timestamp. Unknown stages (e.g. a future deploy that adds one) fall back to the raw value rather than rendering "undefined".
- **Test ids**: 6 new `OPPORTUNITY_STAGE_HISTORY_*` ids; mirrored to `e2e/support/selectors.ts`.
- **Vitest**: dedicated `OpportunityStageHistorySection.test.tsx` covering all four branches plus the unknown-stage fallback. `OpportunityDetail.test.tsx` mocks the section to a no-op so the existing detail-screen cases don't need to mock the new hook.

### E2E

`e2e/tests/opportunity_stage_history.spec.ts`:

1. Reset → login.
2. Create an opportunity through the UI (`Senior Engineer` @ `Acme`) — exercises the same write path users do.
3. Open the detail screen → assert the history section renders the empty state.
4. Change stage `applied` → `interview`, save.
5. Assert one history row appears with both labels visible.

No `page.route` stubbing this time — the BE write path is the contract under test, and the e2e DB reset gives us a clean baseline.

## Test plan

- Backend: gains 8 cases. Total ~438.
- Frontend vitest: gains 5 cases. Total ~176.
- E2E: 1 new spec.

## Risk & rollback

- One additive table (`opportunities_opportunitystagetransition`). Migration is forward-only but reversible.
- One new endpoint, one new FE section. Reverting is a single revert commit; the migration can stay applied (the table just goes unread).
- `perform_update` is the only place that writes transitions today, so admin-side stage edits via the Django admin won't generate a row. Documented in the spec; revisit if admin edits become common.

## Out of scope reminders

- No kanban (9b).
- No drag-and-drop.
- No backfill.
