from __future__ import annotations

import datetime as dt

import pytest

from fx.models import FxRate
from fx.tasks import refresh_rates_for_workspace
from tenancy.models import Workspace

pytestmark = pytest.mark.django_db


def test_refresh_rates_seeds_sample_rows_for_today():
    ws = Workspace.objects.create(name="W", slug="ws")

    written = refresh_rates_for_workspace(str(ws.pk))

    assert written == 3
    rows = FxRate.objects.filter(workspace=ws, date=dt.date.today())
    currencies = sorted(rows.values_list("currency", flat=True))
    assert currencies == ["BRL", "EUR", "GBP"]
    for row in rows:
        assert row.source == "task"
        assert row.created_by is None


def test_refresh_rates_returns_zero_when_workspace_missing():
    """Scheduler can race with workspace deletion; bail quietly."""
    written = refresh_rates_for_workspace("00000000-0000-0000-0000-000000000000")
    assert written == 0
