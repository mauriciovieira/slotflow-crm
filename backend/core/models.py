from __future__ import annotations

from django.db import models


class TimeStampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class SoftDeleteModel(models.Model):
    """Scaffold only: domain tracks will define deletion semantics."""

    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        abstract = True
