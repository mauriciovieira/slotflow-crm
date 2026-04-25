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
