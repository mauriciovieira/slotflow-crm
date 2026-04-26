from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from core.auth_bypass import is_2fa_bypass_active
from invites.models import Invite


@pytest.fixture
def bypass_active(settings, monkeypatch):
    settings.DEBUG = True
    monkeypatch.setenv("SLOTFLOW_BYPASS_2FA", "1")
    assert is_2fa_bypass_active()


@pytest.mark.django_db
def test_seed_invite_creates_pending_by_default(bypass_active):
    client = APIClient()
    resp = client.post(
        "/api/test/_seed_invite/",
        {"email": "alice@x.com"},
        format="json",
    )
    assert resp.status_code == 200, resp.content
    body = resp.json()
    assert body["email"] == "alice@x.com"
    assert body["raw_token"]
    assert body["accept_url"].endswith(f"/accept-invite/{body['raw_token']}/")

    inv = Invite.objects.get(email="alice@x.com")
    assert inv.status == Invite.Status.PENDING


@pytest.mark.django_db
def test_seed_invite_status_param_creates_revoked(bypass_active):
    client = APIClient()
    resp = client.post(
        "/api/test/_seed_invite/",
        {"email": "alice@x.com", "status": "revoked"},
        format="json",
    )
    assert resp.status_code == 200
    inv = Invite.objects.get(email="alice@x.com")
    assert inv.status == Invite.Status.REVOKED


@pytest.mark.django_db
def test_seed_invite_expired_param_sets_past_expiry(bypass_active):
    client = APIClient()
    resp = client.post(
        "/api/test/_seed_invite/",
        {"email": "alice@x.com", "expired": True},
        format="json",
    )
    assert resp.status_code == 200
    inv = Invite.objects.get(email="alice@x.com")
    assert inv.is_expired


@pytest.mark.django_db
def test_seed_invite_404_when_bypass_inactive(settings, monkeypatch):
    settings.DEBUG = False
    monkeypatch.delenv("SLOTFLOW_BYPASS_2FA", raising=False)
    client = APIClient()
    resp = client.post(
        "/api/test/_seed_invite/",
        {"email": "x@x.com"},
        format="json",
    )
    assert resp.status_code == 404
