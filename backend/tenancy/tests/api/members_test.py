from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from tenancy.models import Membership, MembershipRole, Workspace

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


def test_anon_get_members_returns_401_or_403():
    ws = _ws()
    response = _client().get(f"/api/workspaces/{ws.id}/members/")
    assert response.status_code in (401, 403)


def test_outsider_gets_404_for_member_list():
    a = _user("a")
    b = _user("b")
    ws = _ws()
    Membership.objects.create(user=a, workspace=ws, role=MembershipRole.OWNER)
    response = _client(b).get(f"/api/workspaces/{ws.id}/members/")
    assert response.status_code == 404


def test_member_can_list_workspace_members():
    a = _user("a")
    b = _user("b")
    ws = _ws()
    Membership.objects.create(user=a, workspace=ws, role=MembershipRole.OWNER)
    Membership.objects.create(user=b, workspace=ws, role=MembershipRole.MEMBER)
    body = _client(b).get(f"/api/workspaces/{ws.id}/members/").json()
    assert {row["username"] for row in body} == {"a", "b"}


def test_owner_can_change_role():
    a = _user("a")
    b = _user("b")
    ws = _ws()
    Membership.objects.create(user=a, workspace=ws, role=MembershipRole.OWNER)
    m_b = Membership.objects.create(user=b, workspace=ws, role=MembershipRole.MEMBER)
    response = _client(a).patch(
        f"/api/workspaces/{ws.id}/members/{m_b.id}/",
        {"role": "viewer"},
        format="json",
    )
    assert response.status_code == 200
    m_b.refresh_from_db()
    assert m_b.role == MembershipRole.VIEWER


def test_member_cannot_change_role():
    a = _user("a")
    b = _user("b")
    ws = _ws()
    Membership.objects.create(user=a, workspace=ws, role=MembershipRole.OWNER)
    m_b = Membership.objects.create(user=b, workspace=ws, role=MembershipRole.MEMBER)
    response = _client(b).patch(
        f"/api/workspaces/{ws.id}/members/{m_b.id}/",
        {"role": "owner"},
        format="json",
    )
    assert response.status_code == 403


def test_demote_last_owner_returns_409():
    a = _user("a")
    ws = _ws()
    m_a = Membership.objects.create(user=a, workspace=ws, role=MembershipRole.OWNER)
    response = _client(a).patch(
        f"/api/workspaces/{ws.id}/members/{m_a.id}/",
        {"role": "member"},
        format="json",
    )
    assert response.status_code == 409


def test_owner_can_remove_other_member():
    a = _user("a")
    b = _user("b")
    ws = _ws()
    Membership.objects.create(user=a, workspace=ws, role=MembershipRole.OWNER)
    m_b = Membership.objects.create(user=b, workspace=ws, role=MembershipRole.MEMBER)
    response = _client(a).delete(f"/api/workspaces/{ws.id}/members/{m_b.id}/")
    assert response.status_code == 204
    assert not Membership.objects.filter(pk=m_b.pk).exists()


def test_member_can_self_leave():
    a = _user("a")
    b = _user("b")
    ws = _ws()
    Membership.objects.create(user=a, workspace=ws, role=MembershipRole.OWNER)
    m_b = Membership.objects.create(user=b, workspace=ws, role=MembershipRole.MEMBER)
    response = _client(b).delete(f"/api/workspaces/{ws.id}/members/{m_b.id}/")
    assert response.status_code == 204


def test_member_cannot_remove_someone_else():
    a = _user("a")
    b = _user("b")
    c = _user("c")
    ws = _ws()
    Membership.objects.create(user=a, workspace=ws, role=MembershipRole.OWNER)
    m_b = Membership.objects.create(user=b, workspace=ws, role=MembershipRole.MEMBER)
    Membership.objects.create(user=c, workspace=ws, role=MembershipRole.MEMBER)
    response = _client(c).delete(f"/api/workspaces/{ws.id}/members/{m_b.id}/")
    assert response.status_code == 403


def test_remove_last_owner_returns_409():
    a = _user("a")
    ws = _ws()
    m_a = Membership.objects.create(user=a, workspace=ws, role=MembershipRole.OWNER)
    response = _client(a).delete(f"/api/workspaces/{ws.id}/members/{m_a.id}/")
    assert response.status_code == 409


def test_transfer_ownership_promotes_target_and_demotes_self():
    a = _user("a")
    b = _user("b")
    ws = _ws()
    Membership.objects.create(user=a, workspace=ws, role=MembershipRole.OWNER)
    m_b = Membership.objects.create(user=b, workspace=ws, role=MembershipRole.MEMBER)
    response = _client(a).post(
        f"/api/workspaces/{ws.id}/transfer-ownership/",
        {"to_membership_id": str(m_b.id)},
        format="json",
    )
    assert response.status_code == 200
    m_b.refresh_from_db()
    assert m_b.role == MembershipRole.OWNER
    a_membership = Membership.objects.get(user=a, workspace=ws)
    assert a_membership.role == MembershipRole.MEMBER


def test_transfer_ownership_demote_self_false_string_keeps_actor_owner():
    """`demote_self=False` must round-trip through JSON-as-string ("false").

    A naive `bool(value)` would treat the string "false" as truthy and
    incorrectly demote the actor. The view's `_parse_bool` handles this.
    """
    a = _user("a")
    b = _user("b")
    ws = _ws()
    Membership.objects.create(user=a, workspace=ws, role=MembershipRole.OWNER)
    m_b = Membership.objects.create(user=b, workspace=ws, role=MembershipRole.MEMBER)
    response = _client(a).post(
        f"/api/workspaces/{ws.id}/transfer-ownership/",
        {"to_membership_id": str(m_b.id), "demote_self": "false"},
        format="json",
    )
    assert response.status_code == 200
    Membership.objects.get(user=a, workspace=ws).refresh_from_db()
    a_membership = Membership.objects.get(user=a, workspace=ws)
    assert a_membership.role == MembershipRole.OWNER


def test_non_owner_cannot_transfer_ownership():
    a = _user("a")
    b = _user("b")
    ws = _ws()
    Membership.objects.create(user=a, workspace=ws, role=MembershipRole.OWNER)
    m_b = Membership.objects.create(user=b, workspace=ws, role=MembershipRole.MEMBER)
    response = _client(b).post(
        f"/api/workspaces/{ws.id}/transfer-ownership/",
        {"to_membership_id": str(m_b.id)},
        format="json",
    )
    assert response.status_code == 403
