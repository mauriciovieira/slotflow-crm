from __future__ import annotations

import secrets
import uuid
from datetime import timedelta

from django.conf import settings
from django.db import models
from django.utils import timezone

from core.models import TimeStampedModel


def _default_invitation_expiry():
    """Default invitation lifetime — 7 days from creation."""
    return timezone.now() + timedelta(days=7)


def _default_invitation_token() -> str:
    """43-char base64url token (~256 bits of entropy)."""
    return secrets.token_urlsafe(32)


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


class Invitation(TimeStampedModel):
    """Pending invite for an outside email to join a `Workspace`.

    The token is the bearer credential — anyone holding the URL with the
    token can accept; we don't gate on the email match because the token
    itself is high-entropy and the listing is owner-only. `expires_at`
    bounds the window. `accepted_at` and `revoked_at` are append-only
    state markers; once set, neither is cleared.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(
        Workspace,
        on_delete=models.CASCADE,
        related_name="invitations",
    )
    email = models.EmailField()
    role = models.CharField(
        max_length=16,
        choices=MembershipRole.choices,
        default=MembershipRole.MEMBER,
    )
    token = models.CharField(
        max_length=64,
        unique=True,
        default=_default_invitation_token,
        editable=False,
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="invitations_created",
    )
    expires_at = models.DateTimeField(default=_default_invitation_expiry)
    accepted_at = models.DateTimeField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=("workspace", "email")),
            models.Index(fields=("expires_at",)),
        ]

    def save(self, *args, **kwargs):
        if self.email:
            self.email = self.email.strip().lower()
        super().save(*args, **kwargs)

    @property
    def is_active(self) -> bool:
        """`True` iff the invitation can still be accepted right now."""
        if self.accepted_at is not None or self.revoked_at is not None:
            return False
        return self.expires_at > timezone.now()

    def __str__(self) -> str:
        return f"Invite {self.email} → {self.workspace} ({self.role})"
