from __future__ import annotations

from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

from core.models import TermsVersion
from invites.models import Invite
from invites.services.tokens import issue_token


@pytest.fixture
def admin(db):
    return get_user_model().objects.create_user(
        username="admin",
        email="admin@x.com",
        is_superuser=True,
        is_staff=True,
    )


@pytest.fixture
def terms(db):
    TermsVersion.objects.all().delete()
    return TermsVersion.objects.create(
        version="1.0",
        body="ToS body",
        effective_at=timezone.now(),
    )


@pytest.fixture
def client():
    return APIClient()


def _create_invite(admin, *, expires_delta=timedelta(days=7), status=Invite.Status.PENDING):
    raw, hashed = issue_token()
    inv = Invite.objects.create(
        email="alice@x.com",
        token_hash=hashed,
        expires_at=timezone.now() + expires_delta,
        status=status,
        created_by=admin,
    )
    return raw, inv


@pytest.mark.django_db
def test_preflight_returns_200_with_invite_payload(client, admin, terms):
    raw, inv = _create_invite(admin)

    resp = client.get(f"/api/invites/{raw}/")
    assert resp.status_code == 200, resp.content
    data = resp.json()
    assert data["email"] == "alice@x.com"
    assert data["expires_at"]
    assert data["providers"] == ["google", "github"]
    assert data["terms_version"]["id"] == terms.id
    assert data["terms_version"]["version"] == "1.0"
    assert "ToS body" in data["terms_version"]["body_markdown"]


@pytest.mark.django_db
def test_preflight_404_for_unknown_token(client, terms):
    resp = client.get("/api/invites/no-such-token/")
    assert resp.status_code == 404
    assert resp.json() == {"error": "invalid_token"}


@pytest.mark.django_db
def test_preflight_410_for_expired(client, admin, terms):
    raw, _ = _create_invite(admin, expires_delta=timedelta(seconds=-1))
    resp = client.get(f"/api/invites/{raw}/")
    assert resp.status_code == 410
    body = resp.json()
    assert body["error"] == "expired"
    assert "expires_at" in body


@pytest.mark.django_db
def test_preflight_410_for_revoked(client, admin, terms):
    raw, _ = _create_invite(admin, status=Invite.Status.REVOKED)
    resp = client.get(f"/api/invites/{raw}/")
    assert resp.status_code == 410
    assert resp.json()["error"] == "revoked"


@pytest.mark.django_db
def test_preflight_410_for_already_used(client, admin, terms):
    raw, _ = _create_invite(admin, status=Invite.Status.ACCEPTED)
    resp = client.get(f"/api/invites/{raw}/")
    assert resp.status_code == 410
    assert resp.json()["error"] == "already_used"
