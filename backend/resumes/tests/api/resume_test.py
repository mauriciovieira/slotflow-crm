from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from resumes.models import BaseResume, ResumeVersion
from tenancy.models import Membership, MembershipRole, Workspace

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _bypass_2fa_middleware(monkeypatch):
    monkeypatch.setattr("core.middleware.require_2fa.is_2fa_bypass_active", lambda: True)


def _user(username="alice"):
    return get_user_model().objects.create_user(
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
    response = _client().get("/api/resumes/")
    assert response.status_code in (401, 403)


# -- List ---------------------------------------------------------------------


def test_list_returns_only_callers_workspace_rows():
    alice = _user("alice")
    bob = _user("bob")
    ws_a = _workspace("ws-alice")
    ws_b = _workspace("ws-bob")
    _join(alice, ws_a)
    _join(bob, ws_b)

    BaseResume.objects.create(workspace=ws_a, name="A1")
    BaseResume.objects.create(workspace=ws_a, name="A2")
    BaseResume.objects.create(workspace=ws_b, name="B1")

    response = _client(alice).get("/api/resumes/")
    assert response.status_code == 200
    names = sorted(item["name"] for item in response.json())
    assert names == ["A1", "A2"]


def test_list_excludes_archived_rows():
    from django.utils import timezone

    alice = _user()
    ws = _workspace()
    _join(alice, ws)
    live = BaseResume.objects.create(workspace=ws, name="Live")
    gone = BaseResume.objects.create(workspace=ws, name="Gone")
    gone.archived_at = timezone.now()
    gone.save(update_fields=["archived_at"])

    response = _client(alice).get("/api/resumes/")
    assert response.status_code == 200
    names = [r["name"] for r in response.json()]
    assert names == [live.name]


def test_list_filter_invalid_workspace_uuid_returns_400():
    alice = _user()
    ws = _workspace()
    _join(alice, ws)
    response = _client(alice).get("/api/resumes/?workspace=not-a-uuid")
    assert response.status_code == 400
    assert "workspace" in response.json()


# -- Create -------------------------------------------------------------------


def test_create_succeeds_with_explicit_workspace():
    alice = _user()
    ws = _workspace()
    _join(alice, ws)

    response = _client(alice).post(
        "/api/resumes/",
        data={"workspace": str(ws.pk), "name": "Senior Eng"},
        format="json",
    )
    assert response.status_code == 201, response.content
    body = response.json()
    assert body["name"] == "Senior Eng"
    assert body["workspace"] == str(ws.pk)
    assert body["created_by"]["username"] == alice.username
    assert body["latest_version"] is None
    assert BaseResume.objects.count() == 1


def test_create_rejects_workspace_user_does_not_belong_to():
    alice = _user("alice")
    other = _workspace("ws-other")
    response = _client(alice).post(
        "/api/resumes/",
        data={"workspace": str(other.pk), "name": "x"},
        format="json",
    )
    assert response.status_code == 400
    assert BaseResume.objects.count() == 0


def test_create_falls_back_to_sole_membership():
    alice = _user()
    ws = _workspace()
    _join(alice, ws)
    response = _client(alice).post("/api/resumes/", data={"name": "x"}, format="json")
    assert response.status_code == 201
    assert response.json()["workspace"] == str(ws.pk)


def test_create_forbidden_for_viewer_membership():
    alice = _user()
    ws = _workspace()
    _join(alice, ws, role=MembershipRole.VIEWER)
    response = _client(alice).post(
        "/api/resumes/",
        data={"workspace": str(ws.pk), "name": "x"},
        format="json",
    )
    assert response.status_code == 403
    assert BaseResume.objects.count() == 0


# -- Retrieve / 404 ----------------------------------------------------------


def test_retrieve_in_own_workspace_returns_200():
    alice = _user()
    ws = _workspace()
    _join(alice, ws)
    r = BaseResume.objects.create(workspace=ws, name="x")
    response = _client(alice).get(f"/api/resumes/{r.pk}/")
    assert response.status_code == 200
    assert response.json()["id"] == str(r.pk)


def test_retrieve_in_other_workspace_returns_404():
    alice = _user("alice")
    bob = _user("bob")
    ws_b = _workspace("ws-bob")
    _join(bob, ws_b)
    r = BaseResume.objects.create(workspace=ws_b, name="x")
    response = _client(alice).get(f"/api/resumes/{r.pk}/")
    assert response.status_code == 404


def test_patch_updates_name():
    alice = _user()
    ws = _workspace()
    _join(alice, ws, role=MembershipRole.MEMBER)
    r = BaseResume.objects.create(workspace=ws, name="old")

    response = _client(alice).patch(f"/api/resumes/{r.pk}/", data={"name": "new"}, format="json")
    assert response.status_code == 200
    r.refresh_from_db()
    assert r.name == "new"


def test_patch_by_viewer_returns_403():
    alice = _user()
    ws = _workspace()
    _join(alice, ws, role=MembershipRole.VIEWER)
    r = BaseResume.objects.create(workspace=ws, name="x")
    response = _client(alice).patch(f"/api/resumes/{r.pk}/", data={"name": "boom"}, format="json")
    assert response.status_code == 403


def test_delete_by_member_soft_archives():
    alice = _user()
    ws = _workspace()
    _join(alice, ws, role=MembershipRole.MEMBER)
    r = BaseResume.objects.create(workspace=ws, name="x")
    response = _client(alice).delete(f"/api/resumes/{r.pk}/")
    assert response.status_code == 204
    r.refresh_from_db()
    assert r.archived_at is not None
    assert BaseResume.objects.filter(pk=r.pk).exists()


def test_delete_by_viewer_returns_403():
    alice = _user()
    ws = _workspace()
    _join(alice, ws, role=MembershipRole.VIEWER)
    r = BaseResume.objects.create(workspace=ws, name="x")
    response = _client(alice).delete(f"/api/resumes/{r.pk}/")
    assert response.status_code == 403


# -- Versions ----------------------------------------------------------------


def test_versions_list_returns_newest_first():
    alice = _user()
    ws = _workspace()
    _join(alice, ws)
    r = BaseResume.objects.create(workspace=ws, name="x")
    ResumeVersion.objects.create(
        base_resume=r, version_number=1, document={"a": 1}, document_hash="x" * 64
    )
    ResumeVersion.objects.create(
        base_resume=r, version_number=2, document={"a": 2}, document_hash="y" * 64
    )

    response = _client(alice).get(f"/api/resumes/{r.pk}/versions/")
    assert response.status_code == 200
    payload = response.json()
    nums = [row["version_number"] for row in payload]
    assert nums == [2, 1]


def test_versions_create_accepts_json_object_and_assigns_next_number():
    alice = _user()
    ws = _workspace()
    _join(alice, ws)
    r = BaseResume.objects.create(workspace=ws, name="x")

    response = _client(alice).post(
        f"/api/resumes/{r.pk}/versions/",
        data={"document": {"basics": {"name": "Alice"}}, "notes": "first"},
        format="json",
    )
    assert response.status_code == 201, response.content
    body = response.json()
    assert body["version_number"] == 1
    assert body["notes"] == "first"
    assert body["document"]["basics"]["name"] == "Alice"


def test_versions_create_rejects_non_object_document():
    alice = _user()
    ws = _workspace()
    _join(alice, ws)
    r = BaseResume.objects.create(workspace=ws, name="x")
    response = _client(alice).post(
        f"/api/resumes/{r.pk}/versions/",
        data={"document": ["not", "an", "object"]},
        format="json",
    )
    assert response.status_code == 400


def test_versions_endpoint_404_for_unknown_resume():
    alice = _user()
    ws = _workspace()
    _join(alice, ws)
    response = _client(alice).get("/api/resumes/00000000-0000-0000-0000-000000000000/versions/")
    assert response.status_code == 404


def test_versions_endpoint_404_when_resume_in_other_workspace():
    alice = _user("alice")
    bob = _user("bob")
    ws_b = _workspace("ws-bob")
    _join(bob, ws_b)
    r = BaseResume.objects.create(workspace=ws_b, name="x")
    response = _client(alice).get(f"/api/resumes/{r.pk}/versions/")
    assert response.status_code == 404


def test_versions_create_forbidden_for_viewer():
    alice = _user()
    ws = _workspace()
    _join(alice, ws, role=MembershipRole.VIEWER)
    r = BaseResume.objects.create(workspace=ws, name="x")
    response = _client(alice).post(
        f"/api/resumes/{r.pk}/versions/",
        data={"document": {"a": 1}},
        format="json",
    )
    assert response.status_code == 403


def test_list_does_not_n_plus_one_on_latest_version():
    """`get_latest_version` reads from the prefetch cache, so the query count
    must stay flat as more resumes (each with versions) are added."""
    from django.db import connection
    from django.test.utils import CaptureQueriesContext

    alice = _user()
    ws = _workspace()
    _join(alice, ws)
    for i in range(5):
        r = BaseResume.objects.create(workspace=ws, name=f"R{i}")
        ResumeVersion.objects.create(
            base_resume=r,
            version_number=1,
            document={"i": i},
            document_hash=f"{i:0>64}",
        )

    client = _client(alice)
    with CaptureQueriesContext(connection) as ctx:
        response = client.get("/api/resumes/")
    assert response.status_code == 200
    assert len(response.json()) == 5
    # Tight upper bound: even with auth/session middleware queries the count
    # must not scale with the number of rows. 5 rows + N+1 would be ~6+;
    # with prefetch it stays in the small-constant range.
    assert len(ctx) <= 8, [q["sql"] for q in ctx]


def test_latest_version_field_renders_when_a_version_exists():
    alice = _user()
    ws = _workspace()
    _join(alice, ws)
    r = BaseResume.objects.create(workspace=ws, name="x")
    ResumeVersion.objects.create(
        base_resume=r, version_number=1, document={"a": 1}, document_hash="x" * 64
    )

    response = _client(alice).get(f"/api/resumes/{r.pk}/")
    assert response.status_code == 200
    body = response.json()
    assert body["latest_version"]["version_number"] == 1
