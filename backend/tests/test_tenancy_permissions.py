from __future__ import annotations

import pytest

from identity.models import User
from tenancy.models import Membership, MembershipRole, Workspace
from tenancy.permissions import get_membership, user_has_workspace_role


@pytest.mark.django_db
def test_membership_role_gates_access() -> None:
    owner = User.objects.create_user(username="owner", password="x")
    viewer = User.objects.create_user(username="viewer", password="x")

    ws = Workspace.objects.create(name="Acme", slug="acme")
    Membership.objects.create(workspace=ws, user=owner, role=MembershipRole.OWNER)
    Membership.objects.create(workspace=ws, user=viewer, role=MembershipRole.VIEWER)

    assert get_membership(owner, ws) is not None
    assert user_has_workspace_role(viewer, ws, min_role=MembershipRole.VIEWER) is True
    assert user_has_workspace_role(viewer, ws, min_role=MembershipRole.MEMBER) is False
    assert user_has_workspace_role(owner, ws, min_role=MembershipRole.MEMBER) is True
