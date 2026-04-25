from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from audit.models import AuditEvent
from audit.services import write_audit_event
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


def test_anonymous_is_unauthorized():
    ws = _ws()
    response = _client().get(f"/api/audit-events/?workspace={ws.id}")
    assert response.status_code in (401, 403)


def test_workspace_param_required():
    user = _user()
    response = _client(user).get("/api/audit-events/")
    assert response.status_code == 400
    assert "workspace" in response.json()["detail"].lower()


def test_invalid_workspace_uuid_returns_400():
    user = _user()
    response = _client(user).get("/api/audit-events/?workspace=not-a-uuid")
    assert response.status_code == 400


def test_unknown_workspace_returns_404():
    import uuid

    user = _user()
    response = _client(user).get(f"/api/audit-events/?workspace={uuid.uuid4()}")
    assert response.status_code == 404


def test_member_role_returns_403():
    user = _user()
    ws = _ws()
    _join(user, ws, role=MembershipRole.MEMBER)
    response = _client(user).get(f"/api/audit-events/?workspace={ws.id}")
    assert response.status_code == 403


def test_viewer_role_returns_403():
    user = _user()
    ws = _ws()
    _join(user, ws, role=MembershipRole.VIEWER)
    response = _client(user).get(f"/api/audit-events/?workspace={ws.id}")
    assert response.status_code == 403


def test_owner_sees_only_own_workspace_events():
    owner = _user()
    ws_a = _ws("ws-a")
    ws_b = _ws("ws-b")
    _join(owner, ws_a, role=MembershipRole.OWNER)

    write_audit_event(actor=owner, action="thing.happened", workspace=ws_a)
    write_audit_event(actor=owner, action="other.thing", workspace=ws_b)

    response = _client(owner).get(f"/api/audit-events/?workspace={ws_a.id}")
    assert response.status_code == 200
    body = response.json()
    assert body["count"] == 1
    assert body["results"][0]["action"] == "thing.happened"
    assert body["results"][0]["workspace"] == str(ws_a.id)


def test_filter_by_action_narrows_results():
    owner = _user()
    ws = _ws()
    _join(owner, ws, role=MembershipRole.OWNER)
    write_audit_event(actor=owner, action="mcp_token.issued", workspace=ws)
    write_audit_event(actor=owner, action="mcp_token.revoked", workspace=ws)
    write_audit_event(actor=owner, action="opportunity.archived", workspace=ws)

    response = _client(owner).get(f"/api/audit-events/?workspace={ws.id}&action=mcp_token.issued")
    assert response.status_code == 200
    body = response.json()
    assert body["count"] == 1
    assert body["results"][0]["action"] == "mcp_token.issued"


def test_filter_by_entity_type_and_id():
    owner = _user()
    ws = _ws()
    _join(owner, ws, role=MembershipRole.OWNER)

    AuditEvent.objects.create(
        actor=owner,
        actor_repr="alice",
        action="opportunity.archived",
        entity_type="opportunities.Opportunity",
        entity_id="111",
        workspace=ws,
    )
    AuditEvent.objects.create(
        actor=owner,
        actor_repr="alice",
        action="opportunity.archived",
        entity_type="opportunities.Opportunity",
        entity_id="222",
        workspace=ws,
    )

    response = _client(owner).get(
        f"/api/audit-events/?workspace={ws.id}&entity_type=opportunities.Opportunity&entity_id=111"
    )
    assert response.status_code == 200
    body = response.json()
    assert body["count"] == 1
    assert body["results"][0]["entity_id"] == "111"


def test_results_are_newest_first():
    owner = _user()
    ws = _ws()
    _join(owner, ws, role=MembershipRole.OWNER)

    first = write_audit_event(actor=owner, action="a.first", workspace=ws)
    second = write_audit_event(actor=owner, action="a.second", workspace=ws)
    third = write_audit_event(actor=owner, action="a.third", workspace=ws)

    response = _client(owner).get(f"/api/audit-events/?workspace={ws.id}")
    assert response.status_code == 200
    actions = [row["action"] for row in response.json()["results"]]
    assert actions == ["a.third", "a.second", "a.first"]
    # Sanity: the IDs we wrote do match.
    ids = [row["id"] for row in response.json()["results"]]
    assert ids == [str(third.id), str(second.id), str(first.id)]


def test_response_shape_includes_expected_fields():
    owner = _user()
    ws = _ws()
    _join(owner, ws, role=MembershipRole.OWNER)
    write_audit_event(
        actor=owner,
        action="mcp_token.issued",
        workspace=ws,
        metadata={"name": "demo"},
    )

    response = _client(owner).get(f"/api/audit-events/?workspace={ws.id}")
    assert response.status_code == 200
    row = response.json()["results"][0]
    assert set(row.keys()) == {
        "id",
        "actor_repr",
        "action",
        "entity_type",
        "entity_id",
        "workspace",
        "correlation_id",
        "metadata",
        "created_at",
    }
    assert row["metadata"] == {"name": "demo"}
