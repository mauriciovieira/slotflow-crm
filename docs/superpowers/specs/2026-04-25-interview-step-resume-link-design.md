# Interview Step ↔ Resume Link — Full Slice (BE + FE + e2e)

**Date:** 2026-04-25
**Status:** Approved
**Scope:** Fourth full-stack PR. Add a join model recording which resume versions are referenced for each interview step (e.g. "this is the version the candidate is talking from in this loop").

## Goal

Tie a resume version to an individual interview step so the cycle detail tells the full story: who interviewed when, on what step, looking at which CV. Audited; reversible.

## Non-goals

- Linking interview cycles directly to resumes — keep it step-grained for now.
- Per-link role beyond a free-form `note` (Opportunity↔Resume's `role` is meaningful because it distinguishes "submitted" from "internal"; for a step the link is always "the version we discussed").
- Bulk linking across steps.
- Cover-letter linking.

## Architecture

### Backend (`backend/interviews/`)

The join model lives with `InterviewStep` rather than `resumes/` because every query is step-driven and the API path is step-scoped (`?step=<uuid>`).

**Model (`interviews/models.py`):**

```python
class InterviewStepResume(TimeStampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    step = models.ForeignKey(
        InterviewStep,
        on_delete=models.CASCADE,
        related_name="resume_links",
    )
    resume_version = models.ForeignKey(
        "resumes.ResumeVersion",
        on_delete=models.PROTECT,
        related_name="step_links",
    )
    note = models.TextField(blank=True, default="")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_interview_step_resume_links",
    )

    class Meta:
        ordering = ("-created_at",)
        constraints = [
            models.UniqueConstraint(
                fields=("step", "resume_version"),
                name="uniq_step_resume",
            ),
        ]
```

`PROTECT` on `resume_version` so the audit trail isn't silently mutated when a resume version is deleted.

Migration `interviews/migrations/0002_interviewstepresume.py`.

**Service layer (`interviews/services.py`):**

- `link_resume_to_step(*, actor, step, resume_version, note="") -> InterviewStepResume`. Membership + write-role check on `step.cycle.opportunity.workspace`. Validates `resume_version.base_resume.workspace_id == step.cycle.opportunity.workspace_id`. Audit `interview_step_resume.linked` with `{step_id, cycle_id, resume_version_id, base_resume_id}`.
- `unlink_step_resume(*, actor, link) -> InterviewStepResume`. Membership + write-role check. Hard-delete the row; metadata frozen *before* delete so the audit row keeps the FK ids. Audit `interview_step_resume.unlinked`.

Reuse the existing `WorkspaceMembershipRequired` / `WorkspaceWriteForbidden` and `_enforce_write_role` helper. Add `CrossWorkspaceLinkForbidden`.

Admin: registered with sensible list/filter/search and read-only audit fields on change.

**Serializers (`interviews/step_resume_serializers.py`):**

- `InterviewStepResumeSerializer` — read shape: `id, step, resume_version, resume_version_summary {id, version_number, base_resume_id, base_resume_name}, note, created_by, created_at, updated_at`. Backed by `select_related` on the viewset queryset.
- `InterviewStepResumeCreateSerializer` — accepts `step` (UUID), `resume_version` (UUID), `note?`.

**Views (`interviews/step_resume_views.py`):**

- `InterviewStepResumeViewSet(GenericViewSet, mixins.List/Create/Retrieve/Destroy)` at `/api/interview-step-resumes/`:
  - List filterable by `?step=<uuid>` (validated UUID).
  - Create — service handles membership/role/cross-workspace; view catches `IntegrityError` from the unique constraint and surfaces 400.
  - Destroy — calls `unlink_step_resume`.
- Permissions: `IsCycleWorkspaceMember` (existing class — already walks `obj.cycle...`; extend to recognise the `step` shape too).

URLs: new module `interviews/step_resume_urls.py` mounted from `config/urls.py` at `/api/interview-step-resumes/`.

**Tests** (per-app per-category):
- `tests/models/interview_step_resume_test.py`: defaults, unique constraint.
- `tests/services/step_resume_test.py`: link / unlink happy paths; non-member; viewer; cross-workspace; PROTECT; audit.
- `tests/api/step_resume_test.py`: anon 401/403; list scoped + filter; create 201 + duplicate 400 + cross-workspace 400 + viewer 403; query-count guard; delete 204/403/404.

### Frontend (`frontend/src/`)

**Hook (`lib/interviewStepResumesHooks.ts`):**

- `useInterviewStepResumes(stepId)` — `GET /api/interview-step-resumes/?step=<id>`.
- `useLinkResumeToStep(stepId)` — POST. Invalidates step-resumes list AND cycle-steps list (since the steps list could surface counts later).
- `useUnlinkStepResume(stepId, linkId)` — DELETE. Same invalidation.

**Component (`components/InterviewStepResumesSection.tsx`):**

Per-step inline section: list (loading/error/empty/populated) + togglable link form (resume picker → version picker → optional note) + per-row inline-confirm unlink with error UI. Mirrors `OpportunityResumesSection` but step-scoped, no role select.

**Screen update (`screens/InterviewCycleDetail.tsx`):**

Each step list item already shows the existing data (sequence, kind, interviewer, status select). Render `InterviewStepResumesSection` inline below the step row's metadata so the user can link/unlink right where the step lives. Visually subtle (small heading, tighter spacing) — the resume section is supporting context, not the primary content.

**TestIds:** mirror prior section naming. Mirror to `e2e/support/selectors.ts`.

**Frontend tests (Vitest):** list states for the new section, link form happy path, unlink flow, role-less form (only resume + version + note).

### E2E (`e2e/tests/interview_step_resumes.spec.ts`)

Signed-in seeded e2e user:

1. Reset → login.
2. Create an opportunity (UI).
3. Create a resume + first version (UI).
4. Create an interview cycle for the opportunity (UI).
5. Add one step to the cycle (UI).
6. From the cycle detail, click the step's "Link a resume" → pick the resume → pick `v1` → submit.
7. Step row shows one linked resume row referencing the resume name + `v1`.
8. Click "Unlink" → confirm.
9. Step row returns to empty state for the resume section.

## Test plan

- Backend pytest gains ~16 cases. 286 → ~302.
- Frontend vitest gains ~6 cases. 134 → ~140.
- E2E gains 1 spec.

## Risk & rollback

- One additive table (`interviews_interviewstepresume`). No FK changes elsewhere.
- New URL surface gated by `IsAuthenticated` + workspace membership.
- `InterviewCycleDetail` gains an inline section per step; reverting just removes the inline component.
- `PROTECT` on `resume_version` is consistent with `OpportunityResume`.

## Out of scope reminders

- No cycle-level resume linking.
- No interviewer ↔ resume linking.
- No bulk-link UI.
