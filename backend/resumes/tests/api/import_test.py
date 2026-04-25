from __future__ import annotations

import io
import json

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


def _base(ws):
    return BaseResume.objects.create(workspace=ws, name="Senior Eng")


def _client(user=None) -> APIClient:
    client = APIClient()
    if user is not None:
        client.force_authenticate(user=user)
    return client


def _import_url(base_pk):
    return f"/api/resumes/{base_pk}/versions/import/"


def test_anonymous_returns_403_or_401():
    response = _client().post(_import_url("00000000-0000-0000-0000-000000000000"))
    assert response.status_code in (401, 403)


def test_json_body_happy_path():
    alice = _user()
    ws = _ws()
    _join(alice, ws)
    base = _base(ws)

    response = _client(alice).post(
        _import_url(base.pk),
        data={"document": {"basics": {"name": "Alice"}}, "notes": "manual paste"},
        format="json",
    )
    assert response.status_code == 201, response.content
    body = response.json()
    assert body["version_number"] == 1
    assert body["notes"] == "manual paste"


def test_multipart_file_happy_path():
    alice = _user()
    ws = _ws()
    _join(alice, ws)
    base = _base(ws)

    upload = io.BytesIO(json.dumps({"basics": {"name": "Alice"}}).encode("utf-8"))
    upload.name = "resume.json"
    response = _client(alice).post(
        _import_url(base.pk),
        data={"file": upload, "notes": "from file"},
        format="multipart",
    )
    assert response.status_code == 201, response.content
    body = response.json()
    assert body["version_number"] == 1
    assert body["notes"] == "from file"


def test_multipart_without_file_part_returns_400_under_file_key():
    """A multipart request without the `file` part used to fall through
    to the JSON branch and complain about a missing `document` — wrong
    field for a multipart caller. Surface under `file` instead."""
    alice = _user()
    ws = _ws()
    _join(alice, ws)
    base = _base(ws)

    response = _client(alice).post(
        _import_url(base.pk),
        data={"notes": "no file attached"},
        format="multipart",
    )
    assert response.status_code == 400
    body = response.json()
    assert "file" in body
    assert "document" not in body


def test_invalid_json_in_file_returns_400():
    alice = _user()
    ws = _ws()
    _join(alice, ws)
    base = _base(ws)
    upload = io.BytesIO(b"not json")
    upload.name = "resume.json"

    response = _client(alice).post(
        _import_url(base.pk),
        data={"file": upload},
        format="multipart",
    )
    assert response.status_code == 400
    assert "file" in response.json()


def test_multipart_file_with_non_object_json_returns_400_under_file_key():
    """When the upload parses but isn't a JSON object (e.g. a list), the
    error must surface under `file` (not `document`) so the FE can render
    it next to the file picker."""
    alice = _user()
    ws = _ws()
    _join(alice, ws)
    base = _base(ws)
    upload = io.BytesIO(json.dumps([1, 2, 3]).encode("utf-8"))
    upload.name = "resume.json"

    response = _client(alice).post(
        _import_url(base.pk),
        data={"file": upload},
        format="multipart",
    )
    assert response.status_code == 400
    body = response.json()
    assert "file" in body
    assert "document" not in body


def test_non_object_document_returns_400():
    alice = _user()
    ws = _ws()
    _join(alice, ws)
    base = _base(ws)
    response = _client(alice).post(
        _import_url(base.pk),
        data={"document": ["not", "an", "object"]},
        format="json",
    )
    assert response.status_code == 400


def test_missing_payload_returns_400():
    alice = _user()
    ws = _ws()
    _join(alice, ws)
    base = _base(ws)
    response = _client(alice).post(_import_url(base.pk), data={}, format="json")
    assert response.status_code == 400
    assert "document" in response.json()


def test_viewer_returns_403():
    alice = _user()
    ws = _ws()
    _join(alice, ws, role=MembershipRole.VIEWER)
    base = _base(ws)
    response = _client(alice).post(
        _import_url(base.pk),
        data={"document": {"a": 1}},
        format="json",
    )
    assert response.status_code == 403


def test_other_workspace_base_returns_404():
    alice = _user("alice")
    bob = _user("bob")
    ws_b = _ws("ws-b")
    _join(bob, ws_b)
    base_b = _base(ws_b)
    response = _client(alice).post(
        _import_url(base_b.pk),
        data={"document": {"a": 1}},
        format="json",
    )
    assert response.status_code == 404


def test_json_body_top_level_array_returns_400_with_clear_message():
    """A non-object request body shouldn't fall through to the
    'Provide `document`...' cascade — it gets a clear top-level error."""
    alice = _user()
    ws = _ws()
    _join(alice, ws)
    base = _base(ws)
    response = _client(alice).post(
        _import_url(base.pk),
        data=[1, 2, 3],
        format="json",
    )
    assert response.status_code == 400
    assert "non_field_errors" in response.json()


def test_json_body_non_string_notes_returns_400():
    """A non-string `notes` should fail loudly instead of being silently
    dropped — otherwise debugging a malformed payload is harder."""
    alice = _user()
    ws = _ws()
    _join(alice, ws)
    base = _base(ws)
    response = _client(alice).post(
        _import_url(base.pk),
        data={"document": {"a": 1}, "notes": 123},
        format="json",
    )
    assert response.status_code == 400
    assert "notes" in response.json()


def test_audit_records_imported_action():
    from audit.models import AuditEvent

    alice = _user()
    ws = _ws()
    _join(alice, ws)
    base = _base(ws)
    _client(alice).post(
        _import_url(base.pk),
        data={"document": {"a": 1}},
        format="json",
    )
    events = list(AuditEvent.objects.filter(action="resume_version.imported"))
    assert len(events) == 1
    assert events[0].metadata["source"] == "api"
    assert ResumeVersion.objects.filter(base_resume=base).count() == 1
