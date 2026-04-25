# Opportunity Detail / Edit — Design

**Date:** 2026-04-25
**Status:** Approved
**Scope:** PR J — detail page at `/dashboard/opportunities/<uuid>` that lets the user view a single opportunity, edit its title/company/stage/notes, and archive it. Closes the C/R/U/D loop the dashboard needs.

## Goal

Click a row in the list view → land on a detail page with the same fields the create form already has, plus the stage selector and an Archive button. PATCH on save, soft-delete on archive. Cache invalidation refetches the list.

## Non-goals

- Workspace switcher; already deferred.
- Stage transition rules. The API accepts any value, the UI exposes the full enum.
- Activity log / audit timeline (Track 08).
- Comments / files / @mentions.
- Hard-delete UI. The API only soft-deletes (archive); restore is admin-only for now.
- Stage-pill selector with custom widget. A native `<select>` is enough.

## Architecture

### Routing

`frontend/src/router.tsx` adds one nested child under `/dashboard`:

```
{ path: "opportunities/:opportunityId", element: <OpportunityDetail /> },
```

The path lives between the index redirect and the existing `opportunities/new` child. Order matters because React Router's matcher is path-based, but `:opportunityId` cannot accidentally match `new` since `:opportunityId` is a UUID and the route registration explicitly lists `opportunities/new` higher up.

### Hooks

`frontend/src/lib/opportunitiesHooks.ts` (modify) adds three:

```ts
export function useOpportunity(id: string) { ... }
export function useUpdateOpportunity(id: string) { ... }
export function useArchiveOpportunity(id: string) { ... }
```

- `useOpportunity` — `useQuery({ queryKey: ["opportunities", "detail", id], queryFn: () => apiFetch<Opportunity>(`/api/opportunities/${id}/`) })`. Disables itself on missing id.
- `useUpdateOpportunity` — `useMutation` PATCHing `/api/opportunities/${id}/` with `OpportunityUpdatePayload` (a Partial-shaped subset). On success invalidate both the detail key for that id and the list key.
- `useArchiveOpportunity` — `useMutation` DELETEing the same URL. The API responds 204; the helper invalidates the list and removes the detail key.

A new `OpportunityUpdatePayload` interface mirrors the writable fields the serializer accepts on PATCH: `title`, `company`, `stage`, `notes`. `workspace` stays out — the backend made it write-once after PR #18.

### Screen

`frontend/src/screens/OpportunityDetail.tsx` (new):

- Reads `:opportunityId` via `useParams()`.
- Renders four states: loading, error (404 → "Not found", anything else → "Could not load"), populated, archived (renders read-only with a "This opportunity is archived" banner).
- Populated state: edit form pre-filled with the row. Submit calls `useUpdateOpportunity(id).mutateAsync(...)`. Stage `<select>` pulls labels from a small `STAGES` array imported from `opportunitiesHooks.ts`.
- Archive: a button below the form. Clicking shows a small inline confirm ("Archive this opportunity?") with a Yes / Cancel pair. Yes calls `useArchiveOpportunity(id).mutateAsync()` then `navigate("/dashboard/opportunities")`. Cancel hides the confirm.
- Back link: `<Link to="/dashboard/opportunities">`.
- Test ids: `OPPORTUNITY_DETAIL_FORM`, `OPPORTUNITY_DETAIL_TITLE`, `OPPORTUNITY_DETAIL_COMPANY`, `OPPORTUNITY_DETAIL_STAGE`, `OPPORTUNITY_DETAIL_NOTES`, `OPPORTUNITY_DETAIL_SAVE`, `OPPORTUNITY_DETAIL_ARCHIVE`, `OPPORTUNITY_DETAIL_ARCHIVE_CONFIRM`, `OPPORTUNITY_DETAIL_ARCHIVE_CANCEL`, `OPPORTUNITY_DETAIL_ERROR`, `OPPORTUNITY_DETAIL_NOT_FOUND`, `OPPORTUNITY_DETAIL_BACK`.

### List view linkage

`frontend/src/screens/OpportunitiesList.tsx`: wrap each row's title cell in a `<Link to={`/dashboard/opportunities/${opp.id}`}>`. The whole row is not clickable (keep the rest of the row plain text — links inside `<tr>` are an a11y trap; a single link target on the title is enough).

Update the populated-state test to assert one of the rows links to the detail URL.

### Stage labels constant

Move `STAGE_LABEL` from `OpportunitiesList.tsx` to `opportunitiesHooks.ts` (named export) so the detail screen can iterate over the same source. Same applies to a new `STAGES: readonly OpportunityStage[]` ordered list. The list view re-imports both. No behaviour change.

## Tests

`frontend/src/screens/OpportunityDetail.test.tsx` — six Vitest cases:

1. Loading state renders.
2. 404 renders the "Not found" branch with a back link.
3. Generic error renders the "Could not load" branch with retry.
4. Populated state pre-fills inputs from the API payload.
5. Save submits the typed values and navigates back to the list (mutation invoked with the patched fields).
6. Archive flow: click → confirm → mutation invoked → navigate back.

`frontend/src/screens/OpportunitiesList.test.tsx`: extend the populated-state test to assert one of the row title cells contains a link to `/dashboard/opportunities/<row-id>`.

No backend changes (the API supports list/retrieve/patch/delete already from PR #18).

## Frontend file deltas

- `frontend/src/lib/opportunitiesHooks.ts` (modify — STAGES + STAGE_LABEL exported, three new hooks, one new payload type)
- `frontend/src/screens/OpportunityDetail.tsx` (new)
- `frontend/src/screens/OpportunityDetail.test.tsx` (new)
- `frontend/src/screens/OpportunitiesList.tsx` (modify — import STAGE_LABEL, wrap title cell in `<Link>`)
- `frontend/src/screens/OpportunitiesList.test.tsx` (modify — assert title link)
- `frontend/src/router.tsx` (modify — register `opportunities/:opportunityId`)
- `frontend/src/testIds.ts` (modify — append 12 ids)
- `e2e/support/selectors.ts` (modify — mirror)

## Risk & rollback

Pure frontend addition. No backend, no migration. The detail route is auth-gated by the existing `<AuthGuard>` on `/dashboard`. Revert the merge to remove the route + the title-cell link; the list and create flows keep working.

## Open questions

- Stage transition rules eventually move to the backend service layer (PR after this), at which point the UI will need to render disabled stages. For this PR every value is selectable.
- "Are you sure" copy on archive is intentionally cheap — a real modal with focus trap is overkill before the dashboard has more dangerous actions to share it with.
