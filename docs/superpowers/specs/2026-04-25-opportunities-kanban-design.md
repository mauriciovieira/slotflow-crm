# Opportunities Kanban Board — Slice 9b (FE + e2e)

**Date:** 2026-04-25
**Status:** Approved
**Scope:** Second cut of Track 09. Read-side board grouping opportunities by stage with native HTML5 drag-and-drop to change stage. BE already accepts `PATCH stage` and writes a transition row; this slice is FE + e2e only.

## Goal

A user manages an active pipeline by *moving* opportunities between stages, not by editing one row at a time. The detail-screen `<select>` worked in slice 9a but doesn't show the rest of the pipeline at a glance.

## Non-goals

- Reordering within a column (no per-column position field today; would require a BE schema change).
- Multi-select / bulk move.
- Touch-screen drag (HTML5 DnD doesn't fire on touch; revisit if mobile usage grows).
- A drag-and-drop library. Native HTML5 DnD covers the desktop happy path with no new dep.

## Architecture

### Frontend

- **Route:** `/dashboard/opportunities/board` mounted from `router.tsx`. The list screen at `/dashboard/opportunities` keeps its current behavior; a "Board / Table" toggle in the list header switches between the two routes.
- **Screen `screens/OpportunitiesBoard.tsx`:** one column per `OpportunityStage` (six total). Each column renders the opportunities at that stage as draggable cards. Reuses `useOpportunities` (existing) plus a new shared imperative hook (next bullet).
- **Hook `useMoveOpportunity()`** (added in `lib/opportunitiesHooks.ts`): imperative variant of `useUpdateOpportunity` that takes `{id, payload}` so callers without a fixed id at hook-creation time (the kanban) can fire it from a drop handler. Cache semantics match `useUpdateOpportunity.onSuccess` (per-row cache write + stage-history invalidation + list invalidation); `onError` invalidates the list to roll the optimistic write back. Centralizing the mutation here keeps the kanban and the detail screen consistent — the board would otherwise duplicate the PATCH and the cache writes.
- **Keyboard accessibility:** each card carries a per-card stage `<select>` (visually labeled `Move to`, screen-reader label "Move <title> to a different stage") that fires the same `move.mutate` flow as a drop. Native `<select>` is keyboard-focusable and screen-reader-friendly out of the box, where HTML5 DnD is neither. The select is disabled while a previous move is in flight so it can't race the drop path.
- **Drag-and-drop:** native HTML5 (`draggable`, `onDragStart`, `onDragOver`, `onDrop`). On drop:
  1. Read the dragged card's id from `dataTransfer.getData("application/x-opportunity-id")`.
  2. Race-guard: if `move.isPending`, ignore the drop (and `<Column>` already passes `acceptingDrops={!move.isPending}` to disable dragging during the inflight PATCH).
  3. Same-column short-circuit: look up the dragged row from the closed-over `useOpportunities` data; if its current `stage` already equals the target, return without writing.
  4. Optimistically update the React Query list cache so the card appears in the new column immediately.
  5. Fire `move.mutate({ id, payload: { stage: <new> } })`. The hook's `onSuccess` invalidates queries; on error, `onError` invalidates the list to reconcile back to server truth.

  No `<DropMutator>` child component, no `useEffectOnce` ref guard — both were dropped after Copilot review as React 18 StrictMode would have reset the ref on remount and fired the PATCH twice in dev. The current design is purely imperative.
- **Toggle wiring:** `OpportunitiesList.tsx` gains a header pair of buttons (Table / Board); `OpportunitiesBoard.tsx` gets the same toggle pointing the other way. Plain `<Link>` to keep the routing transparent.
- **Test ids:** new `OPPORTUNITIES_VIEW_TOGGLE_BOARD` / `_TABLE`, `OPPORTUNITIES_BOARD`, `OPPORTUNITIES_BOARD_LOADING`, `_ERROR`, `_COLUMN`, `_CARD`. Mirrored to `e2e/support/selectors.ts`.
- **Vitest** (`screens/OpportunitiesBoard.test.tsx`): renders the loading branch, the error branch, the populated grid (with cards in the right column), and exercises the drop path by firing synthetic `dragstart` / `dragover` / `drop` events and asserting `apiFetch` was called with `PATCH /api/opportunities/<id>/` and the new stage in the body. Same-column drop and empty-payload drop are asserted as no-ops. Real DnD across screens isn't in jsdom's coverage; we test the handler wiring, not browser behavior. A separate case asserts that a row with an unknown stage value is skipped with a console warning rather than crashing the screen.

### Backend

No changes. The PATCH path already records a stage transition + audit event when the stage value differs (slice 9a). Optimistic moves rely on that contract.

### E2E

`e2e/tests/opportunities_kanban.spec.ts`:

1. Reset → login.
2. Create one opportunity through the UI.
3. Click the Board toggle on the opportunities list.
4. Drag the card from the Applied column to the Interview column.
5. Assert the card now appears in the Interview column.
6. Reload to confirm the change is server-side, not just optimistic.

Playwright supports HTML5 DnD via `dragTo` (it dispatches the right synthetic events under Chromium); the spec uses that rather than mouse coords.

## Test plan

- Backend: no new cases.
- Frontend vitest: gains ~5 cases.
- E2E: 1 new spec.

## Risk & rollback

- New route only; the existing list view is untouched. Reverting is one revert commit.
- Optimistic update paired with explicit cache invalidation on error keeps the FE in sync with the server in failure modes.
- No drag library; if browser DnD inconsistencies surface (e.g. Firefox quirks), we can swap in `@dnd-kit/core` later as a contained migration.
