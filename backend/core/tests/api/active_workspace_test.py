from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from tenancy.models import Membership, MembershipRole, Workspace

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _bypass_2fa_middleware(monkeypatch):
    monkeypatch.setattr("core.middleware.require_2fa.is_2fa_bypass_active", lambda: True)


def _user(username="alice"):
    return get_user_model().objects.create_user(
        username=username, email=f"{username}@example.com", password="x"
    )


def _workspace(slug):
    return Workspace.objects.create(name=f"Workspace {slug}", slug=slug)


def _join(user, workspace, role=MembershipRole.OWNER):
    return Membership.objects.create(user=user, workspace=workspace, role=role)


def _client(user=None) -> APIClient:
    client = APIClient()
    if user is not None:
        client.force_authenticate(user=user)
    return client


def test_anonymous_get_returns_401_or_403():
    response = _client().get("/api/auth/active-workspace/")
    assert response.status_code in (401, 403)


def test_get_with_single_membership_returns_that_workspace_active():
    user = _user()
    ws = _workspace("ws-a")
    _join(user, ws)

    response = _client(user).get("/api/auth/active-workspace/")
    assert response.status_code == 200
    body = response.json()
    assert body["active"]["slug"] == "ws-a"
    assert [w["slug"] for w in body["available"]] == ["ws-a"]


def test_post_sets_active_workspace_for_member():
    user = _user()
    ws_a = _workspace("ws-a")
    ws_b = _workspace("ws-b")
    _join(user, ws_a)
    _join(user, ws_b)
    client = _client(user)

    response = client.post(
        "/api/auth/active-workspace/",
        data={"workspace": str(ws_b.pk)},
        format="json",
    )
    assert response.status_code == 200
    assert response.json()["active"]["slug"] == "ws-b"

    follow_up = client.get("/api/auth/active-workspace/")
    assert follow_up.json()["active"]["slug"] == "ws-b"


def test_post_for_non_member_workspace_returns_403():
    user = _user("alice")
    ws_other = _workspace("ws-other")

    response = _client(user).post(
        "/api/auth/active-workspace/",
        data={"workspace": str(ws_other.pk)},
        format="json",
    )
    assert response.status_code == 403


def test_post_with_missing_workspace_returns_400():
    user = _user()
    _join(user, _workspace("ws-a"))
    response = _client(user).post("/api/auth/active-workspace/", data={}, format="json")
    assert response.status_code == 400


def test_delete_clears_active_workspace_for_multi_membership_user():
    user = _user()
    ws_a = _workspace("ws-a")
    ws_b = _workspace("ws-b")
    _join(user, ws_a)
    _join(user, ws_b)
    client = _client(user)
    client.post("/api/auth/active-workspace/", data={"workspace": str(ws_b.pk)}, format="json")

    response = client.delete("/api/auth/active-workspace/")
    assert response.status_code == 204

    follow_up = client.get("/api/auth/active-workspace/")
    # Multi-membership user with nothing picked: active falls back to None.
    assert follow_up.json()["active"] is None


def test_create_opportunity_uses_session_active_workspace_for_multi_membership_user():
    """The opportunities API now consumes the session value when no body field."""
    from opportunities.models import Opportunity

    user = _user()
    ws_a = _workspace("ws-a")
    ws_b = _workspace("ws-b")
    _join(user, ws_a)
    _join(user, ws_b)
    client = _client(user)

    # Pick ws-b as active.
    client.post("/api/auth/active-workspace/", data={"workspace": str(ws_b.pk)}, format="json")

    # Create without an explicit `workspace` in the body.
    response = client.post(
        "/api/opportunities/",
        data={"title": "Staff Eng", "company": "Acme"},
        format="json",
    )
    assert response.status_code == 201, response.content
    opp = Opportunity.objects.get(pk=response.json()["id"])
    assert opp.workspace_id == ws_b.pk
