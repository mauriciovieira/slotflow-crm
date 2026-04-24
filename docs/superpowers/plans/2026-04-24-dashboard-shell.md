# Dashboard Shell — Implementation Plan

**Date:** 2026-04-24
**Spec:** `docs/superpowers/specs/2026-04-24-dashboard-shell-design.md`
**Branch:** `feat/dashboard-shell`
**Worktree:** `.worktrees/feat-dashboard-shell`
**Base:** `main` at merge of PR #14

## Execution model

Single-session, TDD where practical. Everything is frontend (`frontend/src/`), under Vitest. No subagent fan-out — each task depends on the previous, and the surface is small. Commits are one-per-task, Conventional Commits.

After every task: `make -C frontend lint` and `make -C frontend test` must pass before moving on.

---

## Task 1 — Nav registry + test IDs

**Files:**
- `frontend/src/dashboardNav.ts` (new) — exports `DASHBOARD_NAV` const array and `DashboardNavSlug` type.
- `frontend/src/testIds.ts` (modify) — append `DASHBOARD_SIDEBAR`, `DASHBOARD_HEADER`, `NAV_OPPORTUNITIES`, `NAV_RESUMES`, `NAV_INTERVIEWS`, `NAV_SETTINGS`, `STUB_PANEL_TITLE`. Keep the existing keys (`SIGNED_IN_HEADER`, `SIGN_OUT_BUTTON`, etc.) — the dashboard header reuses them.

**Why first:** everything downstream imports from these two files. Starting here lets every later test and component pin to stable identifiers from commit one.

**Tests:** none at this task — these files are data. Their correctness is exercised by later tests.

**Acceptance:**
- `npx tsc --noEmit -p frontend/tsconfig.app.json` clean.
- Vitest still green (nothing should have changed semantically).

**Commit:** `feat(frontend): add dashboard nav registry and test IDs`

---

## Task 2 — `StubPanel` component + test

**Files:**
- `frontend/src/components/StubPanel.tsx` (new) — takes `title: string`, renders an `<h1 data-testid={TestIds.STUB_PANEL_TITLE}>` plus a mono "COMING SOON" label and one-sentence paragraph. Tailwind only, DESIGN.md tokens.
- `frontend/src/components/StubPanel.test.tsx` (new) — renders `<StubPanel title="Opportunities" />`, asserts the title text is visible through `getByTestId(STUB_PANEL_TITLE)`.

**Why second:** zero-dependency leaf. Lets the router wire stubs before the layout exists.

**TDD:** write the test first (failing — component doesn't exist), then the component.

**Acceptance:** 1 new passing test; 50/50 total (previous 49 + 1).

**Commit:** `feat(frontend): add StubPanel placeholder component`

---

## Task 3 — `DashboardSidebar` + test

**Files:**
- `frontend/src/components/DashboardSidebar.tsx` (new) — imports `DASHBOARD_NAV`, maps over it, renders `<NavLink to={`/dashboard/${slug}`}>` for each. Wraps everything in `<aside data-testid={TestIds.DASHBOARD_SIDEBAR}>`. Each link carries its corresponding nav test ID (`NAV_OPPORTUNITIES`, etc.). Active link gets `bg-brand-light text-ink` + a 3 px left border; inactive `text-ink-secondary hover:text-ink`. Slotflow lockup at the top.
- `frontend/src/components/DashboardSidebar.test.tsx` (new) — three tests:
  1. Renders four items in the order from `DASHBOARD_NAV`.
  2. When mounted at `/dashboard/resumes` inside a memory router, only the Resumes link has the active class.
  3. Links point at `/dashboard/<slug>` (assert `href` via `getByTestId(NAV_X).getAttribute("href")`).

**TDD:** tests first, component after.

**Acceptance:** 3 new passing tests; 53/53 total.

**Commit:** `feat(frontend): add DashboardSidebar with nav registry driver`

---

## Task 4 — `DashboardHeader` + test

**Files:**
- `frontend/src/components/DashboardHeader.tsx` (new) — props: `title: string`. Uses `useMe()` for username, `useLogout()` for sign-out. Renders `<header data-testid={TestIds.DASHBOARD_HEADER}>` with left-side title and right-side cluster containing the username span (reuses existing `SIGNED_IN_HEADER` test id) and the Sign out button (reuses `SIGN_OUT_BUTTON`).
- `frontend/src/components/DashboardHeader.test.tsx` (new) — three tests:
  1. Renders title prop.
  2. Renders username from `useMe` (seeded via the same `setMe` helper pattern used by `AuthGuard.test.tsx`).
  3. Clicking Sign out calls `useLogout().mutate` (spy).

**TDD:** tests first.

**Acceptance:** 3 new passing tests; 56/56 total.

**Commit:** `feat(frontend): add DashboardHeader with sign-out reuse`

---

## Task 5 — `DashboardLayout` + test

**Files:**
- `frontend/src/components/DashboardLayout.tsx` (new) — flex row. Renders `<DashboardSidebar />` and a `<div className="flex-1 flex flex-col">` containing `<DashboardHeader title={…} />` and `<Outlet />`. Title derivation: look up the current child route path (via `useMatches()` or by matching the final URL segment against `DASHBOARD_NAV` to find the label) so the header title stays in sync with the sidebar without a second registry. One helper in this file — keep it local.
- `frontend/src/components/DashboardLayout.test.tsx` (new) — two tests:
  1. Mounted at `/dashboard/opportunities`, the header shows "Opportunities".
  2. Sidebar + header + outlet all render (probe via test ids + a cheap stub `<Outlet />` child).

**TDD:** tests first.

**Acceptance:** 2 new passing tests; 58/58 total.

**Commit:** `feat(frontend): add DashboardLayout composing sidebar + header + outlet`

---

## Task 6 — Router wiring + index redirect + AuthGuard integration

**Files:**
- `frontend/src/router.tsx` (modify) — add a `/dashboard` branch. Top-level AuthGuard (requireVerified=true) wraps `<DashboardLayout />`; children are generated from `DASHBOARD_NAV` so adding a nav slug in task 1 stays single-source. Index child = `<Navigate to="opportunities" replace />`. Each slug child element = `<StubPanel title={label} />`.
- No new test file — existing `AuthGuard.test.tsx` already covers gating semantics, and `DashboardLayout.test.tsx` covers the composed behaviour. Add one **router integration test** in a new `frontend/src/router.test.tsx` that boots `<RouterProvider router={…}>` with `setMe({…verified…})` and:
  1. Visits `/dashboard` and expects URL to resolve to `/dashboard/opportunities`.
  2. Visits `/dashboard/resumes` and expects the Resumes stub title in the DOM.

**Acceptance:** 2 new passing tests; 60/60 total.

**Commit:** `feat(frontend): mount /dashboard route with nested stub children`

---

## Task 7 — Redirect Login post-auth to `/dashboard`

**Files:**
- `frontend/src/screens/Login.tsx` (modify) — the three `navigate("/", …)` calls (in `useEffect` and `handleSubmit`) change to `navigate("/dashboard", …)`.
- `frontend/src/screens/Login.test.tsx` (modify) — update the existing "redirects verified user home" case to assert `/dashboard`. Any string-literal `"/"` checks get bumped to `"/dashboard"`.

**Acceptance:** Login.test.tsx still green with the new expectations; 60/60 unchanged.

**Commit:** `feat(frontend): point Login post-auth redirect at /dashboard`

---

## Task 8 — Final verification + PR

1. `make -C frontend lint && make -C frontend test` — both green.
2. `make -C backend test` — still green (sanity; nothing backend-side changed).
3. Dev sanity: `SLOTFLOW_BYPASS_2FA=1 make dev`, hit `http://localhost:5173/login`, sign in as `e2e/e2e-local-only`, land on `/dashboard/opportunities`, click each nav item, verify URL + title update, click Sign out, land on `/login`. Document the walk in the PR body.
4. Push branch, open PR against `main`, fill `.github/WORKFLOW_TEMPLATES/pull_request.md`, Conventional Commits title: `feat(frontend): dashboard shell with stub nav panels`.
5. Halt for Copilot review. Address any comments per the PR #13/#14 pattern.

**Commit:** none — shipping, not code.

---

## Out of plan (explicit)

- Icons in the sidebar.
- Mobile nav drawer.
- Per-slug E2E Playwright specs (next PR, once a real screen lives behind one slug).
- Any backend change.
- Dark mode — the theme system supports it but DESIGN.md light tokens are the baseline for this PR.
