# Opportunity Create Form — Design

**Date:** 2026-04-25
**Status:** Approved
**Scope:** PR I — surface a "New opportunity" form on the dashboard so the list view (PR #20) has reason to grow. Read+write, no detail/edit. Single-page modal-less flow: button on the list, dedicated route, redirect back on success.

## Goal

Let a signed-in user create an Opportunity through the UI. Wire the existing `useMutation` pattern from auth + the `apiFetch` POST handler so every later domain create form (resume, interview) copies a working template.

## Non-goals

- Detail page, edit, archive UI — PR J + later.
- Workspace selector. The seeded `e2e` user has exactly one workspace; `OpportunityViewSet._resolve_active_workspace` falls back to that membership when the body omits `workspace`. The form does not send `workspace`.
- Stage selection. Default is APPLIED; stage transitions land with edit (PR J).
- Notes-rich-text. Plain `<textarea>`.
- Optimistic UI / cache mutations beyond invalidation.
- Multi-step form, validation framework. Native `required` + a single client-side check is enough.

## Architecture

### Routing

`frontend/src/router.tsx` adds one nested child under `/dashboard`:

```
{ path: "opportunities/new", element: <OpportunityCreate /> },
```

Lives next to the existing `opportunities` slug. The "New" CTA on `OpportunitiesList` links here. After successful POST the form `navigate("/dashboard/opportunities", { replace: true })`.

The `DASHBOARD_NAV` registry stays at four items — the create page does not get its own sidebar entry; it's reached from the list.

### Hook

`frontend/src/lib/opportunitiesHooks.ts` (modify) adds:

```ts
export interface OpportunityCreatePayload {
  title: string;
  company: string;
  notes?: string;
}

export function useCreateOpportunity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: OpportunityCreatePayload) =>
      apiFetch<Opportunity>("/api/opportunities/", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: OPPORTUNITIES_KEY }),
  });
}
```

`apiFetch` already handles the CSRF token and credentials; the body fields match what `OpportunitySerializer` accepts (workspace stays optional → backend resolves the active membership).

### Screen

`frontend/src/screens/OpportunityCreate.tsx` (new):

- Layout: dashboard chrome already wraps via the `DashboardLayout` outlet. The screen renders a card with title input, company input, notes textarea, Submit + Cancel buttons.
- Submit: calls `useCreateOpportunity().mutateAsync(...)`. On success → navigate to list. On error → set inline error (reuses the `submitError` pattern from `Login.tsx`).
- Cancel: `navigate("/dashboard/opportunities")`.
- Test IDs: `OPPORTUNITY_CREATE_FORM`, `OPPORTUNITY_CREATE_TITLE`, `OPPORTUNITY_CREATE_COMPANY`, `OPPORTUNITY_CREATE_NOTES`, `OPPORTUNITY_CREATE_SUBMIT`, `OPPORTUNITY_CREATE_CANCEL`, `OPPORTUNITY_CREATE_ERROR`.

### List view CTA

`frontend/src/screens/OpportunitiesList.tsx` gains a top toolbar with a "New opportunity" button. Test id `OPPORTUNITIES_NEW_BUTTON`. Same button in both empty and populated states (different placement: centered in empty, right-aligned in populated).

The empty-state copy updates to mention the button explicitly.

### Selectors mirror

`frontend/src/testIds.ts` and `e2e/support/selectors.ts` add the eight new keys.

## Tests

`frontend/src/screens/OpportunityCreate.test.tsx` — five Vitest cases via mocked `useCreateOpportunity`:

1. Renders both inputs + submit button.
2. Submit blocked when fields empty (native validation; assert `mutateAsync` not called).
3. Happy-path submit calls the mutation with `{title, company, notes}` and navigates to the list on resolve.
4. Error from the mutation surfaces inside `OPPORTUNITY_CREATE_ERROR`.
5. Cancel button navigates to `/dashboard/opportunities` without calling the mutation.

`frontend/src/screens/OpportunitiesList.test.tsx` — extend with one case asserting the "New opportunity" button is rendered in both empty and populated states with the correct `href` to `/dashboard/opportunities/new`.

`frontend/src/lib/opportunitiesHooks.test.ts` (new) — one test for `useCreateOpportunity` hitting `apiFetch` with the expected body and method, plus invalidating the list cache on success. Skip if it duplicates the screen tests too closely; keep coverage tight.

No backend changes, no e2e in this PR.

## Frontend file deltas

- `frontend/src/lib/opportunitiesHooks.ts` (modify — add type + hook)
- `frontend/src/screens/OpportunityCreate.tsx` (new)
- `frontend/src/screens/OpportunityCreate.test.tsx` (new)
- `frontend/src/screens/OpportunitiesList.tsx` (modify — toolbar + empty CTA)
- `frontend/src/screens/OpportunitiesList.test.tsx` (modify — assert toolbar button)
- `frontend/src/router.tsx` (modify — add `opportunities/new` child)
- `frontend/src/testIds.ts` (modify — append 8 ids)
- `e2e/support/selectors.ts` (modify — mirror)

## Risk & rollback

Pure frontend. No backend touched. No new dependencies. Revert the merge to remove the `/dashboard/opportunities/new` route and the toolbar button.

The form sends `{title, company, notes}` only; the backend's serializer treats `workspace` as optional and resolves it via membership. This keeps the UI workspace-agnostic until a real workspace switcher lands.

## Open questions

None. Stage selector, validation framework, and a workspace switcher all wait for actual user demand.
