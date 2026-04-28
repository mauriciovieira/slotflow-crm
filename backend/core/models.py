from __future__ import annotations

from django.db import models
from django.utils import timezone


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


class TermsVersion(TimeStampedModel):
    version = models.CharField(max_length=32, unique=True)
    body = models.TextField()
    effective_at = models.DateTimeField()

    class Meta:
        ordering = ("-effective_at",)

    def __str__(self) -> str:
        return self.version

    @classmethod
    def current(cls) -> TermsVersion | None:
        return (
            cls.objects.filter(effective_at__lte=timezone.now()).order_by("-effective_at").first()
        )
