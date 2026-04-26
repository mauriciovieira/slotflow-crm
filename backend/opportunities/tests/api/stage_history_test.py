from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from opportunities.models import Opportunity, OpportunityStage, OpportunityStageTransition
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


def _client(user=None) -> APIClient:
    c = APIClient()
    if user is not None:
        c.force_authenticate(user)
    return c


def test_patch_with_changed_stage_records_a_transition():
    user = _user()
    ws = _ws()
    _join(user, ws, role=MembershipRole.MEMBER)
    opp = Opportunity.objects.create(
        workspace=ws, title="t", company="c", stage=OpportunityStage.APPLIED
    )

    response = _client(user).patch(
        f"/api/opportunities/{opp.id}/", {"stage": OpportunityStage.INTERVIEW}, format="json"
    )
    assert response.status_code == 200

    rows = list(OpportunityStageTransition.objects.filter(opportunity=opp))
    assert len(rows) == 1
    assert rows[0].from_stage == OpportunityStage.APPLIED
    assert rows[0].to_stage == OpportunityStage.INTERVIEW
    assert rows[0].actor_id == user.pk
    assert "alice" in rows[0].actor_repr


def test_patch_with_unchanged_stage_does_not_record_a_transition():
    user = _user()
    ws = _ws()
    _join(user, ws, role=MembershipRole.MEMBER)
    opp = Opportunity.objects.create(
        workspace=ws, title="t", company="c", stage=OpportunityStage.APPLIED
    )

    response = _client(user).patch(
        f"/api/opportunities/{opp.id}/", {"notes": "updated"}, format="json"
    )
    assert response.status_code == 200
    assert OpportunityStageTransition.objects.filter(opportunity=opp).count() == 0


def test_patch_setting_stage_to_current_does_not_record():
    user = _user()
    ws = _ws()
    _join(user, ws, role=MembershipRole.MEMBER)
    opp = Opportunity.objects.create(
        workspace=ws, title="t", company="c", stage=OpportunityStage.APPLIED
    )

    response = _client(user).patch(
        f"/api/opportunities/{opp.id}/", {"stage": OpportunityStage.APPLIED}, format="json"
    )
    assert response.status_code == 200
    assert OpportunityStageTransition.objects.filter(opportunity=opp).count() == 0


def test_stage_history_endpoint_returns_chronological_rows():
    user = _user()
    ws = _ws()
    _join(user, ws, role=MembershipRole.MEMBER)
    opp = Opportunity.objects.create(
        workspace=ws, title="t", company="c", stage=OpportunityStage.APPLIED
    )

    client = _client(user)
    client.patch(
        f"/api/opportunities/{opp.id}/", {"stage": OpportunityStage.INTERVIEW}, format="json"
    )
    client.patch(f"/api/opportunities/{opp.id}/", {"stage": OpportunityStage.OFFER}, format="json")

    response = client.get(f"/api/opportunities/{opp.id}/stage-history/")
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 2
    # Newest first.
    assert body[0]["from_stage"] == OpportunityStage.INTERVIEW
    assert body[0]["to_stage"] == OpportunityStage.OFFER
    assert body[1]["from_stage"] == OpportunityStage.APPLIED
    assert body[1]["to_stage"] == OpportunityStage.INTERVIEW


def test_stage_history_response_shape():
    user = _user()
    ws = _ws()
    _join(user, ws, role=MembershipRole.MEMBER)
    opp = Opportunity.objects.create(
        workspace=ws, title="t", company="c", stage=OpportunityStage.APPLIED
    )

    _client(user).patch(
        f"/api/opportunities/{opp.id}/", {"stage": OpportunityStage.INTERVIEW}, format="json"
    )

    response = _client(user).get(f"/api/opportunities/{opp.id}/stage-history/")
    assert response.status_code == 200
    row = response.json()[0]
    assert set(row.keys()) == {
        "id",
        "opportunity",
        "from_stage",
        "to_stage",
        "actor_repr",
        "created_at",
    }
    assert row["opportunity"] == str(opp.id)


def test_anonymous_cannot_read_stage_history():
    user = _user()
    ws = _ws()
    _join(user, ws, role=MembershipRole.MEMBER)
    opp = Opportunity.objects.create(
        workspace=ws, title="t", company="c", stage=OpportunityStage.APPLIED
    )
    response = _client().get(f"/api/opportunities/{opp.id}/stage-history/")
    assert response.status_code in (401, 403)


def test_non_member_cannot_read_stage_history():
    owner = _user("owner")
    outsider = _user("outsider")
    ws = _ws()
    _join(owner, ws, role=MembershipRole.OWNER)
    opp = Opportunity.objects.create(
        workspace=ws, title="t", company="c", stage=OpportunityStage.APPLIED
    )
    # Outsider has no membership in ws → IsWorkspaceMember rejects.
    response = _client(outsider).get(f"/api/opportunities/{opp.id}/stage-history/")
    assert response.status_code in (403, 404)


def test_viewer_can_read_history_but_cannot_change_stage():
    viewer = _user()
    ws = _ws()
    _join(viewer, ws, role=MembershipRole.VIEWER)
    opp = Opportunity.objects.create(
        workspace=ws, title="t", company="c", stage=OpportunityStage.APPLIED
    )

    # Viewer GET works.
    response = _client(viewer).get(f"/api/opportunities/{opp.id}/stage-history/")
    assert response.status_code == 200
    assert response.json() == []

    # Viewer PATCH is rejected by IsWorkspaceMember.
    response = _client(viewer).patch(
        f"/api/opportunities/{opp.id}/", {"stage": OpportunityStage.INTERVIEW}, format="json"
    )
    assert response.status_code == 403
    assert OpportunityStageTransition.objects.filter(opportunity=opp).count() == 0
