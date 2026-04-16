from __future__ import annotations

from django.contrib.auth.models import AbstractUser


class User(AbstractUser):
    """Application user model (extension point for profile fields in later tracks)."""
