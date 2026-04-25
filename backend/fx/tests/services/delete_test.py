from __future__ import annotations

import datetime as dt
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model

from fx.models import FxRate
from fx.services import (
    FxRateNonManualDeleteForbidden,
    WorkspaceWriteForbidden,
    delete_fx_rate,
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


def _rate(ws, source="manual"):
    return FxRate.objects.create(
        workspace=ws,
        currency="EUR",
        base_currency="USD",
        rate=Decimal("0.92"),
        date=dt.date(2026, 1, 1),
        source=source,
    )


def test_delete_manual_row_removes_it():
    user = _user()
    ws = _ws()
    _join(user, ws)
    obj = _rate(ws)

    delete_fx_rate(actor=user, fx_rate=obj)

    assert FxRate.objects.filter(pk=obj.pk).count() == 0


def test_delete_writes_audit_event_with_metadata_frozen_before_delete():
    from audit.models import AuditEvent

    user = _user()
    ws = _ws()
    _join(user, ws)
    obj = _rate(ws)
    pk = obj.pk

    delete_fx_rate(actor=user, fx_rate=obj)

    events = list(AuditEvent.objects.filter(action="fx_rate.deleted"))
    assert len(events) == 1
    event = events[0]
    assert event.entity_id == str(pk)
    assert event.metadata["currency"] == "EUR"
    assert event.metadata["source"] == "manual"


@pytest.mark.parametrize("source", ["task", "seed"])
def test_delete_rejects_non_manual_sources(source):
    user = _user()
    ws = _ws()
    _join(user, ws)
    obj = _rate(ws, source=source)

    with pytest.raises(FxRateNonManualDeleteForbidden):
        delete_fx_rate(actor=user, fx_rate=obj)
    assert FxRate.objects.filter(pk=obj.pk).count() == 1


def test_delete_rejects_viewer():
    owner = _user("owner")
    viewer = _user("viewer")
    ws = _ws()
    _join(owner, ws)
    _join(viewer, ws, role=MembershipRole.VIEWER)
    obj = _rate(ws)

    with pytest.raises(WorkspaceWriteForbidden):
        delete_fx_rate(actor=viewer, fx_rate=obj)
    assert FxRate.objects.filter(pk=obj.pk).count() == 1
