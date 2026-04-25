from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model

from interviews.models import (
    InterviewCycle,
    InterviewStep,
    InterviewStepKind,
    InterviewStepStatus,
)
from interviews.services import (
    WorkspaceMembershipRequired,
    WorkspaceWriteForbidden,
    add_interview_step,
    start_interview_cycle,
    update_step_status,
)
from opportunities.models import Opportunity
from tenancy.models import Membership, MembershipRole, Workspace

pytestmark = pytest.mark.django_db


def _user(username="alice"):
    return get_user_model().objects.create_user(
        username=username, email=f"{username}@example.com", password="x"
    )


def _workspace(slug="ws-a"):
    return Workspace.objects.create(name=f"Workspace {slug}", slug=slug)


def _join(user, ws, role=MembershipRole.OWNER):
    return Membership.objects.create(user=user, workspace=ws, role=role)


def _opportunity(ws, title="Staff Eng", company="Acme"):
    return Opportunity.objects.create(workspace=ws, title=title, company=company)


# -- start_interview_cycle ---------------------------------------------------


def test_start_interview_cycle_in_member_workspace():
    user = _user()
    ws = _workspace()
    _join(user, ws)
    opp = _opportunity(ws)

    cycle = start_interview_cycle(actor=user, opportunity=opp, name="Onsite loop")

    assert cycle.pk is not None
    assert cycle.opportunity_id == opp.pk
    assert cycle.started_at is not None
    assert cycle.notes == ""


def test_start_interview_cycle_rejects_non_member():
    user = _user("bob")
    ws = _workspace()
    opp = _opportunity(ws)

    with pytest.raises(WorkspaceMembershipRequired):
        start_interview_cycle(actor=user, opportunity=opp, name="x")
    assert InterviewCycle.objects.count() == 0


def test_start_interview_cycle_rejects_viewer():
    user = _user()
    ws = _workspace()
    _join(user, ws, role=MembershipRole.VIEWER)
    opp = _opportunity(ws)

    with pytest.raises(WorkspaceWriteForbidden):
        start_interview_cycle(actor=user, opportunity=opp, name="x")
    assert InterviewCycle.objects.count() == 0


# -- add_interview_step ------------------------------------------------------


def test_add_interview_step_assigns_sequential_numbers():
    user = _user()
    ws = _workspace()
    _join(user, ws)
    opp = _opportunity(ws)
    cycle = start_interview_cycle(actor=user, opportunity=opp, name="loop")

    s1 = add_interview_step(actor=user, cycle=cycle, kind=InterviewStepKind.PHONE)
    s2 = add_interview_step(actor=user, cycle=cycle, kind=InterviewStepKind.TECHNICAL)

    assert s1.sequence == 1
    assert s2.sequence == 2
    assert s1.status == InterviewStepStatus.SCHEDULED


def test_add_interview_step_rejects_unknown_kind():
    user = _user()
    ws = _workspace()
    _join(user, ws)
    cycle = start_interview_cycle(actor=user, opportunity=_opportunity(ws), name="loop")

    with pytest.raises(ValueError):
        add_interview_step(actor=user, cycle=cycle, kind="not-a-kind")


def test_add_interview_step_rejects_viewer():
    owner = _user("owner")
    viewer = _user("viewer")
    ws = _workspace()
    _join(owner, ws)
    _join(viewer, ws, role=MembershipRole.VIEWER)
    cycle = start_interview_cycle(actor=owner, opportunity=_opportunity(ws), name="loop")

    with pytest.raises(WorkspaceWriteForbidden):
        add_interview_step(actor=viewer, cycle=cycle, kind=InterviewStepKind.PHONE)


# -- update_step_status ------------------------------------------------------


def test_update_step_status_changes_status_and_persists_notes():
    user = _user()
    ws = _workspace()
    _join(user, ws)
    cycle = start_interview_cycle(actor=user, opportunity=_opportunity(ws), name="loop")
    step = add_interview_step(actor=user, cycle=cycle, kind=InterviewStepKind.PHONE)

    updated = update_step_status(
        actor=user, step=step, status=InterviewStepStatus.COMPLETED, notes="went well"
    )

    assert updated is step
    assert updated.status == InterviewStepStatus.COMPLETED
    assert updated.notes == "went well"


def test_update_step_status_rejects_unknown_status():
    user = _user()
    ws = _workspace()
    _join(user, ws)
    cycle = start_interview_cycle(actor=user, opportunity=_opportunity(ws), name="loop")
    step = add_interview_step(actor=user, cycle=cycle, kind=InterviewStepKind.PHONE)

    with pytest.raises(ValueError):
        update_step_status(actor=user, step=step, status="not-a-status")


def test_update_step_status_rejects_viewer():
    owner = _user("owner")
    viewer = _user("viewer")
    ws = _workspace()
    _join(owner, ws)
    _join(viewer, ws, role=MembershipRole.VIEWER)
    cycle = start_interview_cycle(actor=owner, opportunity=_opportunity(ws), name="loop")
    step = add_interview_step(actor=owner, cycle=cycle, kind=InterviewStepKind.PHONE)

    with pytest.raises(WorkspaceWriteForbidden):
        update_step_status(actor=viewer, step=step, status=InterviewStepStatus.COMPLETED)


# -- audit -------------------------------------------------------------------


def test_start_interview_cycle_writes_audit_event():
    from audit.models import AuditEvent

    user = _user()
    ws = _workspace()
    _join(user, ws)
    opp = _opportunity(ws)
    cycle = start_interview_cycle(actor=user, opportunity=opp, name="Onsite loop")

    events = list(AuditEvent.objects.filter(action="interview_cycle.created"))
    assert len(events) == 1
    event = events[0]
    assert event.workspace_id == ws.pk
    assert event.entity_type == "interviews.InterviewCycle"
    assert event.entity_id == str(cycle.pk)
    assert event.metadata == {"name": "Onsite loop", "opportunity_id": str(opp.pk)}


def test_add_interview_step_writes_audit_event():
    from audit.models import AuditEvent

    user = _user()
    ws = _workspace()
    _join(user, ws)
    cycle = start_interview_cycle(actor=user, opportunity=_opportunity(ws), name="loop")
    step = add_interview_step(actor=user, cycle=cycle, kind=InterviewStepKind.PHONE)

    events = list(AuditEvent.objects.filter(action="interview_step.added"))
    assert len(events) == 1
    event = events[0]
    assert event.entity_type == "interviews.InterviewStep"
    assert event.entity_id == str(step.pk)
    assert event.workspace_id == ws.pk
    assert event.metadata["sequence"] == 1
    assert event.metadata["kind"] == InterviewStepKind.PHONE
    assert event.metadata["cycle_id"] == str(cycle.pk)


def test_update_step_status_writes_audit_event_with_old_and_new():
    from audit.models import AuditEvent

    user = _user()
    ws = _workspace()
    _join(user, ws)
    cycle = start_interview_cycle(actor=user, opportunity=_opportunity(ws), name="loop")
    step = add_interview_step(actor=user, cycle=cycle, kind=InterviewStepKind.PHONE)

    update_step_status(actor=user, step=step, status=InterviewStepStatus.COMPLETED)

    events = list(AuditEvent.objects.filter(action="interview_step.updated"))
    assert len(events) == 1
    event = events[0]
    assert event.metadata["old_status"] == InterviewStepStatus.SCHEDULED
    assert event.metadata["new_status"] == InterviewStepStatus.COMPLETED
    assert event.metadata["sequence"] == 1


def test_step_unique_constraint_holds_under_explicit_sequence_collision():
    """Defensive sanity: even outside the service, the DB rejects duplicates."""
    user = _user()
    ws = _workspace()
    _join(user, ws)
    cycle = start_interview_cycle(actor=user, opportunity=_opportunity(ws), name="loop")
    InterviewStep.objects.create(cycle=cycle, sequence=1, kind=InterviewStepKind.PHONE)
    from django.db import IntegrityError

    with pytest.raises(IntegrityError):
        InterviewStep.objects.create(cycle=cycle, sequence=1, kind=InterviewStepKind.TECHNICAL)
