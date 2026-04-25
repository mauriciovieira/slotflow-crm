from __future__ import annotations

from rest_framework import permissions

from tenancy.models import MembershipRole
from tenancy.permissions import get_membership

WRITE_METHODS = frozenset({"POST", "PATCH", "PUT", "DELETE"})
WRITE_ROLES = frozenset({MembershipRole.OWNER, MembershipRole.MEMBER})


class IsWorkspaceMember(permissions.BasePermission):
    """Object-level permission: caller must be a member of `obj.workspace`.

    For mutating verbs the caller's `Membership.role` must additionally be one
    of `WRITE_ROLES` (owner or member); viewers are read-only.
    """

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        workspace = getattr(obj, "workspace", None)
        if workspace is None:
            workspace = getattr(getattr(obj, "base_resume", None), "workspace", None)
        if workspace is None:
            return False
        membership = get_membership(request.user, workspace)
        if membership is None:
            return False
        if request.method in WRITE_METHODS:
            return membership.role in WRITE_ROLES
        return True
