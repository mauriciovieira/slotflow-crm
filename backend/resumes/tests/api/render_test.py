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


def _ws(slug="ws-a"):
    return Workspace.objects.create(name=f"Workspace {slug}", slug=slug)


def _join(user, ws, role=MembershipRole.OWNER):
    return Membership.objects.create(user=user, workspace=ws, role=role)


def _version(ws, document):
    base = BaseResume.objects.create(workspace=ws, name="Senior Eng")
    return ResumeVersion.objects.create(
        base_resume=base,
        version_number=1,
        document=document,
        document_hash="x" * 64,
    )


def _client(user=None) -> APIClient:
    client = APIClient()
    if user is not None:
        client.force_authenticate(user=user)
    return client


def _render_url(base_pk, version_pk):
    return f"/api/resumes/{base_pk}/versions/{version_pk}/render/"


def test_anonymous_returns_403_or_401():
    response = _client().get(
        _render_url("00000000-0000-0000-0000-000000000000", "00000000-0000-0000-0000-000000000000")
    )
    assert response.status_code in (401, 403)


def test_render_happy_path_returns_html():
    alice = _user()
    ws = _ws()
    _join(alice, ws)
    v = _version(ws, {"basics": {"name": "Alice Example"}})

    response = _client(alice).get(_render_url(v.base_resume_id, v.pk))
    assert response.status_code == 200
    assert response["Content-Type"].startswith("text/html")
    assert response["Cache-Control"] == "no-store"
    body = response.content.decode("utf-8")
    assert "Alice Example" in body


def test_render_viewer_role_allowed():
    alice = _user()
    ws = _ws()
    _join(alice, ws, role=MembershipRole.VIEWER)
    v = _version(ws, {"basics": {"name": "Alice"}})

    response = _client(alice).get(_render_url(v.base_resume_id, v.pk))
    assert response.status_code == 200


def test_render_cross_workspace_returns_404():
    alice = _user("alice")
    bob = _user("bob")
    ws_b = _ws("ws-b")
    _join(bob, ws_b)
    v = _version(ws_b, {"basics": {"name": "Bob"}})

    response = _client(alice).get(_render_url(v.base_resume_id, v.pk))
    assert response.status_code == 404


def test_render_unknown_version_returns_404():
    alice = _user()
    ws = _ws()
    _join(alice, ws)
    base = BaseResume.objects.create(workspace=ws, name="Senior Eng")

    response = _client(alice).get(_render_url(base.pk, "00000000-0000-0000-0000-000000000000"))
    assert response.status_code == 404


def test_render_writes_audit_event():
    from audit.models import AuditEvent

    alice = _user()
    ws = _ws()
    _join(alice, ws)
    v = _version(ws, {"basics": {"name": "Alice"}})

    _client(alice).get(_render_url(v.base_resume_id, v.pk))

    events = list(AuditEvent.objects.filter(action="resume_version.rendered"))
    assert len(events) == 1
    assert events[0].metadata["source"] == "api"
    assert events[0].entity_id == str(v.pk)
