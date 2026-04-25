# Opportunity Model — Design

**Date:** 2026-04-24
**Status:** Approved
**Scope:** PR F — first real domain model under Track 03 (`track-03-domain-model-and-migrations`). Backend-only. Opportunity entity + migration + admin + model tests. **No DRF API in this PR** — follow-up PR G wires the `/api/opportunities/` ViewSet, permissions, serializers.

## Goal

Give every other domain track something to attach to. With `Workspace` + `Membership` (PR #6 era) already in place, Opportunity is the first real content-bearing entity. Landing it in isolation keeps blast radius small and lets the API PR focus on authz shape without churning the model.

## Non-goals

- DRF serializers, ViewSet, permissions, URL routing — PR G.
- Listing / filtering UX on the frontend — needs the API first.
- Resume attachments, interview records, status-change audit trails, Celery signals — later Track 03/05/06 PRs.
- Stage transition state machine enforcement. The field is a plain `CharField(choices=…)` in this PR; state-transition rules land when the API does.
- Soft-delete. `core.SoftDeleteModel` is a scaffold abstract; deletion semantics for Opportunity are deferred until we know how the API surface wants to expose them (filter-out vs. archive vs. hard-delete with audit).

## Architecture

### Model

`backend/opportunities/models.py`:

```py
from __future__ import annotations

import uuid

from django.conf import settings
from django.db import models

from core.models import TimeStampedModel


class OpportunityStage(models.TextChoices):
    APPLIED   = "applied",   "Applied"
    SCREENING = "screening", "Screening"
    INTERVIEW = "interview", "Interview"
    OFFER     = "offer",     "Offer"
    REJECTED  = "rejected",  "Rejected"
    WITHDRAWN = "withdrawn", "Withdrawn"


class Opportunity(TimeStampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(
        "tenancy.Workspace",
        on_delete=models.CASCADE,
        related_name="opportunities",
    )
    title = models.CharField(max_length=200)
    company = models.CharField(max_length=200)
    stage = models.CharField(
        max_length=16,
        choices=OpportunityStage.choices,
        default=OpportunityStage.APPLIED,
    )
    notes = models.TextField(blank=True, default="")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_opportunities",
    )

    class Meta:
        ordering = ("-created_at",)
        indexes = [models.Index(fields=("workspace", "stage"))]

    def __str__(self) -> str:
        return f"{self.title} @ {self.company}"
```

Design choices:

- **UUID pk** matches the rest of the codebase (Workspace, Membership). Keeps ids opaque for future public-facing URLs.
- **Workspace FK is required and cascades.** Every opportunity belongs to exactly one workspace. If a workspace is deleted, its opportunities go with it — matches the existing Membership cascade.
- **`created_by` is `SET_NULL` on user delete, not cascade.** Deleting the user who created an opportunity must not wipe the company's history. The opportunity is workspace-owned, not user-owned. `null=True` is required so admin deletes don't trip integrity errors.
- **Stage choices cover the happy path first.** Added `WITHDRAWN` to `REJECTED` to distinguish candidate-initiated closure from employer-initiated — useful immediately and cheap to add now.
- **No `description` field** this PR — `notes` covers the free-text use case. If we later need a structured description we add a field; YAGNI until there's a form asking for it.
- **Composite index on `(workspace, stage)`** — the list view will almost always be "show me all Opportunities in workspace X at stage Y." Adding the index at creation avoids a follow-up migration.
- **`ordering = ("-created_at",)`** matches the typical "newest first" dashboard expectation. Changing it later is a no-op (no index impact beyond the composite one we already have).

### Admin

`backend/opportunities/admin.py` — register the model so we can create rows from `/admin/` while the API is being built. Small registration: `list_display = ("title", "company", "workspace", "stage", "created_at")`, `list_filter = ("stage", "workspace")`, `search_fields = ("title", "company")`. Read-only `created_at`, `updated_at`.

### App wiring

`opportunities` is already in `INSTALLED_APPS` (`config/settings/base.py`). Nothing to add there. `apps.py` is the default; no custom `AppConfig` behaviour.

### Migration

Single migration `backend/opportunities/migrations/0001_initial.py`, generated via `python manage.py makemigrations opportunities`. It must:

- Create the `opportunities_opportunity` table.
- Add the composite index `(workspace_id, stage)`.
- Reference `tenancy.Workspace` and `identity.User` without circular-import pain (Django handles this via the string refs above).

The migration runs as part of the existing `make migrate` target; no Makefile changes.

## Testing strategy

`backend/opportunities/tests/models/opportunity_test.py` — pytest-django. No new fixtures: create workspace + user inline.

1. **Minimal create + round-trip.** `Opportunity.objects.create(workspace=w, title="Staff Eng", company="Acme")` succeeds. Defaults: stage == APPLIED, notes == "", created_by is None, created_at/updated_at are set.
2. **`__str__` formatting** — returns `"Staff Eng @ Acme"`.
3. **Stage choices enforced by model validation** — passing a value outside `OpportunityStage.choices` should fail `full_clean()`. (The DB accepts any 16-char string; enforcement lives at form/serializer level, and this test proves `full_clean` catches it.)
4. **Workspace cascade** — delete the workspace, the opportunity vanishes.
5. **User `SET_NULL`** — delete the user who created the opportunity, the opportunity remains with `created_by = None`.
6. **Ordering** — create two opportunities; `.all()[0]` is the more recent one (newest-first).

Six tests is enough for a PR of this size; everything else is field-config-obvious.

No new backend lint targets. `make -C backend test` and `make -C backend lint` are the gates. `backend/.coveragerc` and `pyproject.toml` already cover the new directory.

## Frontend

Zero changes. The `/dashboard/opportunities` stub panel keeps rendering the "Coming soon" placeholder until PR G lands the API.

## E2E

Zero changes. No new route exposed.

## Risk & rollback

- New app table only; no data migration, no schema change on existing tables.
- No public surface exposed (no API). Admin-only consumers.
- Rollback: revert the merge and `python manage.py migrate opportunities zero` (not required for prod until the table has rows).
- Production impact: a zero-row table and an admin entry. Imperceptible.

## Open questions

None for this PR. Post-PR-G decisions (stage state machine, soft-delete vs. archive, per-opportunity permissions beyond workspace membership) are tracked in the Track 03 plan and will each get their own brainstorm + spec as they come up.
