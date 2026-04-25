# Opportunity ↔ Resume Link — Full Slice (BE + FE + e2e)

**Date:** 2026-04-25
**Status:** Approved
**Scope:** Third full-stack PR. Add a join model that records which resume versions were submitted (or used internally) for each opportunity.

## Goal

When a user is preparing for an opportunity, attach the resume version they sent (or referenced internally) so the opportunity page tells the full story: who, where, what version of the CV. Audited; reversible.

## Non-goals

- Cover-letter linking — separate model later.
- Linking to interview cycles directly — comes after this lands.
- Changing the resume model itself.
- Bulk-link UI / multi-select.

## Architecture

### Backend (`backend/opportunities/`)

The join model lives with `Opportunity` rather than `resumes/` because every query is opportunity-driven and the API path is opportunity-scoped (`?opportunity=<uuid>`).

**Model (`opportunities/models.py`):**

```python
class OpportunityResumeRole(models.TextChoices):
    SUBMITTED = "submitted", "Submitted"
    USED_INTERNALLY = "used_internally", "Used internally"


class OpportunityResume(TimeStampedModel):
    id = UUIDField(primary, default=uuid.uuid4)
    opportunity = ForeignKey(Opportunity, on_delete=CASCADE, related_name="resume_links")
    resume_version = ForeignKey("resumes.ResumeVersion", on_delete=PROTECT, related_name="opportunity_links")
    role = CharField(choices=OpportunityResumeRole.choices, max_length=32)
    note = TextField(blank=True, default="")
    created_by = ForeignKey(AUTH_USER_MODEL, on_delete=SET_NULL, null=True)

    class Meta:
        ordering = ("-created_at",)
        constraints = [
            UniqueConstraint(fields=("opportunity", "resume_version", "role"),
                             name="uniq_opp_resume_role"),
        ]
```

`PROTECT` on `resume_version` so the audit trail isn't silently mutated when a resume version is deleted (versions are append-only anyway).

Migration `opportunities/migrations/0003_opportunityresume.py`.

**Service layer (`opportunities/services.py`):**

- `link_resume_to_opportunity(*, actor, opportunity, resume_version, role, note="") -> OpportunityResume`. Membership + write-role check on `opportunity.workspace`. Validates `resume_version.base_resume.workspace_id == opportunity.workspace_id` (cross-workspace links forbidden). Audit `opportunity_resume.linked` with `{opportunity_id, resume_version_id, base_resume_id, role}`.
- `unlink_resume(*, actor, link) -> OpportunityResume`. Membership + write-role check. Hard-delete the join row (the audit row is the durable trail). Audit `opportunity_resume.unlinked` with the same metadata frozen at the time of delete.

Admin: read-write with `created_by`/`created_at`/`updated_at` read-only on change.

**Serializers:**

- `OpportunityResumeSerializer` — read shape: `id, opportunity, resume_version, resume_version_summary { id, version_number, base_resume_id, base_resume_name }, role, note, created_by, created_at, updated_at`. The `resume_version_summary` lets the FE render a human label without a second query.
- `OpportunityResumeCreateSerializer` — accepts `opportunity` (UUID), `resume_version` (UUID), `role`, `note?`.

**Views (`opportunities/views.py`):**

- `OpportunityResumeViewSet(GenericViewSet, mixins.List/Create/Retrieve/Destroy)` at `/api/opportunity-resumes/`:
  - List scoped to caller's memberships, filterable by `?opportunity=<uuid>`.
  - Create — validates membership + same-workspace via service.
  - Destroy — calls `unlink_resume`.
- Permissions: `IsWorkspaceMember` (resolves via `obj.opportunity.workspace`).

URLs: extend `backend/opportunities/urls.py` with a new router register, mounted from a new path entry in `config/urls.py`: `path("api/opportunity-resumes/", include("opportunities.opportunity_resume_urls"))`. (Keep separate from existing opportunities CRUD.)

**Audit:** wires sit in `services.py`. `opportunity_resume.linked` and `opportunity_resume.unlinked`. Metadata identical so the trail correlates link/unlink pairs.

**Tests** (per-app per-category):
- `tests/models/opportunity_resume_test.py`: model defaults, `__str__`, unique constraint.
- `tests/services/opportunity_resume_test.py`: link / unlink happy paths; non-member; viewer; cross-workspace rejection; audit assertions; PROTECT prevents resume version delete with active link.
- `tests/api/opportunity_resume_test.py`: anon 401/403; list + filter; create 201; cross-workspace 400/403; viewer 403; delete 204; query-count guard.

### Frontend (`frontend/src/`)

**Hook (`lib/opportunityResumesHooks.ts`):**

- `useOpportunityResumes(opportunityId)` — `GET /api/opportunity-resumes/?opportunity=<id>`.
- `useLinkResumeToOpportunity()` — POST.
- `useUnlinkOpportunityResume(linkId)` — DELETE.

Cache: link/unlink invalidates the opportunity-resumes list AND the opportunity detail (in case we surface counts there later).

**Screen update (`screens/OpportunityDetail.tsx`):**

Add a "Linked resume versions" section under the existing form/archive blocks:

- List: each row shows base resume name + `vN` + role pill + note + `Unlink` button.
- Empty state: copy + inline "Link a resume" CTA.
- Link form (toggle):
  - Resume picker (dropdown sourced from `useResumes()`).
  - Version picker — repopulates when resume changes; sourced from `useResumeVersions(selectedResumeId)`.
  - Role picker (`Submitted` / `Used internally`).
  - Optional note.
- Unlink action: inline confirm.

**TestIds:** mirror prior section naming. Mirror to `e2e/support/selectors.ts`.

**Frontend tests (Vitest):** list states for the new section, link form happy path, unlink flow, role pill rendering.

### E2E (`e2e/tests/opportunity_resumes.spec.ts`)

Signed-in as the seeded e2e user:

1. Reset → login.
2. Create an opportunity (UI flow, like the interview cycle e2e).
3. Create a resume + first version (UI flow).
4. Open the opportunity detail.
5. Click "Link a resume" → pick the resume → pick `v1` → role `Submitted` → submit.
6. The links list shows one row referencing the resume name + `v1`.
7. Click "Unlink" → confirm.
8. The links list returns to the empty state.

## Test plan

- Backend pytest gains ~18 cases (~6 service, ~10 API, ~2 model). 257 → ~275.
- Frontend vitest gains ~8 cases. 123 → ~131.
- E2E gains 1 spec.

## Risk & rollback

- One additive table (`opportunities_opportunityresume`). No FK changes elsewhere.
- New URL surface gated by `IsAuthenticated` + workspace membership.
- Frontend section added to existing screen; if reverted, OpportunityDetail just loses the new section.
- `PROTECT` on `resume_version` could surprise resume deletion paths — mitigated by resume archive being soft-delete already.

## Out of scope reminders

- No cover letter linking.
- No interview-step ↔ resume linking.
- No FE picker keyboard-shortcut polish.
