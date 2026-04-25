# Dashboard Shell — Design

**Date:** 2026-04-24
**Status:** Approved
**Scope:** PR E — first signed-in product surface. Two-pane dashboard layout, sidebar navigation, stub panels for Opportunities / Resumes / Interviews / Settings. Frontend-only; no backend, no domain data.

## Goal

Give a signed-in user a real product surface instead of dropping them on the marketing Landing. Establish the layout, nav structure, and routing contract that later PRs (Opportunity CRUD, Resume editor, Interview feed) slot into without layout churn.

## Non-goals

- Real domain data. Opportunity, Resume, Interview models don't exist yet (Track 03). Stub panels only.
- Mobile nav drawer / responsive sidebar collapse. Desktop-first; ≥768 px viewport assumed. Mobile deferred to a later PR.
- User settings editor. Settings nav item exists but its stub panel just says "Coming soon."
- Next Action card, activity feed, or any data-driven widget. Needs real models.
- E2E coverage. Unit tests via Vitest are the gate. An e2e walk-through lands with the first domain PR so there is something to click.
- Mint atmospheric gradient on product surfaces — DESIGN.md §1 reserves that for marketing. Dashboard is flat.

## Architecture

### Routing

`frontend/src/router.tsx` gains one branch:

- `/dashboard` — AuthGuard (`requireVerified={true}`) → `DashboardLayout`. Nested children:
  - index → `<Navigate to="opportunities" replace />`
  - `opportunities` → `<StubPanel title="Opportunities" />`
  - `resumes` → `<StubPanel title="Resumes" />`
  - `interviews` → `<StubPanel title="Interviews" />`
  - `settings` → `<StubPanel title="Settings" />`

Each child renders inside `DashboardLayout` via React Router's `<Outlet />`. Marketing `/` stays untouched.

`Login.tsx` post-auth redirect targets `/dashboard` instead of `/`. `Landing.tsx` (the marketing route at `/`) is unchanged — signed-in users who navigate there still see the marketing hero; we do not add a redirect, so deep-links keep working.

### Component tree

```
<AuthGuard requireVerified>
  <DashboardLayout>
    <DashboardSidebar />           ← 240 px fixed, full-height
    <div className="flex-1">
      <DashboardHeader />          ← inside main pane, above outlet
      <Outlet />                   ← resolved child: StubPanel or real screen later
    </div>
  </DashboardLayout>
</AuthGuard>
```

Files:

- `frontend/src/components/DashboardLayout.tsx` — flex row shell. Composes sidebar + header + outlet. No data hooks.
- `frontend/src/components/DashboardSidebar.tsx` — renders the Slotflow lockup, nav items (Opportunities, Resumes, Interviews, Settings) via `<NavLink>`. Active state uses DESIGN.md mint tint for the row; inactive is `text-ink-secondary` with hover to `text-ink`. No icons in this PR (text-only — deferred).
- `frontend/src/components/DashboardHeader.tsx` — right-aligned cluster: `Signed in as <username>` + Sign out button (reuses `useLogout`). Title slot on the left is a plain prop so each stub can pass its own label.
- `frontend/src/components/StubPanel.tsx` — takes a `title` prop, renders an H1 + short paragraph. One component; the router passes different titles. Placeholder until real screens land.
- `frontend/src/dashboardNav.ts` — exported const array `[{ slug, label }]` used by the sidebar AND the router so adding a nav item touches one file.

Why four small components instead of one big `Dashboard.tsx`: each file has one responsibility and fits in context. Sidebar visuals evolve independently from header auth concerns; the layout is the only thing that knows about the outlet. Matches the pattern set by Login/Landing.

### Test IDs

Extend `frontend/src/testIds.ts` (existing shared registry used by unit tests and the e2e harness):

- `DASHBOARD_SIDEBAR`
- `DASHBOARD_HEADER`
- `SIGNED_IN_HEADER` — already exists; reuse. The header component wraps the username in an element carrying this id, so existing specs and the e2e harness keep passing after Login redirects to `/dashboard`.
- `SIGN_OUT_BUTTON` — already exists; reuse.
- `NAV_OPPORTUNITIES`, `NAV_RESUMES`, `NAV_INTERVIEWS`, `NAV_SETTINGS`
- `STUB_PANEL_TITLE`

### Styling

Tailwind only. DESIGN.md tokens, via the existing theme system in `frontend/src/design/`:

- Sidebar background: `bg-surface-card` (whisper-thin border-right using `border-border-subtle`).
- Active nav row: `bg-brand-light text-ink` with a 3 px left edge in `bg-brand`.
- Header: plain white, `border-b border-border-subtle`, 56 px tall.
- Stub panel: centered text, 80 px top padding, mono "COMING SOON" label in `text-ink-muted`.

No new CSS files. No animations in this PR.

### AuthGuard and the existing flow

`AuthGuard` already:

1. Sends anon to `/login`.
2. Sends authed-but-unverified to `/2fa/setup` or `/2fa/verify`.
3. Renders children when verified.

Dashboard uses it wholesale. The Login redirect change (to `/dashboard`) is the only auth-flow touch.

### Navigation data

`dashboardNav.ts`:

```ts
export const DASHBOARD_NAV = [
  { slug: "opportunities", label: "Opportunities" },
  { slug: "resumes",       label: "Resumes" },
  { slug: "interviews",    label: "Interviews" },
  { slug: "settings",      label: "Settings" },
] as const;

export type DashboardNavSlug = typeof DASHBOARD_NAV[number]["slug"];
```

Sidebar maps over the array. Router imports it and generates child routes with the same slugs so the two cannot drift.

## Testing strategy

Vitest, following the pattern established in PR #12 (`setMe` helper in AuthGuard.test.tsx, React Router memory router):

1. **AuthGuard on `/dashboard`** — anon → redirected to `/login`. Unverified-with-no-device → `/2fa/setup`. Unverified-with-device → `/2fa/verify`. Verified → renders layout.
2. **Index redirect** — `/dashboard` mounts `<Navigate to="opportunities" replace />`. Spec asserts URL lands on `/dashboard/opportunities`.
3. **Sidebar active state** — navigating to `/dashboard/resumes` applies the mint-tint class to the Resumes row and no others.
4. **Sidebar order + labels** — `DASHBOARD_NAV` drives the render; a snapshot-light test asserts the four labels in order.
5. **Header sign-out** — clicking the button invokes `useLogout` (mocked) and post-logout the user sees `/login`.
6. **Stub panel renders title** — `<StubPanel title="Opportunities" />` renders that string inside `STUB_PANEL_TITLE`.
7. **Login redirects to /dashboard** — existing Login.test.tsx updated: after mutateAsync resolves with `is_verified: true`, navigate is called with `"/"` → change to `"/dashboard"`. Update both the useEffect and handleSubmit cases.

~8 tests total. Acceptance: backend `make -C backend test` unchanged (nothing server-side touched), frontend vitest all green.

## Data flow

No backend calls inside this PR. `DashboardHeader` uses the existing `useMe()` hook to read `username` for display, and `useLogout()` for sign-out. Both already exist. No new query keys, no new mutations.

## Error handling

- `useMe()` already has an error path that makes `AuthGuard` send the user to `/login`. Dashboard inherits this — no extra handling.
- `useLogout()` mutation failure case is unchanged from the current Landing — we just reuse it.
- 404 on an unknown `/dashboard/<slug>`: React Router's default behaviour (blank). Matches the rest of the app; a real 404 screen is out of scope for this PR.

## Risk & rollback

- Pure frontend change. No migrations. No production code paths touched outside the Login post-auth redirect target.
- Login redirect from `/` to `/dashboard` is the only behaviour change visible in prod. If something goes wrong, revert the merge; Login falls back to the marketing Landing as before.
- Zero new dependencies.

## Open questions

None. Remaining design decisions (icons, mobile nav, settings editor, real data) are explicitly deferred.
