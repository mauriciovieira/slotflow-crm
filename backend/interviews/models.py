from __future__ import annotations

import uuid

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
