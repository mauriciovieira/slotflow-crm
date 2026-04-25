from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model

from resumes.models import BaseResume, ResumeVersion
from resumes.services import (
    WorkspaceMembershipRequired,
    WorkspaceWriteForbidden,
    archive_resume,
    create_resume,
    create_resume_version,
)
from tenancy.models import Membership, MembershipRole, Workspace

pytestmark = pytest.mark.django_db


def _user(username="alice"):
    User = get_user_model()
    return User.objects.create_user(
        username=username, email=f"{username}@example.com", password="x"
    )


def _workspace(slug="ws-a"):
    return Workspace.objects.create(name=f"Workspace {slug}", slug=slug)


def _join(user, workspace, role=MembershipRole.OWNER):
    return Membership.objects.create(user=user, workspace=workspace, role=role)


def test_create_resume_in_member_workspace():
    user = _user()
    ws = _workspace()
    _join(user, ws)

    resume = create_resume(actor=user, workspace=ws, name="Senior Eng")

    assert resume.pk is not None
    assert resume.workspace_id == ws.pk
    assert resume.created_by_id == user.pk
    assert resume.archived_at is None


def test_create_resume_rejects_non_member():
    user = _user("bob")
    ws = _workspace()

    with pytest.raises(WorkspaceMembershipRequired):
        create_resume(actor=user, workspace=ws, name="x")
    assert BaseResume.objects.count() == 0


def test_create_resume_rejects_viewer():
    user = _user()
    ws = _workspace()
    _join(user, ws, role=MembershipRole.VIEWER)

    with pytest.raises(WorkspaceWriteForbidden):
        create_resume(actor=user, workspace=ws, name="x")
    assert BaseResume.objects.count() == 0


def test_archive_resume_sets_archived_at_and_is_idempotent():
    user = _user()
    ws = _workspace()
    _join(user, ws)
    resume = create_resume(actor=user, workspace=ws, name="x")
    assert resume.archived_at is None

    archived = archive_resume(actor=user, base_resume=resume)
    first_stamp = archived.archived_at
    assert first_stamp is not None

    archive_resume(actor=user, base_resume=archived)
    archived.refresh_from_db()
    assert archived.archived_at == first_stamp


def test_archive_resume_rejects_viewer():
    owner = _user("owner")
    viewer = _user("viewer")
    ws = _workspace()
    _join(owner, ws)
    _join(viewer, ws, role=MembershipRole.VIEWER)
    resume = create_resume(actor=owner, workspace=ws, name="x")

    with pytest.raises(WorkspaceWriteForbidden):
        archive_resume(actor=viewer, base_resume=resume)
    resume.refresh_from_db()
    assert resume.archived_at is None


def test_create_resume_version_assigns_sequential_numbers():
    user = _user()
    ws = _workspace()
    _join(user, ws)
    resume = create_resume(actor=user, workspace=ws, name="x")

    v1 = create_resume_version(actor=user, base_resume=resume, document={"basics": {"name": "A"}})
    v2 = create_resume_version(actor=user, base_resume=resume, document={"basics": {"name": "B"}})

    assert v1.version_number == 1
    assert v2.version_number == 2
    assert v1.document_hash != v2.document_hash


def test_create_resume_version_computes_sha256_hash():
    import hashlib
    import json

    user = _user()
    ws = _workspace()
    _join(user, ws)
    resume = create_resume(actor=user, workspace=ws, name="x")
    document = {"basics": {"name": "Alice"}, "skills": ["Python"]}

    version = create_resume_version(actor=user, base_resume=resume, document=document)
    expected = hashlib.sha256(json.dumps(document, sort_keys=True).encode("utf-8")).hexdigest()
    assert version.document_hash == expected


def test_create_resume_version_rejects_non_member():
    owner = _user("owner")
    intruder = _user("intruder")
    ws = _workspace()
    _join(owner, ws)
    resume = create_resume(actor=owner, workspace=ws, name="x")

    with pytest.raises(WorkspaceMembershipRequired):
        create_resume_version(actor=intruder, base_resume=resume, document={})
    assert ResumeVersion.objects.count() == 0


def test_create_resume_version_rejects_viewer():
    owner = _user("owner")
    viewer = _user("viewer")
    ws = _workspace()
    _join(owner, ws)
    _join(viewer, ws, role=MembershipRole.VIEWER)
    resume = create_resume(actor=owner, workspace=ws, name="x")

    with pytest.raises(WorkspaceWriteForbidden):
        create_resume_version(actor=viewer, base_resume=resume, document={})


def test_document_hash_does_not_silently_coerce_non_json_types():
    """`_document_hash` must NOT use `default=str` — a non-JSON-serializable
    document needs to fail loudly so the digest matches what `JSONField`
    will store. Coercion would let through values that the DB would reject
    or store with a different shape than the hash represents."""
    import datetime

    user = _user()
    ws = _workspace()
    _join(user, ws)
    resume = create_resume(actor=user, workspace=ws, name="x")

    # `datetime` is the canonical "looks JSON-ish but isn't" value.
    with pytest.raises(TypeError):
        create_resume_version(
            actor=user,
            base_resume=resume,
            document={"when": datetime.datetime(2026, 1, 1)},
        )


def test_archive_resume_returns_fresh_instance_state():
    """`archive_resume` must return the caller's instance fully refreshed,
    not just `archived_at`. Other fields (e.g. `updated_at`) get bumped by
    the lock+save and the caller would otherwise see a stale row."""
    user = _user()
    ws = _workspace()
    _join(user, ws)
    resume = create_resume(actor=user, workspace=ws, name="x")
    initial_updated_at = resume.updated_at

    archived = archive_resume(actor=user, base_resume=resume)
    assert archived is resume  # identity preserved (caller's reference)
    assert archived.archived_at is not None
    assert archived.updated_at >= initial_updated_at


def test_create_resume_writes_audit_event():
    from audit.models import AuditEvent

    user = _user()
    ws = _workspace()
    _join(user, ws)
    resume = create_resume(actor=user, workspace=ws, name="Senior Eng")

    events = list(AuditEvent.objects.filter(action="resume.created"))
    assert len(events) == 1
    event = events[0]
    assert event.workspace_id == ws.pk
    assert event.entity_type == "resumes.BaseResume"
    assert event.entity_id == str(resume.pk)
    assert event.metadata == {"name": "Senior Eng"}


def test_archive_resume_writes_audit_with_already_archived_flag():
    from audit.models import AuditEvent

    user = _user()
    ws = _workspace()
    _join(user, ws)
    resume = create_resume(actor=user, workspace=ws, name="x")
    archive_resume(actor=user, base_resume=resume)
    archive_resume(actor=user, base_resume=resume)

    events = list(AuditEvent.objects.filter(action="resume.archived").order_by("created_at"))
    assert len(events) == 2
    assert events[0].metadata["already_archived"] is False
    assert events[1].metadata["already_archived"] is True


def test_create_resume_version_writes_audit_event():
    from audit.models import AuditEvent

    user = _user()
    ws = _workspace()
    _join(user, ws)
    resume = create_resume(actor=user, workspace=ws, name="x")
    version = create_resume_version(
        actor=user, base_resume=resume, document={"basics": {"name": "A"}}
    )

    events = list(AuditEvent.objects.filter(action="resume_version.created"))
    assert len(events) == 1
    event = events[0]
    assert event.entity_type == "resumes.ResumeVersion"
    assert event.entity_id == str(version.pk)
    assert event.workspace_id == ws.pk
    assert event.metadata["base_resume_id"] == str(resume.pk)
    assert event.metadata["version_number"] == 1
    assert event.metadata["document_hash"] == version.document_hash
