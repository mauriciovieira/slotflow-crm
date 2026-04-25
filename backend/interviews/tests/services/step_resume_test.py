from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from django.db.models import ProtectedError

from interviews.models import (
    InterviewCycle,
    InterviewStep,
    InterviewStepKind,
    InterviewStepResume,
)
from interviews.services import (
    CrossWorkspaceLinkForbidden,
    WorkspaceMembershipRequired,
    WorkspaceWriteForbidden,
    link_resume_to_step,
    unlink_step_resume,
)
from opportunities.models import Opportunity
from resumes.models import BaseResume, ResumeVersion
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


def _step(ws):
    opp = Opportunity.objects.create(workspace=ws, title="Staff Eng", company="Acme")
    cycle = InterviewCycle.objects.create(opportunity=opp, name="loop")
    return InterviewStep.objects.create(cycle=cycle, sequence=1, kind=InterviewStepKind.PHONE)


def _resume_version(ws, name="Senior Eng"):
    base = BaseResume.objects.create(workspace=ws, name=name)
    return ResumeVersion.objects.create(
        base_resume=base,
        version_number=1,
        document={"basics": {}},
        document_hash="x" * 64,
    )


def test_link_happy_path():
    user = _user()
    ws = _ws()
    _join(user, ws)
    step = _step(ws)
    version = _resume_version(ws)

    link = link_resume_to_step(actor=user, step=step, resume_version=version, note="ref")
    assert link.pk is not None
    assert link.step_id == step.pk
    assert link.resume_version_id == version.pk
    assert link.note == "ref"
    assert link.created_by_id == user.pk


def test_link_rejects_non_member():
    user = _user("bob")
    ws = _ws()
    step = _step(ws)
    version = _resume_version(ws)

    with pytest.raises(WorkspaceMembershipRequired):
        link_resume_to_step(actor=user, step=step, resume_version=version)
    assert InterviewStepResume.objects.count() == 0


def test_link_rejects_viewer():
    user = _user()
    ws = _ws()
    _join(user, ws, role=MembershipRole.VIEWER)
    step = _step(ws)
    version = _resume_version(ws)

    with pytest.raises(WorkspaceWriteForbidden):
        link_resume_to_step(actor=user, step=step, resume_version=version)


def test_link_rejects_cross_workspace_resume_version():
    user = _user()
    ws_a = _ws("ws-a")
    ws_b = _ws("ws-b")
    _join(user, ws_a)
    _join(user, ws_b)
    step_a = _step(ws_a)
    version_b = _resume_version(ws_b)

    with pytest.raises(CrossWorkspaceLinkForbidden):
        link_resume_to_step(actor=user, step=step_a, resume_version=version_b)
    assert InterviewStepResume.objects.count() == 0


def test_unlink_deletes_row():
    user = _user()
    ws = _ws()
    _join(user, ws)
    step = _step(ws)
    version = _resume_version(ws)
    link = link_resume_to_step(actor=user, step=step, resume_version=version)

    unlink_step_resume(actor=user, link=link)

    assert InterviewStepResume.objects.filter(pk=link.pk).count() == 0


def test_unlink_rejects_viewer():
    owner = _user("owner")
    viewer = _user("viewer")
    ws = _ws()
    _join(owner, ws)
    _join(viewer, ws, role=MembershipRole.VIEWER)
    step = _step(ws)
    version = _resume_version(ws)
    link = link_resume_to_step(actor=owner, step=step, resume_version=version)

    with pytest.raises(WorkspaceWriteForbidden):
        unlink_step_resume(actor=viewer, link=link)


def test_resume_version_protect_blocks_delete_with_active_link():
    user = _user()
    ws = _ws()
    _join(user, ws)
    step = _step(ws)
    version = _resume_version(ws)
    link_resume_to_step(actor=user, step=step, resume_version=version)

    with pytest.raises(ProtectedError):
        version.delete()


def test_link_writes_audit_event():
    from audit.models import AuditEvent

    user = _user()
    ws = _ws()
    _join(user, ws)
    step = _step(ws)
    version = _resume_version(ws)
    link = link_resume_to_step(actor=user, step=step, resume_version=version)

    events = list(AuditEvent.objects.filter(action="interview_step_resume.linked"))
    assert len(events) == 1
    event = events[0]
    assert event.workspace_id == ws.pk
    assert event.entity_type == "interviews.InterviewStepResume"
    assert event.entity_id == str(link.pk)
    assert event.metadata["step_id"] == str(step.pk)
    assert event.metadata["cycle_id"] == str(step.cycle_id)
    assert event.metadata["resume_version_id"] == str(version.pk)
    assert event.metadata["base_resume_id"] == str(version.base_resume_id)


def test_unlink_writes_audit_event_with_metadata_frozen_before_delete():
    from audit.models import AuditEvent

    user = _user()
    ws = _ws()
    _join(user, ws)
    step = _step(ws)
    version = _resume_version(ws)
    link = link_resume_to_step(actor=user, step=step, resume_version=version)
    link_pk = link.pk

    unlink_step_resume(actor=user, link=link)

    events = list(AuditEvent.objects.filter(action="interview_step_resume.unlinked"))
    assert len(events) == 1
    event = events[0]
    assert event.entity_id == str(link_pk)
    assert event.metadata["resume_version_id"] == str(version.pk)
    assert event.metadata["step_id"] == str(step.pk)
