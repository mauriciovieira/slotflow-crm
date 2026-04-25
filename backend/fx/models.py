from __future__ import annotations

import uuid

from django.conf import settings
from django.db import models

from core.models import TimeStampedModel


class FxRate(TimeStampedModel):
    """Foreign-exchange rate for a single (currency, base_currency, date) tuple.

    Stored per-workspace so each tenant can override their own rates without
    bleeding into another's data. `rate` is "1 unit of `base_currency` =
    `rate` units of `currency`" — pick a single direction so the math in
    `convert(...)` stays symmetric.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(
        "tenancy.Workspace",
        on_delete=models.CASCADE,
        related_name="fx_rates",
    )
    # Currency codes stay as a plain `CharField` (uppercased ISO 4217 by
    # convention) instead of a hard-coded enum; the long tail of currencies
    # makes an enum a maintenance trap.
    currency = models.CharField(max_length=8)
    base_currency = models.CharField(max_length=8)
    rate = models.DecimalField(max_digits=18, decimal_places=8)
    date = models.DateField()
    # `manual` = entered via UI; `task` = pulled by the Celery refresher;
    # `seed` = fixture / migration. UI hides the delete button on
    # non-manual rows so an automated rate can't be silently wiped.
    source = models.CharField(max_length=32, default="manual")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_fx_rates",
    )

    class Meta:
        ordering = ("-date", "currency")
        constraints = [
            models.UniqueConstraint(
                fields=("workspace", "currency", "base_currency", "date"),
                name="uniq_fx_rate_per_day",
            ),
        ]
        indexes = [
            # "What's the rate for `currency` in workspace X around date D?"
            # is the canonical lookup for `convert(...)`.
            models.Index(fields=("workspace", "currency", "-date")),
        ]

    def __str__(self) -> str:
        return f"{self.currency}/{self.base_currency} @ {self.date}: {self.rate}"
