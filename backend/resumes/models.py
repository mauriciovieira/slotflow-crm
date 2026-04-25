from __future__ import annotations

import uuid

from django.conf import settings
from django.db import models

from core.models import TimeStampedModel


class BaseResume(TimeStampedModel):
    """Workspace-owned canonical resume — the named "thing" versions hang off."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(
        "tenancy.Workspace",
        on_delete=models.CASCADE,
        related_name="resumes",
    )
    name = models.CharField(max_length=200)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_resumes",
    )

    class Meta:
        ordering = ("-created_at",)
        indexes = [models.Index(fields=("workspace",))]

    def __str__(self) -> str:
        return f"{self.name} ({self.workspace.slug})"


class ResumeVersion(TimeStampedModel):
    """Append-only snapshot of a `BaseResume` at a point in time.

    The `document` JSON is the canonical JSON Resume representation; the
    importer / editor in Track 05 owns its shape. `document_hash` exists so
    the importer can skip no-op writes; it is NOT unique because the same
    content can intentionally exist under two bases (forking a CV).
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    base_resume = models.ForeignKey(
        BaseResume,
        on_delete=models.CASCADE,
        related_name="versions",
    )
    version_number = models.PositiveIntegerField()
    document = models.JSONField()
    document_hash = models.CharField(max_length=64)
    notes = models.TextField(blank=True, default="")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_resume_versions",
    )

    class Meta:
        ordering = ("-version_number",)
        constraints = [
            models.UniqueConstraint(
                fields=("base_resume", "version_number"),
                name="uniq_resume_version_number",
            ),
        ]
        indexes = [models.Index(fields=("base_resume", "version_number"))]

    def __str__(self) -> str:
        return f"{self.base_resume_id} v{self.version_number}"
