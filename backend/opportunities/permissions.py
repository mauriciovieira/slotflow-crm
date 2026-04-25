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
        # Authenticated-only at the view-permission layer. Membership /
        # write-role enforcement happens deeper:
        #   - List: get_queryset filters by `workspace__memberships__user`,
        #     so non-members get an empty list (or 404 for retrieve).
        #   - Create: the relevant service helper (`create_opportunity` /
        #     `archive_opportunity` / `link_resume_to_opportunity`, etc.)
        #     calls `_enforce_write_role`, which raises
        #     `WorkspaceMembershipRequired` / `WorkspaceWriteForbidden`.
        #     The viewset translates those to 403.
        #   - Update / Destroy: `has_object_permission` below runs the same
        #     membership + write-role gate against the resolved workspace.
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        # Resolve the workspace from `obj` directly when present, otherwise
        # walk through `opportunity` (this lets `OpportunityResume` rows
        # share the same permission class without subclassing).
        workspace = getattr(obj, "workspace", None)
        if workspace is None:
            workspace = getattr(getattr(obj, "opportunity", None), "workspace", None)
        if workspace is None:
            return False
        membership = get_membership(request.user, workspace)
        if membership is None:
            return False
        if request.method in WRITE_METHODS:
            return membership.role in WRITE_ROLES
        return True
