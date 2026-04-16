from __future__ import annotations

from django.contrib.auth import get_user_model
from django.http import Http404

from tenancy.models import Membership, MembershipRole, Workspace

User = get_user_model()


def get_membership(user: User, workspace: Workspace) -> Membership | None:
    return Membership.objects.filter(workspace=workspace, user=user).first()


def user_has_workspace_role(
    user: User,
    workspace: Workspace,
    *,
    min_role: MembershipRole = MembershipRole.VIEWER,
) -> bool:
    membership = get_membership(user, workspace)
    if membership is None:
        return False

    order = {
        MembershipRole.VIEWER: 0,
        MembershipRole.MEMBER: 1,
        MembershipRole.OWNER: 2,
    }
    return order[MembershipRole(membership.role)] >= order[min_role]


def require_membership(user: User, workspace: Workspace) -> Membership:
    membership = get_membership(user, workspace)
    if membership is None:
        raise Http404
    return membership
