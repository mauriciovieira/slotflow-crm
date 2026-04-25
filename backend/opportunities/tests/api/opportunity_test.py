from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from opportunities.models import Opportunity, OpportunityStage
from tenancy.models import Membership, MembershipRole, Workspace

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _bypass_2fa_middleware(monkeypatch):
    """Skip the 2FA gate for these API tests.

    `Require2FAMiddleware` redirects authenticated-but-unverified users to
    `/2fa/setup/`. The dev bypass flag short-circuits that check; force it
    on at the middleware import site so a freshly authenticated test client
    can call the API without computing TOTP.
    """
    monkeypatch.setattr("core.middleware.require_2fa.is_2fa_bypass_active", lambda: True)


def _user(username="alice"):
    User = get_user_model()
    return User.objects.create_user(
        username=username, email=f"{username}@example.com", password="x"
    )


def _workspace(slug="ws-a"):
    return Workspace.objects.create(name=f"Workspace {slug}", slug=slug)


def _join(user, ws, role=MembershipRole.OWNER):
    return Membership.objects.create(user=user, workspace=ws, role=role)


def _client(user=None) -> APIClient:
    client = APIClient()
    if user is not None:
        client.force_authenticate(user=user)
    return client


# -- Auth gate ----------------------------------------------------------------


def test_anonymous_list_returns_403_or_401():
    response = _client().get("/api/opportunities/")
    assert response.status_code in (401, 403)


# -- List ---------------------------------------------------------------------


def test_list_returns_only_callers_workspace_rows():
    alice = _user("alice")
    bob = _user("bob")
    ws_alice = _workspace("ws-alice")
    ws_bob = _workspace("ws-bob")
    _join(alice, ws_alice)
    _join(bob, ws_bob)

    Opportunity.objects.create(workspace=ws_alice, title="A1", company="Acme")
    Opportunity.objects.create(workspace=ws_alice, title="A2", company="Acme")
    Opportunity.objects.create(workspace=ws_bob, title="B1", company="Other")

    response = _client(alice).get("/api/opportunities/")
    assert response.status_code == 200
    titles = sorted(item["title"] for item in response.json())
    assert titles == ["A1", "A2"]


def test_list_excludes_archived_rows():
    alice = _user()
    ws = _workspace()
    _join(alice, ws)
    live = Opportunity.objects.create(workspace=ws, title="Live", company="Acme")
    archived = Opportunity.objects.create(workspace=ws, title="Gone", company="Acme")
    from django.utils import timezone

    archived.archived_at = timezone.now()
    archived.save(update_fields=["archived_at"])

    response = _client(alice).get("/api/opportunities/")
    assert response.status_code == 200
    titles = [row["title"] for row in response.json()]
    assert titles == [live.title]


def test_list_filters_by_stage():
    alice = _user()
    ws = _workspace()
    _join(alice, ws)
    Opportunity.objects.create(
        workspace=ws, title="A", company="Acme", stage=OpportunityStage.APPLIED
    )
    Opportunity.objects.create(
        workspace=ws, title="B", company="Acme", stage=OpportunityStage.INTERVIEW
    )

    response = _client(alice).get("/api/opportunities/?stage=interview")
    assert response.status_code == 200
    payload = response.json()
    assert len(payload) == 1
    assert payload[0]["title"] == "B"


def test_list_q_search_matches_title_or_company_case_insensitive():
    alice = _user()
    ws = _workspace()
    _join(alice, ws)
    Opportunity.objects.create(workspace=ws, title="Staff Engineer", company="Acme")
    Opportunity.objects.create(workspace=ws, title="Designer", company="Staff & Co")
    Opportunity.objects.create(workspace=ws, title="Other", company="Different")

    response = _client(alice).get("/api/opportunities/?q=staff")
    assert response.status_code == 200
    titles = sorted(row["title"] for row in response.json())
    assert titles == ["Designer", "Staff Engineer"]


# -- Create -------------------------------------------------------------------


def test_create_succeeds_with_explicit_workspace():
    alice = _user()
    ws = _workspace()
    _join(alice, ws)

    response = _client(alice).post(
        "/api/opportunities/",
        data={"workspace": str(ws.pk), "title": "Staff Eng", "company": "Acme"},
        format="json",
    )
    assert response.status_code == 201, response.content
    body = response.json()
    assert body["title"] == "Staff Eng"
    assert body["workspace"] == str(ws.pk)
    assert body["created_by"]["username"] == alice.username
    assert Opportunity.objects.count() == 1


def test_create_rejects_workspace_user_does_not_belong_to():
    alice = _user("alice")
    other = _workspace("ws-other")
    response = _client(alice).post(
        "/api/opportunities/",
        data={"workspace": str(other.pk), "title": "x", "company": "y"},
        format="json",
    )
    assert response.status_code == 400
    assert "workspace" in response.json()
    assert Opportunity.objects.count() == 0


def test_create_falls_back_to_sole_membership_when_workspace_omitted():
    alice = _user()
    ws = _workspace()
    _join(alice, ws)

    response = _client(alice).post(
        "/api/opportunities/", data={"title": "x", "company": "y"}, format="json"
    )
    assert response.status_code == 201
    assert response.json()["workspace"] == str(ws.pk)


def test_create_requires_workspace_when_user_has_multiple_memberships():
    alice = _user()
    _join(alice, _workspace("ws-1"))
    _join(alice, _workspace("ws-2"))

    response = _client(alice).post(
        "/api/opportunities/", data={"title": "x", "company": "y"}, format="json"
    )
    assert response.status_code == 400
    assert "workspace" in response.json()


def test_create_forbidden_for_viewer_membership():
    alice = _user()
    ws = _workspace()
    _join(alice, ws, role=MembershipRole.VIEWER)

    response = _client(alice).post(
        "/api/opportunities/",
        data={"workspace": str(ws.pk), "title": "Staff Eng", "company": "Acme"},
        format="json",
    )
    assert response.status_code == 403
    assert Opportunity.objects.count() == 0


def test_list_filter_invalid_workspace_uuid_returns_400():
    alice = _user()
    ws = _workspace()
    _join(alice, ws)

    response = _client(alice).get("/api/opportunities/?workspace=not-a-uuid")
    assert response.status_code == 400
    assert "workspace" in response.json()


def test_patch_cannot_change_workspace():
    alice = _user()
    ws_a = _workspace("ws-a")
    ws_b = _workspace("ws-b")
    _join(alice, ws_a)
    _join(alice, ws_b)
    opp = Opportunity.objects.create(workspace=ws_a, title="x", company="y")

    response = _client(alice).patch(
        f"/api/opportunities/{opp.pk}/",
        data={"workspace": str(ws_b.pk), "notes": "moved"},
        format="json",
    )
    assert response.status_code == 200
    opp.refresh_from_db()
    # Workspace is write-once: PATCH must not move the row across workspaces.
    assert opp.workspace_id == ws_a.pk
    assert opp.notes == "moved"


def test_retrieve_serializes_null_created_by():
    alice = _user()
    ws = _workspace()
    _join(alice, ws)
    opp = Opportunity.objects.create(workspace=ws, title="x", company="y", created_by=None)

    response = _client(alice).get(f"/api/opportunities/{opp.pk}/")
    assert response.status_code == 200
    assert response.json()["created_by"] is None


# -- Retrieve / 404 cross-workspace ------------------------------------------


def test_retrieve_in_own_workspace_returns_200():
    alice = _user()
    ws = _workspace()
    _join(alice, ws)
    opp = Opportunity.objects.create(workspace=ws, title="x", company="y")

    response = _client(alice).get(f"/api/opportunities/{opp.pk}/")
    assert response.status_code == 200
    assert response.json()["id"] == str(opp.pk)


def test_retrieve_in_other_workspace_returns_404():
    alice = _user("alice")
    bob = _user("bob")
    ws_bob = _workspace("ws-bob")
    _join(bob, ws_bob)
    opp = Opportunity.objects.create(workspace=ws_bob, title="x", company="y")

    response = _client(alice).get(f"/api/opportunities/{opp.pk}/")
    assert response.status_code == 404


# -- Patch (role gates) -------------------------------------------------------


def test_partial_update_by_member_succeeds():
    alice = _user()
    ws = _workspace()
    _join(alice, ws, role=MembershipRole.MEMBER)
    opp = Opportunity.objects.create(workspace=ws, title="x", company="y")

    response = _client(alice).patch(
        f"/api/opportunities/{opp.pk}/",
        data={"stage": OpportunityStage.INTERVIEW.value},
        format="json",
    )
    assert response.status_code == 200
    opp.refresh_from_db()
    assert opp.stage == OpportunityStage.INTERVIEW


def test_partial_update_by_viewer_returns_403():
    alice = _user()
    ws = _workspace()
    _join(alice, ws, role=MembershipRole.VIEWER)
    opp = Opportunity.objects.create(workspace=ws, title="x", company="y")

    response = _client(alice).patch(
        f"/api/opportunities/{opp.pk}/", data={"notes": "boom"}, format="json"
    )
    assert response.status_code == 403


# -- Delete (soft) ------------------------------------------------------------


def test_delete_by_member_soft_archives():
    alice = _user()
    ws = _workspace()
    _join(alice, ws, role=MembershipRole.MEMBER)
    opp = Opportunity.objects.create(workspace=ws, title="x", company="y")

    response = _client(alice).delete(f"/api/opportunities/{opp.pk}/")
    assert response.status_code == 204
    opp.refresh_from_db()
    assert opp.archived_at is not None
    assert Opportunity.objects.filter(pk=opp.pk).exists()


def test_delete_by_viewer_returns_403():
    alice = _user()
    ws = _workspace()
    _join(alice, ws, role=MembershipRole.VIEWER)
    opp = Opportunity.objects.create(workspace=ws, title="x", company="y")

    response = _client(alice).delete(f"/api/opportunities/{opp.pk}/")
    assert response.status_code == 403
    opp.refresh_from_db()
    assert opp.archived_at is None
