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
    )


@pytest.fixture
def terms(db):
    TermsVersion.objects.all().delete()
    return TermsVersion.objects.create(
        version="1.0",
        body="t",
        effective_at=timezone.now(),
    )


@pytest.fixture
def client():
    return APIClient()


def _make_invite(admin):
    raw, hashed = issue_token()
    Invite.objects.create(
        email="alice@x.com",
        token_hash=hashed,
        expires_at=timezone.now() + timedelta(days=7),
        status=Invite.Status.PENDING,
        created_by=admin,
    )
    return raw, hashed


@pytest.mark.django_db
@pytest.mark.parametrize("provider", ["google", "github"])
def test_oauth_start_returns_redirect_url_and_stashes_session(client, admin, terms, provider):
    raw, hashed = _make_invite(admin)
    resp = client.post(
        f"/api/invites/{raw}/oauth-start/",
        {
            "provider": provider,
            "workspace_name": "Alice WS",
            "terms_version_id": terms.id,
        },
        format="json",
    )
    assert resp.status_code == 200, resp.content
    assert resp.json() == {"redirect_url": f"/accounts/{provider}/login/"}

    s = client.session
    assert s["pending_invite_token_hash"] == hashed
    assert s["pending_invite_raw_token"] == raw
    assert s["workspace_name"] == "Alice WS"
    assert s["accepted_terms_version_id"] == terms.id


@pytest.mark.django_db
def test_oauth_start_422_unknown_provider(client, admin, terms):
    raw, _ = _make_invite(admin)
    resp = client.post(
        f"/api/invites/{raw}/oauth-start/",
        {
            "provider": "twitter",
            "workspace_name": "X X",
            "terms_version_id": terms.id,
        },
        format="json",
    )
    assert resp.status_code == 422
    assert "provider" in resp.json()


@pytest.mark.django_db
def test_oauth_start_410_for_expired(client, admin, terms):
    raw, hashed = issue_token()
    Invite.objects.create(
        email="x@x.com",
        token_hash=hashed,
        expires_at=timezone.now() - timedelta(seconds=1),
        status=Invite.Status.PENDING,
        created_by=admin,
    )
    resp = client.post(
        f"/api/invites/{raw}/oauth-start/",
        {
            "provider": "google",
            "workspace_name": "X X",
            "terms_version_id": terms.id,
        },
        format="json",
    )
    assert resp.status_code == 410
    assert resp.json()["error"] == "expired"


@pytest.mark.django_db
def test_oauth_start_404_for_unknown_token(client, terms):
    resp = client.post(
        "/api/invites/no-such/oauth-start/",
        {
            "provider": "google",
            "workspace_name": "X X",
            "terms_version_id": terms.id,
        },
        format="json",
    )
    assert resp.status_code == 404


@pytest.mark.django_db
def test_oauth_start_422_when_workspace_name_invalid(client, admin, terms):
    raw, _ = _make_invite(admin)
    resp = client.post(
        f"/api/invites/{raw}/oauth-start/",
        {"provider": "google", "workspace_name": "!!", "terms_version_id": terms.id},
        format="json",
    )
    assert resp.status_code == 422
    assert "workspace_name" in resp.json()
