from __future__ import annotations

import uuid

from django.conf import settings
from django.db import models

from core.models import TimeStampedModel


class InterviewCycle(TimeStampedModel):
    """One end-to-end loop with a single company for a single opportunity."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    opportunity = models.ForeignKey(
        "opportunities.Opportunity",
        on_delete=models.CASCADE,
        related_name="interview_cycles",
    )
    name = models.CharField(max_length=200)
    started_at = models.DateTimeField(null=True, blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(blank=True, default="")

    class Meta:
        ordering = ("-created_at",)

    def __str__(self) -> str:
        return f"{self.name} ({self.opportunity.title} @ {self.opportunity.company})"


class InterviewStepKind(models.TextChoices):
    SCREENING = "screening", "Screening"
    PHONE = "phone", "Phone screen"
    TECHNICAL = "technical", "Technical"
    SYSTEM_DESIGN = "system_design", "System design"
    BEHAVIORAL = "behavioral", "Behavioral"
    PANEL = "panel", "Panel"
    OFFER = "offer", "Offer"
    OTHER = "other", "Other"


class InterviewStepStatus(models.TextChoices):
    SCHEDULED = "scheduled", "Scheduled"
    COMPLETED = "completed", "Completed"
    CANCELLED = "cancelled", "Cancelled"
    NO_SHOW = "no_show", "No show"


class InterviewStep(TimeStampedModel):
    """One step inside a cycle — phone screen, system-design loop, etc."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    cycle = models.ForeignKey(
        InterviewCycle,
        on_delete=models.CASCADE,
        related_name="steps",
    )
    sequence = models.PositiveIntegerField()
    kind = models.CharField(
        max_length=16,
        choices=InterviewStepKind.choices,
        default=InterviewStepKind.OTHER,
    )
    status = models.CharField(
        max_length=16,
        choices=InterviewStepStatus.choices,
        default=InterviewStepStatus.SCHEDULED,
    )
    scheduled_for = models.DateTimeField(null=True, blank=True)
    duration_minutes = models.PositiveIntegerField(null=True, blank=True)
    interviewer = models.CharField(max_length=200, blank=True, default="")
    notes = models.TextField(blank=True, default="")

    class Meta:
        ordering = ("sequence",)
        constraints = [
            models.UniqueConstraint(
                fields=("cycle", "sequence"),
                name="uniq_interview_step_sequence",
            ),
            # 1-indexed by contract; same shape as ResumeVersion.version_number.
            models.CheckConstraint(
                condition=models.Q(sequence__gte=1),
                name="interview_step_sequence_gte_1",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.cycle.name} step {self.sequence} ({self.kind})"


class InterviewStepResume(TimeStampedModel):
    """Junction: which `ResumeVersion` was referenced for which `InterviewStep`.

    Lives in the `interviews` app rather than `resumes` because every
    query is step-driven (the API path filters by `?step=`) and the FE
    attaches the section to the InterviewCycleDetail screen.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    step = models.ForeignKey(
        InterviewStep,
        on_delete=models.CASCADE,
        related_name="resume_links",
    )
    resume_version = models.ForeignKey(
        "resumes.ResumeVersion",
        # PROTECT (matching `OpportunityResume`) so the audit trail isn't
        # silently mutated by an admin-side resume-version delete.
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
            # Same step + same version = same link; the unique constraint
            # blocks the duplicate at the DB layer so the view layer can
            # surface it as a friendly 400.
            models.UniqueConstraint(
                fields=("step", "resume_version"),
                name="uniq_step_resume",
            ),
        ]

    def __str__(self) -> str:
        return f"step {self.step_id} ↔ resume {self.resume_version_id}"
