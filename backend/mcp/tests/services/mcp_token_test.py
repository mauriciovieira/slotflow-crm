from __future__ import annotations

import hashlib
import uuid

import pytest
from django.contrib.auth import get_user_model
from django.core.exceptions import PermissionDenied

from mcp.models import McpToken
from mcp.tokens.services import (
    DEFAULT_TTL_DAYS,
    MAX_TTL_DAYS,
    PLAINTEXT_PREFIX,
    issue_token,
    revoke_token,
)

pytestmark = pytest.mark.django_db


def _user(username="alice"):
    return get_user_model().objects.create_user(
        username=username, email=f"{username}@example.com", password="x"
    )


def test_issue_token_returns_record_and_plaintext_with_consistent_hash():
    user = _user()
    record, plaintext = issue_token(actor=user, name="Cursor on laptop")

    assert plaintext.startswith(PLAINTEXT_PREFIX)
    assert record.user_id == user.pk
    assert record.name == "Cursor on laptop"
    assert record.last_four == plaintext[-4:]
    assert record.token_hash == hashlib.sha256(plaintext.encode("utf-8")).hexdigest()
    assert record.is_active is True


def test_issue_token_default_ttl_is_30_days():
    record, _ = issue_token(actor=_user(), name="x")
    delta = record.expires_at - record.created_at
    # `created_at` and `expires_at` are populated milliseconds apart, so allow
    # a small tolerance below the configured default.
    assert delta.days >= DEFAULT_TTL_DAYS - 1
    assert delta.days <= DEFAULT_TTL_DAYS


def test_issue_token_rejects_ttl_out_of_range():
    user = _user()
    with pytest.raises(ValueError):
        issue_token(actor=user, name="x", ttl_days=0)
    with pytest.raises(ValueError):
        issue_token(actor=user, name="x", ttl_days=MAX_TTL_DAYS + 1)
    assert McpToken.objects.count() == 0


def test_revoke_token_sets_revoked_at_and_is_idempotent():
    user = _user()
    record, _ = issue_token(actor=user, name="x")
    assert record.revoked_at is None

    first = revoke_token(actor=user, token_id=record.pk)
    first_stamp = first.revoked_at
    assert first_stamp is not None

    second = revoke_token(actor=user, token_id=record.pk)
    assert second.revoked_at == first_stamp


def test_revoke_token_rejects_non_owner():
    owner = _user("owner")
    other = _user("other")
    record, _ = issue_token(actor=owner, name="x")

    with pytest.raises(PermissionDenied):
        revoke_token(actor=other, token_id=record.pk)

    record.refresh_from_db()
    assert record.revoked_at is None


def test_revoke_token_raises_when_missing():
    user = _user()
    with pytest.raises(McpToken.DoesNotExist):
        revoke_token(actor=user, token_id=uuid.uuid4())


def test_issue_token_writes_audit_event_without_plaintext():
    from audit.models import AuditEvent

    user = _user()
    record, plaintext = issue_token(actor=user, name="Cursor on laptop")

    events = list(AuditEvent.objects.filter(action="mcp_token.issued"))
    assert len(events) == 1
    event = events[0]
    assert event.actor_id == user.pk
    assert event.entity_type == "mcp.McpToken"
    assert event.entity_id == str(record.pk)
    assert event.metadata["last_four"] == record.last_four
    # The plaintext must NEVER reach the audit log.
    assert plaintext not in str(event.metadata)
    for value in event.metadata.values():
        assert plaintext != value


def test_revoke_token_writes_audit_event_with_already_revoked_false_first_call():
    from audit.models import AuditEvent

    user = _user()
    record, _ = issue_token(actor=user, name="x")

    revoke_token(actor=user, token_id=record.pk)

    events = list(AuditEvent.objects.filter(action="mcp_token.revoked"))
    assert len(events) == 1
    assert events[0].metadata["already_revoked"] is False
    assert events[0].metadata["last_four"] == record.last_four


def test_revoke_token_writes_audit_event_with_already_revoked_true_on_second_call():
    from audit.models import AuditEvent

    user = _user()
    record, _ = issue_token(actor=user, name="x")

    revoke_token(actor=user, token_id=record.pk)
    record.refresh_from_db()
    first_stamp = record.revoked_at

    revoke_token(actor=user, token_id=record.pk)

    record.refresh_from_db()
    # Second call must not bump the timestamp.
    assert record.revoked_at == first_stamp

    events = list(AuditEvent.objects.filter(action="mcp_token.revoked").order_by("created_at"))
    assert len(events) == 2
    assert events[0].metadata["already_revoked"] is False
    assert events[1].metadata["already_revoked"] is True
