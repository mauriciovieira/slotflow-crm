from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from tenancy.models import Invitation, Membership, MembershipRole, Workspace
from tenancy.services import create_invitation, revoke_invitation

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _bypass_2fa_middleware(monkeypatch):
    monkeypatch.setattr("core.middleware.require_2fa.is_2fa_bypass_active", lambda: True)


def _user(name="alice"):
    return get_user_model().objects.create_user(
        username=name, email=f"{name}@example.com", password="x"
    )


def _ws(slug="ws-a"):
    return Workspace.objects.create(name=f"Workspace {slug}", slug=slug)


def _client(user=None) -> APIClient:
    c = APIClient()
    if user is not None:
        c.force_authenticate(user)
    return c


def test_owner_can_create_invitation_and_token_is_returned_once():
    a = _user("a")
    ws = _ws()
    Membership.objects.create(user=a, workspace=ws, role=MembershipRole.OWNER)
    response = _client(a).post(
        f"/api/workspaces/{ws.id}/invitations/",
        {"email": "x@example.com", "role": "member"},
        format="json",
    )
    assert response.status_code == 201
    body = response.json()
    assert body["email"] == "x@example.com"
    assert body["role"] == "member"
    assert "token" in body
    inv = Invitation.objects.get(pk=body["id"])
    assert inv.token == body["token"]


def test_subsequent_invitation_list_does_not_leak_token():
    a = _user("a")
    ws = _ws()
    Membership.objects.create(user=a, workspace=ws, role=MembershipRole.OWNER)
    create_invitation(actor=a, workspace=ws, email="x@example.com")
    body = _client(a).get(f"/api/workspaces/{ws.id}/invitations/").json()
    assert body
    assert "token" not in body[0]


def test_member_cannot_create_invitation():
    a = _user("a")
    b = _user("b")
    ws = _ws()
    Membership.objects.create(user=a, workspace=ws, role=MembershipRole.OWNER)
    Membership.objects.create(user=b, workspace=ws, role=MembershipRole.MEMBER)
    response = _client(b).post(
        f"/api/workspaces/{ws.id}/invitations/",
        {"email": "x@example.com"},
        format="json",
    )
    assert response.status_code == 403


def test_create_invitation_for_existing_member_returns_409():
    a = _user("a")
    b = _user("b")
    ws = _ws()
    Membership.objects.create(user=a, workspace=ws, role=MembershipRole.OWNER)
    Membership.objects.create(user=b, workspace=ws, role=MembershipRole.MEMBER)
    response = _client(a).post(
        f"/api/workspaces/{ws.id}/invitations/",
        {"email": "b@example.com"},
        format="json",
    )
    assert response.status_code == 409


def test_revoke_invitation_returns_204():
    a = _user("a")
    ws = _ws()
    Membership.objects.create(user=a, workspace=ws, role=MembershipRole.OWNER)
    inv = create_invitation(actor=a, workspace=ws, email="x@example.com")
    response = _client(a).delete(f"/api/workspaces/{ws.id}/invitations/{inv.id}/")
    assert response.status_code == 204
    inv.refresh_from_db()
    assert inv.revoked_at is not None


def test_listing_excludes_revoked_invites():
    a = _user("a")
    ws = _ws()
    Membership.objects.create(user=a, workspace=ws, role=MembershipRole.OWNER)
    inv = create_invitation(actor=a, workspace=ws, email="x@example.com")
    revoke_invitation(actor=a, invitation=inv)
    body = _client(a).get(f"/api/workspaces/{ws.id}/invitations/").json()
    assert body == []


def test_accept_invitation_creates_membership_and_returns_role():
    a = _user("a")
    bob = _user("bob")
    ws = _ws()
    Membership.objects.create(user=a, workspace=ws, role=MembershipRole.OWNER)
    inv = create_invitation(actor=a, workspace=ws, email="bob@example.com", role="viewer")

    response = _client(bob).post(f"/api/invitations/{inv.token}/accept/")
    assert response.status_code == 200
    assert response.json()["role"] == "viewer"
    assert Membership.objects.filter(user=bob, workspace=ws).exists()


def test_invitations_list_excludes_expired_rows():
    from datetime import timedelta

    from django.utils import timezone

    a = _user("a")
    ws = _ws()
    Membership.objects.create(user=a, workspace=ws, role=MembershipRole.OWNER)
    fresh = create_invitation(actor=a, workspace=ws, email="fresh@example.com")
    expired = create_invitation(actor=a, workspace=ws, email="expired@example.com")
    Invitation.objects.filter(pk=expired.pk).update(expires_at=timezone.now() - timedelta(days=1))

    body = _client(a).get(f"/api/workspaces/{ws.id}/invitations/").json()
    emails = [row["email"] for row in body]
    assert emails == [fresh.email]


def test_revoke_already_accepted_invitation_returns_409():
    a = _user("a")
    bob = _user("bob")
    ws = _ws()
    Membership.objects.create(user=a, workspace=ws, role=MembershipRole.OWNER)
    inv = create_invitation(actor=a, workspace=ws, email="bob@example.com")
    _client(bob).post(f"/api/invitations/{inv.token}/accept/")
    response = _client(a).delete(f"/api/workspaces/{ws.id}/invitations/{inv.id}/")
    assert response.status_code == 409


def test_accept_invitation_revoked_returns_409():
    a = _user("a")
    bob = _user("bob")
    ws = _ws()
    Membership.objects.create(user=a, workspace=ws, role=MembershipRole.OWNER)
    inv = create_invitation(actor=a, workspace=ws, email="bob@example.com")
    revoke_invitation(actor=a, invitation=inv)
    response = _client(bob).post(f"/api/invitations/{inv.token}/accept/")
    assert response.status_code == 409
