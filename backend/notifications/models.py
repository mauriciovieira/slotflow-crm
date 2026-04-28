from __future__ import annotations

import uuid

from django.conf import settings
from django.db import models

from core.models import TimeStampedModel


class Notification(TimeStampedModel):
    """Per-recipient row representing one in-app notification.

    Read state is per-recipient (`read_at`); the same upstream event
    fans out as N rows, one per recipient. `kind` is a stable string
    key the FE can switch on for icons / phrasing; `payload` carries
    serializable context (entity title, actor label, link target).
    Workspace FK is optional so cross-workspace / system notices can
    coexist; the queryset filters on `recipient` and the FE shows
    workspace context out of `payload` when relevant.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="notifications",
    )
    # Aligned with `audit.AuditEvent.action.max_length` so the audit
    # fan-out hook can pass `kind=action` without ever truncating.
    kind = models.CharField(max_length=100)
    payload = models.JSONField(default=dict, blank=True)
    workspace = models.ForeignKey(
        "tenancy.Workspace",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="notifications",
    )
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("-created_at",)
        indexes = [
            # The FE asks "give me my unread notifications" most often;
            # this index makes that path index-only on a large table.
            models.Index(fields=("recipient", "read_at", "-created_at")),
        ]

    def __str__(self) -> str:
        return f"{self.kind} → {self.recipient_id} ({self.created_at:%Y-%m-%dT%H:%M:%SZ})"
