from __future__ import annotations

import datetime as dt
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from opportunities.models import Opportunity
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


URL = "/api/insights/compensation-snapshot/"


def test_anonymous_returns_403_or_401():
    response = _client().get(URL)
    assert response.status_code in (401, 403)


def test_requires_workspace_param():
    alice = _user()
    response = _client(alice).get(URL)
    assert response.status_code == 400
    assert "workspace" in response.json()


def test_invalid_workspace_uuid_returns_400():
    alice = _user()
    response = _client(alice).get(f"{URL}?workspace=nope")
    assert response.status_code == 400


def test_cross_workspace_returns_404():
    alice = _user("alice")
    bob = _user("bob")
    ws_b = _ws("ws-b")
    _join(bob, ws_b)
    response = _client(alice).get(f"{URL}?workspace={ws_b.pk}")
    assert response.status_code == 404


def test_happy_path_with_two_usd_opps():
    alice = _user()
    ws = _ws()
    _join(alice, ws)
    Opportunity.objects.create(
        workspace=ws,
        title="A",
        company="X",
        expected_total_compensation=Decimal("100000"),
        compensation_currency="USD",
    )
    Opportunity.objects.create(
        workspace=ws,
        title="B",
        company="Y",
        expected_total_compensation=Decimal("150000"),
        compensation_currency="USD",
    )

    response = _client(alice).get(f"{URL}?workspace={ws.pk}")
    assert response.status_code == 200
    body = response.json()
    assert body["target_currency"] == "USD"
    assert Decimal(body["total"]) == Decimal("250000")
    assert len(body["line_items"]) == 2
    assert body["skipped"] == []


def test_default_currency_is_usd():
    alice = _user()
    ws = _ws()
    _join(alice, ws)
    response = _client(alice).get(f"{URL}?workspace={ws.pk}")
    assert response.status_code == 200
    assert response.json()["target_currency"] == "USD"


def test_default_date_is_today():
    alice = _user()
    ws = _ws()
    _join(alice, ws)
    response = _client(alice).get(f"{URL}?workspace={ws.pk}")
    assert response.status_code == 200
    assert response.json()["date"] == dt.date.today().isoformat()


def test_invalid_date_returns_400():
    alice = _user()
    ws = _ws()
    _join(alice, ws)
    response = _client(alice).get(f"{URL}?workspace={ws.pk}&date=nope")
    assert response.status_code == 400


def test_viewer_role_allowed():
    alice = _user()
    ws = _ws()
    _join(alice, ws, role=MembershipRole.VIEWER)
    response = _client(alice).get(f"{URL}?workspace={ws.pk}")
    assert response.status_code == 200
