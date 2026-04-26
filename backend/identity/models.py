from __future__ import annotations

from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    """Application user model (extension point for profile fields in later tracks)."""

    accepted_terms_version = models.ForeignKey(
        "core.TermsVersion",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="acceptances",
    )
    accepted_terms_at = models.DateTimeField(null=True, blank=True)
