from __future__ import annotations

import datetime as dt
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from fx.models import FxRate
from tenancy.models import Membership, MembershipRole, Workspace

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _bypass_2fa_middleware(monkeypatch):
    monkeypatch.setattr("core.middleware.require_2fa.is_2fa_bypass_active", lambda: True)


def _user(username="alice"):
    return get_user_model().objects.create_user(
        username=username, email=f"{username}@example.com", password="x"
    )


def _ws(slug="ws-a"):
    return Workspace.objects.create(name=f"Workspace {slug}", slug=slug)


def _join(user, ws, role=MembershipRole.OWNER):
    return Membership.objects.create(user=user, workspace=ws, role=role)


def _client(user=None) -> APIClient:
    client = APIClient()
    if user is not None:
        client.force_authenticate(user=user)
    return client


def test_anonymous_returns_403_or_401():
    response = _client().get("/api/fx-rates/")
    assert response.status_code in (401, 403)


def test_list_returns_only_callers_workspace_rows():
    alice = _user("alice")
    bob = _user("bob")
    ws_a = _ws("ws-alice")
    ws_b = _ws("ws-bob")
    _join(alice, ws_a)
    _join(bob, ws_b)
    FxRate.objects.create(
        workspace=ws_a,
        currency="EUR",
        base_currency="USD",
        rate=Decimal("0.92"),
        date=dt.date(2026, 1, 1),
    )
    FxRate.objects.create(
        workspace=ws_b,
        currency="EUR",
        base_currency="USD",
        rate=Decimal("0.95"),
        date=dt.date(2026, 1, 1),
    )

    response = _client(alice).get("/api/fx-rates/")
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["workspace"] == str(ws_a.pk)


def test_list_filter_by_currency():
    alice = _user()
    ws = _ws()
    _join(alice, ws)
    FxRate.objects.create(
        workspace=ws,
        currency="EUR",
        base_currency="USD",
        rate=Decimal("0.92"),
        date=dt.date(2026, 1, 1),
    )
    FxRate.objects.create(
        workspace=ws,
        currency="GBP",
        base_currency="USD",
        rate=Decimal("0.79"),
        date=dt.date(2026, 1, 1),
    )

    response = _client(alice).get("/api/fx-rates/?currency=EUR")
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["currency"] == "EUR"


def test_list_filter_by_date_range():
    alice = _user()
    ws = _ws()
    _join(alice, ws)
    FxRate.objects.create(
        workspace=ws,
        currency="EUR",
        base_currency="USD",
        rate=Decimal("0.90"),
        date=dt.date(2025, 12, 1),
    )
    FxRate.objects.create(
        workspace=ws,
        currency="EUR",
        base_currency="USD",
        rate=Decimal("0.92"),
        date=dt.date(2026, 1, 1),
    )
    FxRate.objects.create(
        workspace=ws,
        currency="EUR",
        base_currency="USD",
        rate=Decimal("0.95"),
        date=dt.date(2026, 2, 1),
    )

    response = _client(alice).get("/api/fx-rates/?date_from=2026-01-01&date_to=2026-01-31")
    assert response.status_code == 200
    assert len(response.json()) == 1


def test_list_invalid_date_filter_returns_400():
    alice = _user()
    ws = _ws()
    _join(alice, ws)
    response = _client(alice).get("/api/fx-rates/?date_from=nope")
    assert response.status_code == 400


def test_create_upserts_row():
    alice = _user()
    ws = _ws()
    _join(alice, ws)

    response = _client(alice).post(
        "/api/fx-rates/",
        data={
            "workspace": str(ws.pk),
            "currency": "eur",  # uppercased server-side
            "base_currency": "usd",
            "rate": "0.92",
            "date": "2026-01-01",
        },
        format="json",
    )
    assert response.status_code == 201, response.content
    body = response.json()
    assert body["currency"] == "EUR"
    assert body["base_currency"] == "USD"
    assert body["source"] == "manual"


def test_create_same_key_updates_existing_row():
    alice = _user()
    ws = _ws()
    _join(alice, ws)
    payload = {
        "workspace": str(ws.pk),
        "currency": "EUR",
        "base_currency": "USD",
        "rate": "0.92",
        "date": "2026-01-01",
    }
    first = _client(alice).post("/api/fx-rates/", data=payload, format="json")
    assert first.status_code == 201
    second = _client(alice).post(
        "/api/fx-rates/",
        data={**payload, "rate": "0.93"},
        format="json",
    )
    assert second.status_code == 201
    assert FxRate.objects.count() == 1
    obj = FxRate.objects.get()
    assert obj.rate == Decimal("0.93")


def test_create_rejects_workspace_user_does_not_belong_to():
    alice = _user("alice")
    ws_other = _ws("ws-other")

    response = _client(alice).post(
        "/api/fx-rates/",
        data={
            "workspace": str(ws_other.pk),
            "currency": "EUR",
            "base_currency": "USD",
            "rate": "0.92",
            "date": "2026-01-01",
        },
        format="json",
    )
    assert response.status_code == 400
    assert "workspace" in response.json()


def test_create_forbidden_for_viewer():
    alice = _user()
    ws = _ws()
    _join(alice, ws, role=MembershipRole.VIEWER)
    response = _client(alice).post(
        "/api/fx-rates/",
        data={
            "workspace": str(ws.pk),
            "currency": "EUR",
            "base_currency": "USD",
            "rate": "0.92",
            "date": "2026-01-01",
        },
        format="json",
    )
    assert response.status_code == 403


def test_delete_row_returns_204():
    alice = _user()
    ws = _ws()
    _join(alice, ws)
    obj = FxRate.objects.create(
        workspace=ws,
        currency="EUR",
        base_currency="USD",
        rate=Decimal("0.92"),
        date=dt.date(2026, 1, 1),
    )

    response = _client(alice).delete(f"/api/fx-rates/{obj.pk}/")
    assert response.status_code == 204
    assert FxRate.objects.filter(pk=obj.pk).count() == 0


def test_delete_non_manual_row_returns_400():
    """The API enforces the manual-only delete rule (the FE only hides
    the button). A stale tab attempting to drop a `task` row gets 400."""
    alice = _user()
    ws = _ws()
    _join(alice, ws)
    obj = FxRate.objects.create(
        workspace=ws,
        currency="EUR",
        base_currency="USD",
        rate=Decimal("0.92"),
        date=dt.date(2026, 1, 1),
        source="task",
    )

    response = _client(alice).delete(f"/api/fx-rates/{obj.pk}/")
    assert response.status_code == 400
    assert "non_field_errors" in response.json()
    assert FxRate.objects.filter(pk=obj.pk).count() == 1


def test_delete_writes_audit_event():
    from audit.models import AuditEvent

    alice = _user()
    ws = _ws()
    _join(alice, ws)
    obj = FxRate.objects.create(
        workspace=ws,
        currency="EUR",
        base_currency="USD",
        rate=Decimal("0.92"),
        date=dt.date(2026, 1, 1),
    )
    _client(alice).delete(f"/api/fx-rates/{obj.pk}/")
    events = list(AuditEvent.objects.filter(action="fx_rate.deleted"))
    assert len(events) == 1


def test_create_rejects_zero_rate():
    alice = _user()
    ws = _ws()
    _join(alice, ws)
    response = _client(alice).post(
        "/api/fx-rates/",
        data={
            "workspace": str(ws.pk),
            "currency": "EUR",
            "base_currency": "USD",
            "rate": "0",
            "date": "2026-01-01",
        },
        format="json",
    )
    assert response.status_code == 400
    assert "rate" in response.json()


def test_delete_forbidden_for_viewer():
    alice = _user()
    ws = _ws()
    _join(alice, ws, role=MembershipRole.VIEWER)
    obj = FxRate.objects.create(
        workspace=ws,
        currency="EUR",
        base_currency="USD",
        rate=Decimal("0.92"),
        date=dt.date(2026, 1, 1),
    )
    response = _client(alice).delete(f"/api/fx-rates/{obj.pk}/")
    assert response.status_code == 403


def test_list_query_count_does_not_scale():
    from django.db import connection
    from django.test.utils import CaptureQueriesContext

    alice = _user()
    ws = _ws()
    _join(alice, ws)
    for i in range(5):
        FxRate.objects.create(
            workspace=ws,
            currency=f"C{i}",
            base_currency="USD",
            rate=Decimal("1.0"),
            date=dt.date(2026, 1, 1 + i),
        )

    client = _client(alice)
    with CaptureQueriesContext(connection) as ctx:
        response = client.get("/api/fx-rates/")
    assert response.status_code == 200
    assert len(response.json()) == 5
    assert len(ctx) <= 8, [q["sql"] for q in ctx]
