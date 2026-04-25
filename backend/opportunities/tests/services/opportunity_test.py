from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model

from opportunities.models import Opportunity, OpportunityStage
from opportunities.services import (
    WorkspaceMembershipRequired,
    WorkspaceWriteForbidden,
    archive_opportunity,
    create_opportunity,
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


def test_create_opportunity_in_member_workspace():
    user = _user()
    ws = _workspace()
    _join(user, ws)

    opp = create_opportunity(
        actor=user,
        workspace=ws,
        payload={"title": "Staff Eng", "company": "Acme", "notes": "intro call"},
    )

    assert opp.pk is not None
    assert opp.workspace_id == ws.pk
    assert opp.created_by_id == user.pk
    assert opp.stage == OpportunityStage.APPLIED
    assert opp.notes == "intro call"


def test_create_opportunity_rejects_non_member_workspace():
    user = _user("bob")
    ws = _workspace("ws-other")

    with pytest.raises(WorkspaceMembershipRequired):
        create_opportunity(actor=user, workspace=ws, payload={"title": "x", "company": "y"})

    assert Opportunity.objects.count() == 0


def test_create_opportunity_rejects_viewer_role():
    user = _user()
    ws = _workspace()
    _join(user, ws, role=MembershipRole.VIEWER)

    with pytest.raises(WorkspaceWriteForbidden):
        create_opportunity(actor=user, workspace=ws, payload={"title": "x", "company": "y"})

    assert Opportunity.objects.count() == 0


def test_archive_opportunity_rejects_viewer_role():
    owner = _user("owner")
    viewer = _user("viewer")
    ws = _workspace()
    _join(owner, ws, role=MembershipRole.OWNER)
    _join(viewer, ws, role=MembershipRole.VIEWER)
    opp = create_opportunity(actor=owner, workspace=ws, payload={"title": "x", "company": "y"})

    with pytest.raises(WorkspaceWriteForbidden):
        archive_opportunity(actor=viewer, opportunity=opp)

    opp.refresh_from_db()
    assert opp.archived_at is None


def test_archive_opportunity_sets_archived_at_and_is_idempotent():
    user = _user()
    ws = _workspace()
    _join(user, ws)
    opp = create_opportunity(actor=user, workspace=ws, payload={"title": "x", "company": "y"})
    assert opp.archived_at is None

    archived = archive_opportunity(actor=user, opportunity=opp)
    first_stamp = archived.archived_at
    assert first_stamp is not None

    # Second call must not bump the timestamp.
    archived_again = archive_opportunity(actor=user, opportunity=archived)
    assert archived_again.archived_at == first_stamp
