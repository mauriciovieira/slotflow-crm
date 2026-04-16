from __future__ import annotations

import uuid

from django.conf import settings
from django.db import models

from core.models import TimeStampedModel


class Workspace(TimeStampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=200)
    slug = models.SlugField(max_length=80, unique=True)

    def __str__(self) -> str:
        return self.name


class MembershipRole(models.TextChoices):
    OWNER = "owner", "Owner"
    MEMBER = "member", "Member"
    VIEWER = "viewer", "Viewer"


class Membership(TimeStampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(
        Workspace,
        on_delete=models.CASCADE,
        related_name="memberships",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="memberships",
    )
    role = models.CharField(
        max_length=16,
        choices=MembershipRole.choices,
        default=MembershipRole.MEMBER,
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["workspace", "user"],
                name="uniq_membership_workspace_user",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.user} @ {self.workspace} ({self.role})"
