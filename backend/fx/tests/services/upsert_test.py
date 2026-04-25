from __future__ import annotations

import datetime as dt
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model

from fx.models import FxRate
from fx.services import (
    WorkspaceMembershipRequired,
    WorkspaceWriteForbidden,
    upsert_fx_rate,
)
from tenancy.models import Membership, MembershipRole, Workspace

pytestmark = pytest.mark.django_db


def _user(username="alice"):
    return get_user_model().objects.create_user(
        username=username, email=f"{username}@example.com", password="x"
    )


def _ws(slug="ws-a"):
    return Workspace.objects.create(name=f"Workspace {slug}", slug=slug)


def _join(user, ws, role=MembershipRole.OWNER):
    return Membership.objects.create(user=user, workspace=ws, role=role)


def test_upsert_creates_then_updates_same_key():
    user = _user()
    ws = _ws()
    _join(user, ws)

    a = upsert_fx_rate(
        actor=user,
        workspace=ws,
        currency="EUR",
        base_currency="USD",
        rate="0.92",
        date=dt.date(2026, 1, 1),
    )
    b = upsert_fx_rate(
        actor=user,
        workspace=ws,
        currency="EUR",
        base_currency="USD",
        rate="0.93",
        date=dt.date(2026, 1, 1),
    )
    assert a.pk == b.pk
    assert FxRate.objects.count() == 1
    a.refresh_from_db()
    assert a.rate == Decimal("0.93")


def test_upsert_uppercases_currency_codes():
    user = _user()
    ws = _ws()
    _join(user, ws)
    obj = upsert_fx_rate(
        actor=user,
        workspace=ws,
        currency="eur",
        base_currency="usd",
        rate="0.92",
        date=dt.date(2026, 1, 1),
    )
    assert obj.currency == "EUR"
    assert obj.base_currency == "USD"


def test_upsert_rejects_non_member():
    user = _user("bob")
    ws = _ws()
    with pytest.raises(WorkspaceMembershipRequired):
        upsert_fx_rate(
            actor=user,
            workspace=ws,
            currency="EUR",
            base_currency="USD",
            rate="0.92",
            date=dt.date(2026, 1, 1),
        )


def test_upsert_rejects_viewer():
    user = _user()
    ws = _ws()
    _join(user, ws, role=MembershipRole.VIEWER)
    with pytest.raises(WorkspaceWriteForbidden):
        upsert_fx_rate(
            actor=user,
            workspace=ws,
            currency="EUR",
            base_currency="USD",
            rate="0.92",
            date=dt.date(2026, 1, 1),
        )


def test_upsert_with_actor_none_skips_membership_check():
    """Celery task path: no actor → no membership check, source carries through."""
    ws = _ws()
    obj = upsert_fx_rate(
        actor=None,
        workspace=ws,
        currency="EUR",
        base_currency="USD",
        rate="0.92",
        date=dt.date(2026, 1, 1),
        source="task",
    )
    assert obj.source == "task"
    assert obj.created_by is None


def test_upsert_writes_audit_event():
    from audit.models import AuditEvent

    user = _user()
    ws = _ws()
    _join(user, ws)
    obj = upsert_fx_rate(
        actor=user,
        workspace=ws,
        currency="EUR",
        base_currency="USD",
        rate="0.92",
        date=dt.date(2026, 1, 1),
    )

    events = list(AuditEvent.objects.filter(action="fx_rate.upserted"))
    assert len(events) == 1
    event = events[0]
    assert event.workspace_id == ws.pk
    assert event.entity_type == "fx.FxRate"
    assert event.entity_id == str(obj.pk)
    assert event.metadata["currency"] == "EUR"
    assert event.metadata["created"] is True
