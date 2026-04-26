from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model

from audit.services import write_audit_event
from notifications.models import Notification
from notifications.services import (
    create_notification,
    mark_all_read,
    mark_read,
    notify_workspace_owners,
)
from tenancy.models import Membership, MembershipRole, Workspace

pytestmark = pytest.mark.django_db


def _user(name="alice"):
    return get_user_model().objects.create_user(
        username=name, email=f"{name}@example.com", password="x"
    )


def _ws(slug="ws-a"):
    return Workspace.objects.create(name=f"Workspace {slug}", slug=slug)


def test_create_notification_persists_with_payload_and_workspace():
    user = _user()
    ws = _ws()
    n = create_notification(
        recipient=user,
        kind="x.happened",
        payload={"a": 1},
        workspace=ws,
    )
    assert n.recipient_id == user.pk
    assert n.kind == "x.happened"
    assert n.payload == {"a": 1}
    assert n.workspace_id == ws.id
    assert n.read_at is None


def test_notify_workspace_owners_excludes_actor():
    actor = _user("actor")
    other = _user("other")
    bystander = _user("bystander")
    ws = _ws()
    Membership.objects.create(user=actor, workspace=ws, role=MembershipRole.OWNER)
    Membership.objects.create(user=other, workspace=ws, role=MembershipRole.OWNER)
    # Member-role user gets nothing — only owners are notified.
    Membership.objects.create(user=bystander, workspace=ws, role=MembershipRole.MEMBER)

    rows = notify_workspace_owners(
        workspace=ws, actor=actor, kind="thing.happened", payload={"x": 1}
    )
    assert len(rows) == 1
    assert rows[0].recipient_id == other.pk
    assert rows[0].kind == "thing.happened"


def test_notify_workspace_owners_with_no_actor_notifies_all_owners():
    a = _user("a")
    b = _user("b")
    ws = _ws()
    Membership.objects.create(user=a, workspace=ws, role=MembershipRole.OWNER)
    Membership.objects.create(user=b, workspace=ws, role=MembershipRole.OWNER)
    rows = notify_workspace_owners(workspace=ws, actor=None, kind="system.tick")
    assert {r.recipient_id for r in rows} == {a.pk, b.pk}


def test_audit_write_fans_out_to_workspace_owners_except_actor():
    actor = _user("actor")
    other = _user("other")
    ws = _ws()
    Membership.objects.create(user=actor, workspace=ws, role=MembershipRole.OWNER)
    Membership.objects.create(user=other, workspace=ws, role=MembershipRole.OWNER)

    write_audit_event(
        actor=actor,
        action="opportunity.archived",
        workspace=ws,
        metadata={"title": "T", "company": "C", "stage": "applied"},
    )

    rows = list(Notification.objects.all())
    assert len(rows) == 1
    assert rows[0].recipient_id == other.pk
    assert rows[0].kind == "opportunity.archived"
    # Only the FE-friendly subset of metadata leaks into the payload.
    assert rows[0].payload["title"] == "T"
    assert rows[0].payload["company"] == "C"
    assert rows[0].payload["stage"] == "applied"
    # Actor repr is preserved on the notification too.
    assert "actor" in rows[0].payload["actor_repr"]


def test_audit_write_without_workspace_does_not_fan_out():
    actor = _user()
    write_audit_event(actor=actor, action="system.boot")
    assert Notification.objects.count() == 0


def test_mark_read_only_flips_owners_unread_rows():
    a = _user("a")
    b = _user("b")
    ws = _ws()
    n1 = create_notification(recipient=a, kind="x", workspace=ws)
    n2 = create_notification(recipient=a, kind="x", workspace=ws)
    n_other = create_notification(recipient=b, kind="x", workspace=ws)

    flipped = mark_read(recipient=a, ids=[n1.id, n2.id, n_other.id])
    assert flipped == 2

    n1.refresh_from_db()
    n2.refresh_from_db()
    n_other.refresh_from_db()
    assert n1.read_at is not None
    assert n2.read_at is not None
    # b's notification is untouched even though we passed its id.
    assert n_other.read_at is None


def test_mark_all_read_flips_only_recipients_unread():
    a = _user("a")
    b = _user("b")
    ws = _ws()
    create_notification(recipient=a, kind="x", workspace=ws)
    create_notification(recipient=a, kind="y", workspace=ws)
    create_notification(recipient=b, kind="x", workspace=ws)

    flipped = mark_all_read(recipient=a)
    assert flipped == 2
    assert Notification.objects.filter(recipient=b, read_at__isnull=True).count() == 1
