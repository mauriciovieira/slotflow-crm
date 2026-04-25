from __future__ import annotations

import datetime as dt
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model

from fx.models import FxRate
from fx.services import FxRateMissing, convert
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


def _rate(ws, currency, rate, date):
    return FxRate.objects.create(
        workspace=ws,
        currency=currency,
        base_currency="USD",
        rate=Decimal(str(rate)),
        date=date,
    )


def test_convert_identity_returns_same_amount():
    ws = _ws()
    out = convert(
        workspace=ws,
        amount="100",
        from_currency="USD",
        to_currency="USD",
        date=dt.date(2026, 1, 1),
    )
    assert out == Decimal("100")


def test_convert_from_base_to_other():
    """USD→EUR at rate 0.92: 100 USD → 92 EUR."""
    ws = _ws()
    _rate(ws, "EUR", "0.92", dt.date(2026, 1, 1))

    out = convert(
        workspace=ws,
        amount="100",
        from_currency="USD",
        to_currency="EUR",
        date=dt.date(2026, 1, 1),
    )
    assert out == Decimal("92.00")


def test_convert_other_to_base():
    """EUR→USD at rate 0.92: 92 EUR → 100 USD."""
    ws = _ws()
    _rate(ws, "EUR", "0.92", dt.date(2026, 1, 1))

    out = convert(
        workspace=ws,
        amount="92",
        from_currency="EUR",
        to_currency="USD",
        date=dt.date(2026, 1, 1),
    )
    assert out == Decimal("100")


def test_convert_other_to_other_uses_base_as_pivot():
    """EUR→GBP via USD: 100 EUR / 0.92 = 108.69 USD, * 0.79 = 85.87 GBP."""
    ws = _ws()
    _rate(ws, "EUR", "0.92", dt.date(2026, 1, 1))
    _rate(ws, "GBP", "0.79", dt.date(2026, 1, 1))

    out = convert(
        workspace=ws,
        amount="100",
        from_currency="EUR",
        to_currency="GBP",
        date=dt.date(2026, 1, 1),
    )
    # Allow trailing-zero decimal differences; check first 4 digits.
    assert str(out)[:5].startswith("85.86") or str(out)[:5].startswith("85.87")


def test_convert_uses_most_recent_rate_on_or_before_date():
    ws = _ws()
    _rate(ws, "EUR", "0.90", dt.date(2025, 12, 1))
    _rate(ws, "EUR", "0.92", dt.date(2026, 1, 1))
    _rate(ws, "EUR", "0.95", dt.date(2026, 2, 1))  # after target date

    out = convert(
        workspace=ws,
        amount="100",
        from_currency="USD",
        to_currency="EUR",
        date=dt.date(2026, 1, 15),
    )
    # Should use the Jan 1 rate (0.92), not Feb 1.
    assert out == Decimal("92.00")


def test_convert_raises_when_no_rate_available():
    ws = _ws()
    with pytest.raises(FxRateMissing):
        convert(
            workspace=ws,
            amount="100",
            from_currency="EUR",
            to_currency="USD",
            date=dt.date(2026, 1, 1),
        )


def test_convert_does_not_write_audit_row():
    """Read-only path; Insights compute may call this many times."""
    from audit.models import AuditEvent

    ws = _ws()
    _rate(ws, "EUR", "0.92", dt.date(2026, 1, 1))
    convert(
        workspace=ws,
        amount="100",
        from_currency="USD",
        to_currency="EUR",
        date=dt.date(2026, 1, 1),
    )
    assert AuditEvent.objects.filter(action__startswith="fx_rate").count() == 0
