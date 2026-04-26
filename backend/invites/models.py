from __future__ import annotations

from django.conf import settings
from django.db import models
from django.utils import timezone

from core.models import TimeStampedModel


class Invite(TimeStampedModel):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        ACCEPTED = "accepted", "Accepted"
        REVOKED = "revoked", "Revoked"

    email = models.EmailField(db_index=True)
    token_hash = models.CharField(max_length=64, unique=True)
    expires_at = models.DateTimeField()
    status = models.CharField(
        max_length=16, choices=Status.choices, default=Status.PENDING,
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="invites_issued",
    )
    accepted_at = models.DateTimeField(null=True, blank=True)
    accepted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="invite_accepted",
    )
    workspace = models.ForeignKey(
        "tenancy.Workspace",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )

    class Meta:
        indexes = [models.Index(fields=("status", "-created_at"))]
        ordering = ("-created_at",)

    def __str__(self) -> str:
        return f"Invite<{self.email} {self.status}>"

    @property
    def is_expired(self) -> bool:
        return timezone.now() > self.expires_at

    @property
    def is_consumable(self) -> bool:
        return self.status == self.Status.PENDING and not self.is_expired

    def mark_accepted(self, *, user, workspace) -> None:
        self.status = self.Status.ACCEPTED
        self.accepted_by = user
        self.workspace = workspace
        self.accepted_at = timezone.now()
        self.save(
            update_fields=(
                "status",
                "accepted_by",
                "workspace",
                "accepted_at",
                "updated_at",
            )
        )
