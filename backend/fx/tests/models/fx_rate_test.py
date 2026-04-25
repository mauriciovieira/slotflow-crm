from __future__ import annotations

import datetime as dt
from decimal import Decimal

import pytest
from django.db import IntegrityError

from fx.models import FxRate
from tenancy.models import Workspace

pytestmark = pytest.mark.django_db


def _ws(slug="ws-a"):
    return Workspace.objects.create(name=f"Workspace {slug}", slug=slug)


def test_create_minimum_fields_defaults():
    ws = _ws()
    obj = FxRate.objects.create(
        workspace=ws,
        currency="EUR",
        base_currency="USD",
        rate=Decimal("0.92"),
        date=dt.date(2026, 1, 1),
    )
    obj.refresh_from_db()
    assert obj.source == "manual"
    assert obj.created_by is None


def test_unique_constraint_per_workspace_currency_base_date():
    ws = _ws()
    FxRate.objects.create(
        workspace=ws,
        currency="EUR",
        base_currency="USD",
        rate=Decimal("0.92"),
        date=dt.date(2026, 1, 1),
    )
    with pytest.raises(IntegrityError):
        FxRate.objects.create(
            workspace=ws,
            currency="EUR",
            base_currency="USD",
            rate=Decimal("0.93"),
            date=dt.date(2026, 1, 1),
        )


def test_two_workspaces_can_share_a_rate_key():
    a = _ws("a")
    b = _ws("b")
    FxRate.objects.create(
        workspace=a,
        currency="EUR",
        base_currency="USD",
        rate=Decimal("0.92"),
        date=dt.date(2026, 1, 1),
    )
    FxRate.objects.create(
        workspace=b,
        currency="EUR",
        base_currency="USD",
        rate=Decimal("0.95"),
        date=dt.date(2026, 1, 1),
    )
    assert FxRate.objects.count() == 2
