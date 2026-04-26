from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model

from tenancy.models import Membership, MembershipRole, Workspace
from tenancy.services import (
    LastOwnerError,
    change_role,
    guard_last_owner,
    remove_member,
    transfer_ownership,
)

pytestmark = pytest.mark.django_db


def _user(name="alice"):
    return get_user_model().objects.create_user(
        username=name, email=f"{name}@example.com", password="x"
    )


def _ws(slug="ws-a"):
    return Workspace.objects.create(name=f"Workspace {slug}", slug=slug)


def test_guard_last_owner_blocks_demote_of_only_owner():
    actor = _user("actor")
    ws = _ws()
    only = Membership.objects.create(user=actor, workspace=ws, role=MembershipRole.OWNER)
    with pytest.raises(LastOwnerError):
        guard_last_owner(membership=only, action="demote")


def test_guard_last_owner_allows_demote_when_another_owner_exists():
    a = _user("a")
    b = _user("b")
    ws = _ws()
    m_a = Membership.objects.create(user=a, workspace=ws, role=MembershipRole.OWNER)
    Membership.objects.create(user=b, workspace=ws, role=MembershipRole.OWNER)
    # Should not raise.
    guard_last_owner(membership=m_a, action="demote")


def test_change_role_demote_last_owner_raises():
    actor = _user("actor")
    ws = _ws()
    only = Membership.objects.create(user=actor, workspace=ws, role=MembershipRole.OWNER)
    with pytest.raises(LastOwnerError):
        change_role(actor=actor, membership=only, new_role=MembershipRole.MEMBER)
    only.refresh_from_db()
    assert only.role == MembershipRole.OWNER


def test_change_role_promote_member_to_owner_works():
    a = _user("a")
    b = _user("b")
    ws = _ws()
    Membership.objects.create(user=a, workspace=ws, role=MembershipRole.OWNER)
    m_b = Membership.objects.create(user=b, workspace=ws, role=MembershipRole.MEMBER)
    change_role(actor=a, membership=m_b, new_role=MembershipRole.OWNER)
    m_b.refresh_from_db()
    assert m_b.role == MembershipRole.OWNER


def test_remove_member_last_owner_raises():
    actor = _user("actor")
    ws = _ws()
    only = Membership.objects.create(user=actor, workspace=ws, role=MembershipRole.OWNER)
    with pytest.raises(LastOwnerError):
        remove_member(actor=actor, membership=only)
    assert Membership.objects.filter(pk=only.pk).exists()


def test_transfer_ownership_promotes_target_and_demotes_self_by_default():
    a = _user("a")
    b = _user("b")
    ws = _ws()
    m_a = Membership.objects.create(user=a, workspace=ws, role=MembershipRole.OWNER)
    m_b = Membership.objects.create(user=b, workspace=ws, role=MembershipRole.MEMBER)
    transfer_ownership(actor=a, actor_membership=m_a, target_membership=m_b)
    m_a.refresh_from_db()
    m_b.refresh_from_db()
    assert m_a.role == MembershipRole.MEMBER
    assert m_b.role == MembershipRole.OWNER


def test_transfer_ownership_keeps_actor_owner_when_demote_self_false():
    a = _user("a")
    b = _user("b")
    ws = _ws()
    m_a = Membership.objects.create(user=a, workspace=ws, role=MembershipRole.OWNER)
    m_b = Membership.objects.create(user=b, workspace=ws, role=MembershipRole.MEMBER)
    transfer_ownership(actor=a, actor_membership=m_a, target_membership=m_b, demote_self=False)
    m_a.refresh_from_db()
    m_b.refresh_from_db()
    assert m_a.role == MembershipRole.OWNER
    assert m_b.role == MembershipRole.OWNER
