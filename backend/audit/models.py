from __future__ import annotations

import uuid

from django.conf import settings
from django.db import models

from core.models import TimeStampedModel


class AuditEvent(TimeStampedModel):
    """Append-only record of a security-sensitive action.

    The model is intentionally permissive — `entity_type` / `entity_id` are
    free-form strings so any future model can be referenced without a
    migration. The actor FK uses `SET_NULL` so the row survives user
    deletion; `actor_repr` is frozen at write so we don't lose the human
    label when the user goes away.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="audit_events",
    )
    actor_repr = models.CharField(max_length=200)
    action = models.CharField(max_length=100)
    entity_type = models.CharField(max_length=100, blank=True)
    entity_id = models.CharField(max_length=64, blank=True)
    workspace = models.ForeignKey(
        "tenancy.Workspace",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="audit_events",
    )
    correlation_id = models.CharField(max_length=64, blank=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ("-created_at",)
        indexes = [
            models.Index(fields=("action", "-created_at")),
            models.Index(fields=("entity_type", "entity_id")),
        ]

    def __str__(self) -> str:
        return f"{self.action} by {self.actor_repr} at {self.created_at:%Y-%m-%dT%H:%M:%SZ}"
