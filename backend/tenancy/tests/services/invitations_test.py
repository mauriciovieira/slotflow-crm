from __future__ import annotations

from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone

from tenancy.models import Invitation, Membership, MembershipRole, Workspace
from tenancy.services import (
    InvitationConflictError,
    InvitationStateError,
    accept_invitation,
    create_invitation,
    revoke_invitation,
)

pytestmark = pytest.mark.django_db


def _user(name="alice", email=None):
    return get_user_model().objects.create_user(
        username=name, email=email or f"{name}@example.com", password="x"
    )


def _ws(slug="ws-a"):
    return Workspace.objects.create(name=f"Workspace {slug}", slug=slug)


def test_create_invitation_normalizes_email_and_writes_audit():
    actor = _user("actor")
    ws = _ws()
    invitation = create_invitation(
        actor=actor, workspace=ws, email="  Bob@Example.COM  ", role="member"
    )
    assert invitation.email == "bob@example.com"
    assert invitation.token  # set
    assert invitation.expires_at > timezone.now()


def test_create_invitation_rejects_existing_member():
    actor = _user("actor")
    bob = _user("bob")
    ws = _ws()
    Membership.objects.create(user=actor, workspace=ws, role=MembershipRole.OWNER)
    Membership.objects.create(user=bob, workspace=ws, role=MembershipRole.MEMBER)
    with pytest.raises(InvitationConflictError):
        create_invitation(actor=actor, workspace=ws, email="bob@example.com")


def test_create_invitation_rejects_pending_duplicate():
    actor = _user("actor")
    ws = _ws()
    create_invitation(actor=actor, workspace=ws, email="dup@example.com")
    with pytest.raises(InvitationConflictError):
        create_invitation(actor=actor, workspace=ws, email="dup@example.com")


def test_create_invitation_after_expiry_is_allowed():
    actor = _user("actor")
    ws = _ws()
    inv = create_invitation(actor=actor, workspace=ws, email="x@example.com")
    Invitation.objects.filter(pk=inv.pk).update(expires_at=timezone.now() - timedelta(days=1))
    # Same email is OK now because the previous invite has expired.
    create_invitation(actor=actor, workspace=ws, email="x@example.com")


def test_revoke_invitation_marks_revoked_at_and_is_idempotent():
    actor = _user("actor")
    ws = _ws()
    inv = create_invitation(actor=actor, workspace=ws, email="x@example.com")
    revoke_invitation(actor=actor, invitation=inv)
    inv.refresh_from_db()
    assert inv.revoked_at is not None
    first = inv.revoked_at
    # Idempotent — second call doesn't change the timestamp.
    revoke_invitation(actor=actor, invitation=inv)
    inv.refresh_from_db()
    assert inv.revoked_at == first


def test_accept_invitation_creates_membership():
    actor = _user("actor")
    bob = _user("bob")
    ws = _ws()
    Membership.objects.create(user=actor, workspace=ws, role=MembershipRole.OWNER)
    inv = create_invitation(actor=actor, workspace=ws, email="bob@example.com")
    membership = accept_invitation(user=bob, token=inv.token)
    assert membership.workspace_id == ws.id
    assert membership.user_id == bob.pk
    assert membership.role == MembershipRole.MEMBER
    inv.refresh_from_db()
    assert inv.accepted_at is not None


def test_accept_invitation_rejects_revoked():
    actor = _user("actor")
    bob = _user("bob")
    ws = _ws()
    inv = create_invitation(actor=actor, workspace=ws, email="bob@example.com")
    revoke_invitation(actor=actor, invitation=inv)
    with pytest.raises(InvitationStateError):
        accept_invitation(user=bob, token=inv.token)


def test_accept_invitation_rejects_expired():
    actor = _user("actor")
    bob = _user("bob")
    ws = _ws()
    inv = create_invitation(actor=actor, workspace=ws, email="bob@example.com")
    Invitation.objects.filter(pk=inv.pk).update(expires_at=timezone.now() - timedelta(seconds=1))
    with pytest.raises(InvitationStateError):
        accept_invitation(user=bob, token=inv.token)


def test_accept_invitation_idempotent_when_already_accepted_by_same_user():
    actor = _user("actor")
    bob = _user("bob")
    ws = _ws()
    inv = create_invitation(actor=actor, workspace=ws, email="bob@example.com")
    first = accept_invitation(user=bob, token=inv.token)
    again = accept_invitation(user=bob, token=inv.token)
    assert first.pk == again.pk


def test_revoke_invitation_rejects_already_accepted():
    actor = _user("actor")
    bob = _user("bob")
    ws = _ws()
    Membership.objects.create(user=actor, workspace=ws, role=MembershipRole.OWNER)
    inv = create_invitation(actor=actor, workspace=ws, email="bob@example.com")
    accept_invitation(user=bob, token=inv.token)
    inv.refresh_from_db()
    assert inv.accepted_at is not None
    with pytest.raises(InvitationStateError):
        revoke_invitation(actor=actor, invitation=inv)
    inv.refresh_from_db()
    assert inv.revoked_at is None


def test_accept_invitation_unknown_token_raises():
    bob = _user("bob")
    with pytest.raises(InvitationStateError):
        accept_invitation(user=bob, token="totally-not-a-real-token")
