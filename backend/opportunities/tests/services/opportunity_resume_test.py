from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from django.db.models import ProtectedError

from opportunities.models import (
    Opportunity,
    OpportunityResume,
    OpportunityResumeRole,
)
from opportunities.services import (
    CrossWorkspaceLinkForbidden,
    WorkspaceMembershipRequired,
    WorkspaceWriteForbidden,
    link_resume_to_opportunity,
    unlink_resume,
)
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


def _opp(ws):
    return Opportunity.objects.create(workspace=ws, title="Staff Eng", company="Acme")


def _resume_version(ws, version_number=1):
    base = BaseResume.objects.create(workspace=ws, name="Senior Eng")
    return ResumeVersion.objects.create(
        base_resume=base,
        version_number=version_number,
        document={"basics": {}},
        document_hash="x" * 64,
    )


# -- link_resume_to_opportunity ----------------------------------------------


def test_link_happy_path():
    user = _user()
    ws = _ws()
    _join(user, ws)
    opp = _opp(ws)
    version = _resume_version(ws)

    link = link_resume_to_opportunity(
        actor=user,
        opportunity=opp,
        resume_version=version,
        role=OpportunityResumeRole.SUBMITTED,
        note="sent via referral",
    )
    assert link.pk is not None
    assert link.opportunity_id == opp.pk
    assert link.resume_version_id == version.pk
    assert link.role == OpportunityResumeRole.SUBMITTED
    assert link.note == "sent via referral"
    assert link.created_by_id == user.pk


def test_link_rejects_non_member():
    user = _user("bob")
    ws = _ws()
    opp = _opp(ws)
    version = _resume_version(ws)

    with pytest.raises(WorkspaceMembershipRequired):
        link_resume_to_opportunity(
            actor=user,
            opportunity=opp,
            resume_version=version,
            role=OpportunityResumeRole.SUBMITTED,
        )
    assert OpportunityResume.objects.count() == 0


def test_link_rejects_viewer():
    user = _user()
    ws = _ws()
    _join(user, ws, role=MembershipRole.VIEWER)
    opp = _opp(ws)
    version = _resume_version(ws)

    with pytest.raises(WorkspaceWriteForbidden):
        link_resume_to_opportunity(
            actor=user,
            opportunity=opp,
            resume_version=version,
            role=OpportunityResumeRole.SUBMITTED,
        )


def test_link_rejects_unknown_role():
    user = _user()
    ws = _ws()
    _join(user, ws)
    opp = _opp(ws)
    version = _resume_version(ws)

    with pytest.raises(ValueError):
        link_resume_to_opportunity(
            actor=user, opportunity=opp, resume_version=version, role="bogus"
        )


def test_link_rejects_cross_workspace_resume_version():
    user = _user()
    ws_a = _ws("ws-a")
    ws_b = _ws("ws-b")
    _join(user, ws_a)
    _join(user, ws_b)
    opp_a = _opp(ws_a)
    version_b = _resume_version(ws_b)

    with pytest.raises(CrossWorkspaceLinkForbidden):
        link_resume_to_opportunity(
            actor=user,
            opportunity=opp_a,
            resume_version=version_b,
            role=OpportunityResumeRole.SUBMITTED,
        )
    assert OpportunityResume.objects.count() == 0


# -- unlink_resume -----------------------------------------------------------


def test_unlink_deletes_row():
    user = _user()
    ws = _ws()
    _join(user, ws)
    opp = _opp(ws)
    version = _resume_version(ws)
    link = link_resume_to_opportunity(
        actor=user,
        opportunity=opp,
        resume_version=version,
        role=OpportunityResumeRole.SUBMITTED,
    )

    unlink_resume(actor=user, link=link)

    assert OpportunityResume.objects.filter(pk=link.pk).count() == 0


def test_unlink_rejects_viewer():
    owner = _user("owner")
    viewer = _user("viewer")
    ws = _ws()
    _join(owner, ws)
    _join(viewer, ws, role=MembershipRole.VIEWER)
    opp = _opp(ws)
    version = _resume_version(ws)
    link = link_resume_to_opportunity(
        actor=owner,
        opportunity=opp,
        resume_version=version,
        role=OpportunityResumeRole.SUBMITTED,
    )

    with pytest.raises(WorkspaceWriteForbidden):
        unlink_resume(actor=viewer, link=link)
    assert OpportunityResume.objects.filter(pk=link.pk).count() == 1


# -- Resume version PROTECT --------------------------------------------------


def test_resume_version_protect_blocks_delete_with_active_link():
    """`OpportunityResume.resume_version` is on_delete=PROTECT — deleting
    a version while a link still references it must raise."""
    user = _user()
    ws = _ws()
    _join(user, ws)
    opp = _opp(ws)
    version = _resume_version(ws)
    link_resume_to_opportunity(
        actor=user,
        opportunity=opp,
        resume_version=version,
        role=OpportunityResumeRole.SUBMITTED,
    )

    with pytest.raises(ProtectedError):
        version.delete()


# -- Audit -------------------------------------------------------------------


def test_link_writes_audit_event():
    from audit.models import AuditEvent

    user = _user()
    ws = _ws()
    _join(user, ws)
    opp = _opp(ws)
    version = _resume_version(ws)
    link = link_resume_to_opportunity(
        actor=user,
        opportunity=opp,
        resume_version=version,
        role=OpportunityResumeRole.SUBMITTED,
    )

    events = list(AuditEvent.objects.filter(action="opportunity_resume.linked"))
    assert len(events) == 1
    event = events[0]
    assert event.workspace_id == ws.pk
    assert event.entity_type == "opportunities.OpportunityResume"
    assert event.entity_id == str(link.pk)
    assert event.metadata["opportunity_id"] == str(opp.pk)
    assert event.metadata["resume_version_id"] == str(version.pk)
    assert event.metadata["base_resume_id"] == str(version.base_resume_id)
    assert event.metadata["role"] == OpportunityResumeRole.SUBMITTED


def test_unlink_writes_audit_event_with_metadata_frozen_before_delete():
    from audit.models import AuditEvent

    user = _user()
    ws = _ws()
    _join(user, ws)
    opp = _opp(ws)
    version = _resume_version(ws)
    link = link_resume_to_opportunity(
        actor=user,
        opportunity=opp,
        resume_version=version,
        role=OpportunityResumeRole.USED_INTERNALLY,
    )
    link_pk = link.pk

    unlink_resume(actor=user, link=link)

    events = list(AuditEvent.objects.filter(action="opportunity_resume.unlinked"))
    assert len(events) == 1
    event = events[0]
    # entity_id remains resolvable as the *prior* row id even after the
    # row is deleted — that's the whole point of freezing it at audit time.
    assert event.entity_id == str(link_pk)
    assert event.metadata["resume_version_id"] == str(version.pk)
    assert event.metadata["role"] == OpportunityResumeRole.USED_INTERNALLY
