# Opportunities List View — Design

**Date:** 2026-04-25
**Status:** Approved
**Scope:** PR H — wire `/dashboard/opportunities` to the real `/api/opportunities/` endpoint shipped in PR #18. Read-only list. No create/edit form (PR I covers create, PR J retrieves/edits).

## Goal

Replace the "Coming soon" stub at `/dashboard/opportunities` with a real list rendered from the API. Establish the data layer (TanStack Query hook, typed payload, error/empty/loading states) every later domain screen will copy.

## Non-goals

- Create / edit / archive UI — PR I + PR J.
- Filters or search controls (the API already supports `?stage=`, `?workspace=`, `?q=` — the UI just renders rows for now).
- Sorting controls — the API's default `-created_at` is the only order this PR honors.
- Pagination — the API returns the full list. The dashboard will start paging when row counts force it.
- Routing for individual opportunity detail — out of scope; PR J ships the detail route.
- E2E coverage — skipped per the current operational policy. Vitest unit tests are the gate.

## Architecture

### Data layer

`frontend/src/lib/opportunitiesHooks.ts` (new):

```ts
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "./api";

export interface Opportunity {
  id: string;
  workspace: string;
  title: string;
  company: string;
  stage: "applied" | "screening" | "interview" | "offer" | "rejected" | "withdrawn";
  notes: string;
  created_by: { id: number; username: string } | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export const OPPORTUNITIES_KEY = ["opportunities", "list"] as const;

export function useOpportunities() {
  return useQuery({
    queryKey: OPPORTUNITIES_KEY,
    queryFn: () => apiFetch<Opportunity[]>("/api/opportunities/"),
  });
}
```

The shape mirrors the DRF serializer in PR #18 verbatim. `apiFetch` already handles credentials, CSRF, and `ApiError` mapping.

### Screen

`frontend/src/screens/OpportunitiesList.tsx` (new):

- States: `loading` (spinner / placeholder text), `error` (message + retry button), `empty` (CTA-ish "No opportunities yet" copy), `populated` (rows).
- Layout: simple table for now — columns Title, Company, Stage, Created. Mint-tinted "stage" pill per DESIGN.md §10.
- Stage pill colors: APPLIED → mint-light; SCREENING → blue-light; INTERVIEW → mint; OFFER → mint-deep; REJECTED → red; WITHDRAWN → gray.
- Test IDs: extend `frontend/src/testIds.ts` with `OPPORTUNITIES_LIST` (the table root), `OPPORTUNITIES_EMPTY` (empty-state region), `OPPORTUNITIES_ERROR` (error region), `OPPORTUNITIES_ROW` (each row carries this with the row id appended via `data-testid={`${OPPORTUNITIES_ROW}-${id}`}`).

### Router

`frontend/src/router.tsx`: in the existing `DASHBOARD_NAV.map`, swap the entry where `slug === "opportunities"` to render `<OpportunitiesList />` instead of the shared `<StubPanel />`. Other slugs (resumes, interviews, settings) keep `<StubPanel />` until their PRs land.

### Test IDs registry

Append to `frontend/src/testIds.ts` and mirror into `e2e/support/selectors.ts` (drift-prevention pattern from PR #13).

## Tests

`frontend/src/screens/OpportunitiesList.test.tsx` — five cases via `renderWithProviders` + a mocked `useOpportunities`:

1. Loading state renders.
2. Error state renders with retry-able copy.
3. Empty state renders (`OPPORTUNITIES_EMPTY`).
4. Populated state renders one row per opportunity, with title/company/stage visible.
5. Stage pill applies the right class for INTERVIEW (spot-check, not a matrix — overkill).

No new backend tests (no backend change). No e2e in this PR.

## Frontend file deltas

- `frontend/src/lib/opportunitiesHooks.ts` (new)
- `frontend/src/screens/OpportunitiesList.tsx` (new)
- `frontend/src/screens/OpportunitiesList.test.tsx` (new)
- `frontend/src/testIds.ts` (modify — add 4 ids)
- `frontend/src/router.tsx` (modify — swap stub for OpportunitiesList on `opportunities` slug)
- `e2e/support/selectors.ts` (modify — mirror new ids)

No CSS file additions; Tailwind tokens already cover the palette.

## Risk & rollback

Pure frontend addition. No backend or migration. The route already exists — this PR only changes what the `<Outlet />` renders for one slug. Revert the merge to fall back to the stub.

## Open questions

None for this PR. Pagination, search controls, and stage filters wait for the create flow to land in PR I so the table has reason to grow.
