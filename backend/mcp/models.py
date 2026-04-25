from __future__ import annotations

import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone

from core.models import TimeStampedModel


class McpToken(TimeStampedModel):
    """Hashed, revocable, expiring token for MCP API access.

    The plaintext is shown to the caller exactly once — at issue time — and
    never persisted. The model stores `sha256(plaintext).hexdigest()` plus the
    last four characters for UI preview.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="mcp_tokens",
    )
    name = models.CharField(max_length=120)
    token_hash = models.CharField(max_length=64, unique=True)
    last_four = models.CharField(max_length=4)
    expires_at = models.DateTimeField()
    revoked_at = models.DateTimeField(null=True, blank=True)
    last_used_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("-created_at",)
        indexes = [models.Index(fields=("user", "revoked_at"))]

    def __str__(self) -> str:
        return f"{self.user_id}:{self.name}"

    @property
    def is_active(self) -> bool:
        if self.revoked_at is not None:
            return False
        return self.expires_at > timezone.now()
