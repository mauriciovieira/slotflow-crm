from __future__ import annotations

import uuid

from django.conf import settings
from django.db import models

from core.models import TimeStampedModel


class OpportunityStage(models.TextChoices):
    APPLIED = "applied", "Applied"
    SCREENING = "screening", "Screening"
    INTERVIEW = "interview", "Interview"
    OFFER = "offer", "Offer"
    REJECTED = "rejected", "Rejected"
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
    archived_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("-created_at",)
        indexes = [models.Index(fields=("workspace", "stage"))]

    def __str__(self) -> str:
        return f"{self.title} @ {self.company}"


class OpportunityResumeRole(models.TextChoices):
    SUBMITTED = "submitted", "Submitted"
    USED_INTERNALLY = "used_internally", "Used internally"


class OpportunityResume(TimeStampedModel):
    """Junction: which `ResumeVersion` was attached to which `Opportunity`.

    Lives in the `opportunities` app rather than `resumes` because every
    query is opportunity-driven (the API path filters by `?opportunity=`)
    and the FE attaches the section to the OpportunityDetail screen.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    opportunity = models.ForeignKey(
        Opportunity,
        on_delete=models.CASCADE,
        related_name="resume_links",
    )
    resume_version = models.ForeignKey(
        "resumes.ResumeVersion",
        # PROTECT (not CASCADE / SET_NULL) so the audit trail isn't silently
        # mutated when a resume version is deleted. Versions are append-only
        # in normal flows; admin-side deletion must explicitly unlink first.
        on_delete=models.PROTECT,
        related_name="opportunity_links",
    )
    role = models.CharField(
        max_length=32,
        choices=OpportunityResumeRole.choices,
    )
    note = models.TextField(blank=True, default="")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_opportunity_resume_links",
    )

    class Meta:
        ordering = ("-created_at",)
        constraints = [
            # The same version can be both Submitted and Used-internally for
            # the same opportunity, but not the same role twice.
            models.UniqueConstraint(
                fields=("opportunity", "resume_version", "role"),
                name="uniq_opp_resume_role",
            ),
        ]

    def __str__(self) -> str:
        return (
            f"{self.opportunity.title} ↔ resume {self.resume_version_id} "
            f"({self.get_role_display()})"
        )
