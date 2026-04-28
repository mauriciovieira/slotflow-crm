from __future__ import annotations

from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

from audit.models import AuditEvent
from core.models import TermsVersion
from invites.models import Invite
from invites.services.tokens import issue_token
from tenancy.models import Membership, MembershipRole, Workspace


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


def _create_invite(
    admin,
    *,
    email="alice@x.com",
    expires_delta=timedelta(days=7),
    status=Invite.Status.PENDING,
):
    raw, hashed = issue_token()
    inv = Invite.objects.create(
        email=email,
        token_hash=hashed,
        expires_at=timezone.now() + expires_delta,
        status=status,
        created_by=admin,
    )
    return raw, inv


def _payload(terms_id, **overrides):
    base = {
        "password": "Sup3r-Secret-Pw!",
        "workspace_name": "Alice's Workspace",
        "terms_version_id": terms_id,
    }
    base.update(overrides)
    return base


@pytest.mark.django_db
def test_accept_password_creates_user_workspace_membership(client, admin, terms):
    raw, inv = _create_invite(admin)
    resp = client.post(
        f"/api/invites/{raw}/accept-password/",
        _payload(terms.id),
        format="json",
    )
    assert resp.status_code == 200, resp.content
    assert resp.json() == {"next": "/2fa/setup"}

    inv.refresh_from_db()
    assert inv.status == Invite.Status.ACCEPTED
    assert inv.accepted_by is not None
    assert inv.workspace is not None

    user = get_user_model().objects.get(email__iexact="alice@x.com")
    assert user.username == "alice@x.com"
    assert user.check_password("Sup3r-Secret-Pw!")
    assert user.accepted_terms_version_id == terms.id
    assert user.accepted_terms_at is not None

    ws = Workspace.objects.get(pk=inv.workspace_id)
    assert ws.name == "Alice's Workspace"
    assert Membership.objects.filter(
        user=user,
        workspace=ws,
        role=MembershipRole.OWNER,
    ).exists()


@pytest.mark.django_db
def test_accept_password_logs_user_in(client, admin, terms):
    raw, _ = _create_invite(admin)
    client.post(
        f"/api/invites/{raw}/accept-password/",
        _payload(terms.id),
        format="json",
    )
    me = client.get("/api/auth/me/")
    assert me.status_code == 200
    assert me.json()["authenticated"] is True
    assert me.json()["username"] == "alice@x.com"


@pytest.mark.django_db
def test_accept_password_writes_audit_events(client, admin, terms):
    raw, inv = _create_invite(admin)
    client.post(
        f"/api/invites/{raw}/accept-password/",
        _payload(terms.id),
        format="json",
    )

    actions = list(
        AuditEvent.objects.filter(entity_type__in=("invites.Invite", "identity.User")).values_list(
            "action", flat=True
        )
    )
    assert "invite.accepted" in actions
    assert "user.created" in actions
    assert "terms.accepted" in actions


@pytest.mark.django_db
def test_accept_password_410_when_expired(client, admin, terms):
    raw, _ = _create_invite(admin, expires_delta=timedelta(seconds=-1))
    resp = client.post(
        f"/api/invites/{raw}/accept-password/",
        _payload(terms.id),
        format="json",
    )
    assert resp.status_code == 410
    assert resp.json()["error"] == "expired"


@pytest.mark.django_db
def test_accept_password_410_when_already_accepted(client, admin, terms):
    raw, _ = _create_invite(admin, status=Invite.Status.ACCEPTED)
    resp = client.post(
        f"/api/invites/{raw}/accept-password/",
        _payload(terms.id),
        format="json",
    )
    assert resp.status_code == 410
    assert resp.json()["error"] == "already_used"


@pytest.mark.django_db
def test_accept_password_410_when_revoked(client, admin, terms):
    raw, _ = _create_invite(admin, status=Invite.Status.REVOKED)
    resp = client.post(
        f"/api/invites/{raw}/accept-password/",
        _payload(terms.id),
        format="json",
    )
    assert resp.status_code == 410
    assert resp.json()["error"] == "revoked"


@pytest.mark.django_db
def test_accept_password_409_when_user_with_email_exists(client, admin, terms):
    get_user_model().objects.create_user(
        username="alice@x.com",
        email="alice@x.com",
        password="x",
    )
    raw, _ = _create_invite(admin)
    resp = client.post(
        f"/api/invites/{raw}/accept-password/",
        _payload(terms.id),
        format="json",
    )
    assert resp.status_code == 409
    assert resp.json()["error"] == "user_exists"
    actions = list(
        AuditEvent.objects.filter(action="invite.rejected_user_exists").values_list(
            "action", flat=True
        )
    )
    assert actions == ["invite.rejected_user_exists"]


@pytest.mark.django_db
def test_accept_password_422_when_password_too_short(client, admin, terms):
    raw, _ = _create_invite(admin)
    resp = client.post(
        f"/api/invites/{raw}/accept-password/",
        _payload(terms.id, password="x"),
        format="json",
    )
    assert resp.status_code == 422
    assert "password" in resp.json()


@pytest.mark.django_db
def test_accept_password_422_when_terms_version_stale(client, admin, terms):
    raw, _ = _create_invite(admin)
    TermsVersion.objects.create(
        version="2.0",
        body="newer",
        effective_at=timezone.now(),
    )
    resp = client.post(
        f"/api/invites/{raw}/accept-password/",
        _payload(terms.id),
        format="json",
    )
    assert resp.status_code == 422
    assert "terms_version_id" in resp.json()


@pytest.mark.django_db
def test_accept_password_422_when_workspace_name_invalid(client, admin, terms):
    raw, _ = _create_invite(admin)
    resp = client.post(
        f"/api/invites/{raw}/accept-password/",
        _payload(terms.id, workspace_name="!!"),
        format="json",
    )
    assert resp.status_code == 422
    assert "workspace_name" in resp.json()
