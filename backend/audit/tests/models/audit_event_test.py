from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model

from audit.models import AuditEvent
from tenancy.models import Workspace

pytestmark = pytest.mark.django_db


def _user(username="alice"):
    return get_user_model().objects.create_user(
        username=username, email=f"{username}@example.com", password="x"
    )


def _workspace(slug="ws-a"):
    return Workspace.objects.create(name=f"Workspace {slug}", slug=slug)


def _event(**overrides) -> AuditEvent:
    defaults = {"actor_repr": "<system>", "action": "x"}
    defaults.update(overrides)
    return AuditEvent.objects.create(**defaults)


def test_minimum_field_create_uses_metadata_default():
    e = _event()
    e.refresh_from_db()
    assert e.actor is None
    assert e.actor_repr == "<system>"
    assert e.action == "x"
    assert e.entity_type == ""
    assert e.entity_id == ""
    assert e.workspace is None
    assert e.correlation_id == ""
    assert e.metadata == {}


def test_str_includes_action_actor_and_iso_timestamp():
    e = _event(action="mcp_token.issued", actor_repr="alice (id=12)")
    rendered = str(e)
    assert rendered.startswith("mcp_token.issued by alice (id=12) at ")
    assert "T" in rendered


def test_actor_set_null_preserves_actor_repr():
    user = _user()
    e = _event(actor=user, actor_repr="alice (id=1)")
    user.delete()
    e.refresh_from_db()
    assert e.actor is None
    assert e.actor_repr == "alice (id=1)"


def test_workspace_set_null_preserves_event():
    ws = _workspace()
    e = _event(workspace=ws)
    ws.delete()
    e.refresh_from_db()
    assert e.workspace is None
    assert AuditEvent.objects.filter(pk=e.pk).exists()


def test_default_ordering_is_newest_first():
    older = _event(action="a")
    newer = _event(action="b")
    ordered = list(AuditEvent.objects.all())
    assert ordered[0].pk == newer.pk
    assert ordered[1].pk == older.pk


def test_two_events_with_same_action_for_same_entity_can_coexist():
    _event(action="opportunity.archived", entity_type="opportunities.Opportunity", entity_id="abc")
    _event(action="opportunity.archived", entity_type="opportunities.Opportunity", entity_id="abc")
    assert AuditEvent.objects.filter(action="opportunity.archived", entity_id="abc").count() == 2
