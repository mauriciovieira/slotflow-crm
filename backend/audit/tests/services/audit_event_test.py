from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model

from audit.services import SYSTEM_ACTOR_REPR, write_audit_event
from core.middleware.correlation_id import _correlation_id
from opportunities.models import Opportunity
from tenancy.models import Workspace

pytestmark = pytest.mark.django_db


def _user(username="alice"):
    return get_user_model().objects.create_user(
        username=username, email=f"{username}@example.com", password="x"
    )


def _workspace(slug="ws-a"):
    return Workspace.objects.create(name=f"Workspace {slug}", slug=slug)


def test_write_audit_event_with_actor_freezes_actor_repr():
    user = _user("alice")
    event = write_audit_event(actor=user, action="login.success")
    assert event.actor_id == user.pk
    assert event.actor_repr == f"alice (id={user.pk})"
    assert event.action == "login.success"


def test_write_audit_event_with_no_actor_uses_system_repr():
    event = write_audit_event(actor=None, action="cron.tick")
    assert event.actor is None
    assert event.actor_repr == SYSTEM_ACTOR_REPR


def test_write_audit_event_extracts_entity_descriptor():
    user = _user()
    ws = _workspace()
    opp = Opportunity.objects.create(workspace=ws, title="Staff Eng", company="Acme")
    event = write_audit_event(actor=user, action="opportunity.created", entity=opp)
    assert event.entity_type == "opportunities.Opportunity"
    assert event.entity_id == str(opp.pk)


def test_caller_provided_correlation_id_lands_on_the_row():
    event = write_audit_event(actor=None, action="x", correlation_id="req-abcdefgh")
    assert event.correlation_id == "req-abcdefgh"


def test_missing_correlation_id_falls_back_to_contextvar():
    token = _correlation_id.set("req-from-ctx")
    try:
        event = write_audit_event(actor=None, action="x")
    finally:
        _correlation_id.reset(token)
    assert event.correlation_id == "req-from-ctx"


def test_correlation_id_is_clamped_to_model_max_length():
    """A caller passing a >64 char id is clamped instead of crashing the txn."""
    long_id = "x" * 200
    event = write_audit_event(actor=None, action="x", correlation_id=long_id)
    event.refresh_from_db()
    assert len(event.correlation_id) == 64
    assert event.correlation_id == "x" * 64


def test_metadata_defaults_to_empty_dict_and_round_trips():
    no_meta = write_audit_event(actor=None, action="a")
    assert no_meta.metadata == {}

    with_meta = write_audit_event(actor=None, action="a", metadata={"ip": "1.2.3.4"})
    with_meta.refresh_from_db()
    assert with_meta.metadata == {"ip": "1.2.3.4"}
