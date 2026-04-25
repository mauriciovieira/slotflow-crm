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


def test_refresh_rates_does_not_count_existing_manual_override_as_written():
    """A manual override at the same (currency, base, date) is preserved
    untouched by the task, so the counter should reflect only actual
    writes — not the no-op."""
    from decimal import Decimal

    from django.contrib.auth import get_user_model

    from fx.services import upsert_fx_rate
    from tenancy.models import Membership

    ws = Workspace.objects.create(name="W", slug="ws")
    user = get_user_model().objects.create_user(
        username="alice", email="a@example.com", password="x"
    )
    Membership.objects.create(user=user, workspace=ws)
    upsert_fx_rate(
        actor=user,
        workspace=ws,
        currency="EUR",
        base_currency="USD",
        rate=Decimal("1.10"),
        date=dt.date.today(),
    )

    written = refresh_rates_for_workspace(str(ws.pk))

    # 3 sample currencies; EUR is preserved, BRL and GBP are written.
    assert written == 2


def test_refresh_rates_returns_zero_when_workspace_missing():
    """Scheduler can race with workspace deletion; bail quietly."""
    written = refresh_rates_for_workspace("00000000-0000-0000-0000-000000000000")
    assert written == 0


def test_refresh_rates_returns_zero_for_malformed_uuid():
    """A misconfigured beat schedule (or a manual `delay()`) might pass a
    non-UUID string; the worker should bail quietly, not crash the tick."""
    assert refresh_rates_for_workspace("not-a-uuid") == 0
