from __future__ import annotations

from rest_framework import permissions

from tenancy.models import MembershipRole
from tenancy.permissions import get_membership

WRITE_METHODS = frozenset({"POST", "PATCH", "PUT", "DELETE"})
WRITE_ROLES = frozenset({MembershipRole.OWNER, MembershipRole.MEMBER})


class IsCycleWorkspaceMember(permissions.BasePermission):
    """Object-level permission for InterviewCycle / InterviewStep / InterviewStepResume.

    Workspace authority lives on `opportunity.workspace`. Walk up:
      - Cycle: `obj.opportunity.workspace`
      - Step: `obj.cycle.opportunity.workspace`
      - StepResume link: `obj.step.cycle.opportunity.workspace`
    """

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        # Resolve the cycle via whichever ancestor link is present.
        if hasattr(obj, "opportunity"):
            cycle = obj  # InterviewCycle itself
        elif hasattr(obj, "cycle"):
            cycle = obj.cycle  # InterviewStep
        elif hasattr(obj, "step"):
            cycle = getattr(obj.step, "cycle", None)  # InterviewStepResume
        else:
            cycle = None
        if cycle is None:
            return False
        workspace = getattr(getattr(cycle, "opportunity", None), "workspace", None)
        if workspace is None:
            return False
        membership = get_membership(request.user, workspace)
        if membership is None:
            return False
        if request.method in WRITE_METHODS:
            return membership.role in WRITE_ROLES
        return True
