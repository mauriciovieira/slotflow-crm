from __future__ import annotations

import datetime as dt
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model

from fx.models import FxRate
from insights.services import compute_compensation_snapshot
from opportunities.models import Opportunity
from tenancy.models import Membership, Workspace

pytestmark = pytest.mark.django_db


def _user():
    return get_user_model().objects.create_user(
        username="alice", email="a@example.com", password="x"
    )


def _ws():
    ws = Workspace.objects.create(name="W", slug="ws")
    Membership.objects.create(user=_user(), workspace=ws)
    return ws


def _opp(ws, *, title="Staff Eng", company="Acme", expected=None, currency="", archived=False):
    opp = Opportunity.objects.create(
        workspace=ws,
        title=title,
        company=company,
        expected_total_compensation=expected,
        compensation_currency=currency,
    )
    if archived:
        from django.utils import timezone

        opp.archived_at = timezone.now()
        opp.save(update_fields=["archived_at"])
    return opp


def _rate(ws, currency, rate, date):
    return FxRate.objects.create(
        workspace=ws,
        currency=currency,
        base_currency="USD",
        rate=Decimal(str(rate)),
        date=date,
    )


def test_empty_workspace_returns_zero_total():
    ws = _ws()
    snap = compute_compensation_snapshot(
        workspace=ws, target_currency="USD", date=dt.date(2026, 1, 1)
    )
    assert snap.total == Decimal("0")
    assert snap.line_items == []
    assert snap.skipped == []


def test_single_opp_same_currency():
    ws = _ws()
    _opp(ws, expected=Decimal("200000"), currency="USD")

    snap = compute_compensation_snapshot(
        workspace=ws, target_currency="USD", date=dt.date(2026, 1, 1)
    )
    assert snap.total == Decimal("200000")
    assert len(snap.line_items) == 1
    assert snap.line_items[0].converted_amount == Decimal("200000")
    assert snap.skipped == []


def test_multi_currency_conversion():
    """100k EUR @ 0.92 = 108_695.65 USD; 100k USD = 100k USD; total ≈ 208_695.65."""
    ws = _ws()
    _opp(ws, title="EU job", expected=Decimal("100000"), currency="EUR")
    _opp(ws, title="US job", expected=Decimal("100000"), currency="USD")
    _rate(ws, "EUR", "0.92", dt.date(2026, 1, 1))

    snap = compute_compensation_snapshot(
        workspace=ws, target_currency="USD", date=dt.date(2026, 1, 1)
    )
    # Allow tiny rounding; total should be ~208,695.65.
    assert Decimal("208695") < snap.total < Decimal("208700")
    assert len(snap.line_items) == 2
    assert snap.skipped == []


def test_missing_fx_rate_skips_row_but_keeps_partial_total():
    ws = _ws()
    _opp(ws, title="Has comp, no rate", expected=Decimal("50000"), currency="EUR")
    _opp(ws, title="USD comp", expected=Decimal("100000"), currency="USD")
    # No EUR rate seeded.

    snap = compute_compensation_snapshot(
        workspace=ws, target_currency="USD", date=dt.date(2026, 1, 1)
    )
    assert snap.total == Decimal("100000")
    assert len(snap.line_items) == 1
    assert len(snap.skipped) == 1
    assert snap.skipped[0].reason == "fx-rate-missing"


def test_opp_missing_comp_fields_is_skipped():
    ws = _ws()
    _opp(ws, title="No comp")  # both fields absent
    _opp(ws, title="Has comp", expected=Decimal("100000"), currency="USD")

    snap = compute_compensation_snapshot(
        workspace=ws, target_currency="USD", date=dt.date(2026, 1, 1)
    )
    assert snap.total == Decimal("100000")
    assert len(snap.line_items) == 1
    assert len(snap.skipped) == 1
    assert snap.skipped[0].reason == "missing-comp-fields"


def test_archived_opps_excluded():
    ws = _ws()
    _opp(ws, title="Live", expected=Decimal("100000"), currency="USD")
    _opp(ws, title="Archived", expected=Decimal("999000"), currency="USD", archived=True)

    snap = compute_compensation_snapshot(
        workspace=ws, target_currency="USD", date=dt.date(2026, 1, 1)
    )
    assert snap.total == Decimal("100000")


def test_target_currency_uppercased():
    ws = _ws()
    _opp(ws, expected=Decimal("100000"), currency="USD")
    snap = compute_compensation_snapshot(
        workspace=ws, target_currency="usd", date=dt.date(2026, 1, 1)
    )
    assert snap.target_currency == "USD"
