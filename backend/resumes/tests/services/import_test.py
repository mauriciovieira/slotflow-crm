from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model

from resumes.models import BaseResume, ResumeVersion
from resumes.services import (
    WorkspaceMembershipRequired,
    WorkspaceWriteForbidden,
    create_resume_version,
    import_resume_json,
)
from tenancy.models import Membership, MembershipRole, Workspace

pytestmark = pytest.mark.django_db


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


def test_import_creates_version_and_writes_both_audit_rows():
    from audit.models import AuditEvent

    user = _user()
    ws = _ws()
    _join(user, ws)
    base = _base(ws)
    document = {"basics": {"name": "Alice"}}

    version = import_resume_json(actor=user, base_resume=base, document=document)
    assert version.version_number == 1
    assert version.created_by_id == user.pk

    created = list(AuditEvent.objects.filter(action="resume_version.created"))
    imported = list(AuditEvent.objects.filter(action="resume_version.imported"))
    assert len(created) == 1
    assert len(imported) == 1
    assert imported[0].metadata["source"] == "api"
    assert imported[0].metadata["base_resume_id"] == str(base.pk)
    assert imported[0].metadata["document_hash"] == version.document_hash


def test_import_rejects_non_member():
    user = _user("bob")
    ws = _ws()
    base = _base(ws)
    with pytest.raises(WorkspaceMembershipRequired):
        import_resume_json(actor=user, base_resume=base, document={})


def test_import_rejects_viewer():
    user = _user()
    ws = _ws()
    _join(user, ws, role=MembershipRole.VIEWER)
    base = _base(ws)
    with pytest.raises(WorkspaceWriteForbidden):
        import_resume_json(actor=user, base_resume=base, document={})


def test_import_with_actor_none_skips_membership_check_and_records_null_creator():
    """Management-command path: actor is None, the version's `created_by`
    reflects 'system', and the audit row carries `source: "command"`."""
    from audit.models import AuditEvent

    ws = _ws()
    base = _base(ws)

    version = import_resume_json(actor=None, base_resume=base, document={"x": 1}, source="command")
    assert version.created_by_id is None

    imported = list(AuditEvent.objects.filter(action="resume_version.imported"))
    assert len(imported) == 1
    assert imported[0].metadata["source"] == "command"


def test_import_hash_matches_create_for_identical_input():
    """The digest is the contract; an imported version and a manually-created
    version with the same document must hash to the same value."""
    user = _user()
    ws = _ws()
    _join(user, ws)
    base = _base(ws)
    document = {"basics": {"name": "Alice"}, "skills": ["Python"]}

    v_created = create_resume_version(actor=user, base_resume=base, document=document)
    v_imported = import_resume_json(actor=user, base_resume=base, document=document)

    assert v_created.document_hash == v_imported.document_hash
    assert v_imported.version_number == v_created.version_number + 1


def test_import_assigns_sequential_version_numbers():
    user = _user()
    ws = _ws()
    _join(user, ws)
    base = _base(ws)
    v1 = import_resume_json(actor=user, base_resume=base, document={"a": 1})
    v2 = import_resume_json(actor=user, base_resume=base, document={"a": 2})
    assert v1.version_number == 1
    assert v2.version_number == 2
    assert ResumeVersion.objects.filter(base_resume=base).count() == 2
