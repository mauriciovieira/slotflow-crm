# Interview Cycle — Full Slice (BE + FE + e2e)

**Date:** 2026-04-25
**Status:** Approved
**Scope:** Second full-stack PR. Mirror the resume slice for `InterviewCycle` + `InterviewStep`.

## Goal

Replace the `/dashboard/interviews` stub with end-to-end product surface: list cycles in caller's workspace, create a cycle pinned to an opportunity, open one, append steps, advance step status. Audit each mutation.

## Non-goals

- Per-step transcript ingestion (Track 06).
- Calendar integration / reminders.
- Interviewer directory beyond the freeform `interviewer` charfield.
- `/api/interview-cycles/<id>/close/` lifecycle endpoint — `closed_at` mutation not required for this slice.
- Linking cycles to resume versions (separate later PR).

## Architecture

### Backend (`backend/interviews/`)

Workspace authorisation flows through `InterviewCycle.opportunity.workspace` (and `InterviewStep.cycle.opportunity.workspace`). Existing `tenancy.permissions.get_membership` is the gate.

**Service layer (`services.py`)** — all `@transaction.atomic`, all emit audit events:

- `start_interview_cycle(*, actor, opportunity, name, notes="") -> InterviewCycle`. Membership + write-role check on `opportunity.workspace`. Stamps `started_at = now()`. Audit `interview_cycle.created` with `{name, opportunity_id}`.
- `add_interview_step(*, actor, cycle, kind, scheduled_for=None, duration_minutes=None, interviewer="", notes="") -> InterviewStep`. Locks the cycle row, computes next `sequence = max + 1` inside the lock, defaults `status = SCHEDULED`. Audit `interview_step.added` with `{cycle_id, sequence, kind}`.
- `update_step_status(*, actor, step, status, notes=None) -> InterviewStep`. Locks the step row, validates target status is in `InterviewStepStatus`, writes the change. Audit `interview_step.updated` with `{cycle_id, sequence, old_status, new_status}`.

**Permissions:** `IsCycleWorkspaceMember` clone — resolves `obj.opportunity.workspace` (or `obj.cycle.opportunity.workspace` for steps). Same write-role gate.

**Serializers:**

- `InterviewCycleSerializer` — read shape: `id, opportunity, name, started_at, closed_at, notes, steps_count, last_step_status, created_at, updated_at`. `steps_count` and `last_step_status` are annotated (`Count` and `Subquery` of newest-step status) on the viewset queryset to keep list flat.
- `InterviewStepSerializer` — read shape: `id, cycle, sequence, kind, status, scheduled_for, duration_minutes, interviewer, notes, created_at, updated_at`. `cycle, sequence, status` read-only at this serializer; status changes go through `update_step_status`.
- `InterviewStepCreateSerializer` — accepts `kind, scheduled_for?, duration_minutes?, interviewer?, notes?`.
- `InterviewStepStatusSerializer` — accepts `status` (one of `InterviewStepStatus`) and optional `notes`.

**Views (`views.py`):**

- `InterviewCycleViewSet(ModelViewSet)` at `/api/interview-cycles/`:
  - GET (list scoped to caller's memberships via `opportunity__workspace__memberships__user`),
  - POST (create — body `opportunity, name, notes?`; service validates membership),
  - GET / PATCH / DELETE on `<uuid>`. DELETE not implemented this slice (scope creep).
  - Filters: `?opportunity=<uuid>`, `?workspace=<uuid>`.
- `InterviewStepViewSet(GenericViewSet, mixins.List/Create/Retrieve)` at `/api/interview-cycles/<cycle_id>/steps/`:
  - GET list, POST create (uses `InterviewStepCreateSerializer`).
  - Custom `@action(detail=True, methods=["patch"], url_path="status")` — body `{status, notes?}` invokes `update_step_status`.

URLs registered under `backend/interviews/urls.py` and wired in `backend/config/urls.py` at `/api/interview-cycles/`.

**Audit:** wires inside `services.py`, mirror of the resume slice.

**Tests** (per-app per-category):
- `tests/services/cycle_test.py`: start_interview_cycle / add_interview_step / update_step_status — happy path, non-member, viewer, idempotent / concurrent step append uses `select_for_update`, audit assertions.
- `tests/api/cycle_test.py`: anon 401/403; list scoped + filters; create 201; cross-workspace create 403/400; PATCH cycle name; step list + create; step status PATCH happy path + invalid value 400 + viewer 403; query-count guard for the list.

### Frontend (`frontend/src/`)

**Hooks (`lib/interviewsHooks.ts`):**

- `useInterviewCycles()`, `useInterviewCycle(id)`.
- `useInterviewSteps(cycleId)`.
- `useStartInterviewCycle()`, `useAddInterviewStep(cycleId)`, `useUpdateStepStatus(cycleId, stepId)`.
- Cache invalidations follow the resume pattern: step mutations invalidate steps + cycle detail + cycle list (since list embeds `last_step_status`).

**Screens:**

- `screens/InterviewsList.tsx` — workspace's cycles (loading/error/empty/populated). Each row shows opportunity title/company, cycle name, step count, last status pill. CTA "New cycle" → `/dashboard/interviews/new`.
- `screens/InterviewCycleCreate.tsx` — opportunity picker (uses `useOpportunities()`), name field, optional notes. On success → cycle detail.
- `screens/InterviewCycleDetail.tsx` — header (cycle name + opportunity), step list (sequence, kind, status pill, scheduled_for), inline "New step" form (kind dropdown + optional fields), per-step status dropdown that calls `update_step_status` on change.

**Routing:** swap `interviews` slug from `<StubPanel />` to `<InterviewsList />`; add `interviews/new` and `interviews/:cycleId`.

**TestIds:** mirror resume-slice naming. Mirror to `e2e/support/selectors.ts`.

**Frontend tests (Vitest):** list states, detail states, cycle create + redirect, step add + version count, status change PATCH.

### E2E (`e2e/tests/interviews.spec.ts`)

One spec, signed-in as the seeded e2e user:

1. Reset → login → land on dashboard.
2. Seeded e2e user already has at least one workspace; create one opportunity via API (or the UI — keep it API-side via `request.post` to keep the spec focused) so an opportunity exists for the cycle to attach to.
3. Click Interviews nav → empty state.
4. Click "New cycle" → pick the opportunity → fill name → submit.
5. Detail loads with no steps.
6. Click "New step" → pick `phone` kind → submit.
7. One step row shown, status pill = `Scheduled`.
8. Change status select to `Completed` → row updates.

## Test plan

- Backend pytest gains ~22 cases. 217 → ~239.
- Frontend vitest gains ~10 cases. 104 → ~114.
- E2E gains 1 spec.

## Risk & rollback

- No schema changes — `InterviewCycle` and `InterviewStep` already exist.
- New URL surface `/api/interview-cycles/...` gated by `IsAuthenticated` + workspace membership.
- Frontend swaps a stub slug; reversion is one revert.

## Out of scope reminders

- No `archived_at` on cycles for this slice.
- No transcript ingestion / scoring / Calendly hookup.
- No resume↔step linking — comes after.
