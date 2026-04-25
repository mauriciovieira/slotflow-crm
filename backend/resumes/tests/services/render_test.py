from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model

from resumes.models import BaseResume, ResumeVersion
from resumes.services import (
    WorkspaceMembershipRequired,
    render_resume_version_html,
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


def _version(ws, document):
    base = BaseResume.objects.create(workspace=ws, name="Senior Eng")
    return ResumeVersion.objects.create(
        base_resume=base,
        version_number=1,
        document=document,
        document_hash="x" * 64,
    )


def test_render_includes_basics_name():
    user = _user()
    ws = _ws()
    _join(user, ws)
    v = _version(ws, {"basics": {"name": "Alice Example"}})

    html = render_resume_version_html(actor=user, version=v)
    assert "Alice Example" in html
    assert "<!DOCTYPE html>" in html


def test_render_renders_work_section_when_present():
    user = _user()
    ws = _ws()
    _join(user, ws)
    v = _version(
        ws,
        {
            "basics": {"name": "Alice"},
            "work": [
                {
                    "position": "Staff Eng",
                    "company": "Acme",
                    "startDate": "2020-01",
                    "endDate": "2024-12",
                    "summary": "Led platform.",
                }
            ],
        },
    )
    html = render_resume_version_html(actor=user, version=v)
    assert "Staff Eng" in html
    assert "Acme" in html
    assert "Led platform." in html


def test_render_handles_empty_or_missing_sections_without_crashing():
    user = _user()
    ws = _ws()
    _join(user, ws)
    v = _version(ws, {})  # no basics, no work, no education
    html = render_resume_version_html(actor=user, version=v)
    assert "<html" in html


def test_render_escapes_user_supplied_html():
    """Default Django auto-escape must run so a malicious `name` field
    can't inject markup into the rendered output."""
    user = _user()
    ws = _ws()
    _join(user, ws)
    v = _version(ws, {"basics": {"name": "<script>alert(1)</script>"}})
    html = render_resume_version_html(actor=user, version=v)
    assert "<script>alert(1)</script>" not in html
    assert "&lt;script&gt;" in html


def test_render_rejects_non_member():
    user = _user("bob")
    ws = _ws()
    v = _version(ws, {"basics": {"name": "Alice"}})
    with pytest.raises(WorkspaceMembershipRequired):
        render_resume_version_html(actor=user, version=v)


def test_render_allowed_for_viewer():
    user = _user()
    ws = _ws()
    _join(user, ws, role=MembershipRole.VIEWER)
    v = _version(ws, {"basics": {"name": "Alice"}})
    html = render_resume_version_html(actor=user, version=v)
    assert "Alice" in html


def test_render_writes_audit_event():
    from audit.models import AuditEvent

    user = _user()
    ws = _ws()
    _join(user, ws)
    v = _version(ws, {"basics": {"name": "Alice"}})
    render_resume_version_html(actor=user, version=v)

    events = list(AuditEvent.objects.filter(action="resume_version.rendered"))
    assert len(events) == 1
    event = events[0]
    assert event.workspace_id == ws.pk
    assert event.entity_type == "resumes.ResumeVersion"
    assert event.entity_id == str(v.pk)
    assert event.metadata["source"] == "api"
    assert event.metadata["version_number"] == 1


def test_render_with_actor_none_skips_membership_check():
    """Management-command path: no actor → no membership check."""
    from audit.models import AuditEvent

    ws = _ws()
    v = _version(ws, {"basics": {"name": "Alice"}})
    html = render_resume_version_html(actor=None, version=v, source="command")
    assert "Alice" in html
    events = list(AuditEvent.objects.filter(action="resume_version.rendered"))
    assert len(events) == 1
    assert events[0].metadata["source"] == "command"
