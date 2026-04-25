from __future__ import annotations

from typing import TYPE_CHECKING

from tenancy.models import Membership, Workspace
from tenancy.permissions import get_membership

if TYPE_CHECKING:
    from django.http import HttpRequest


SESSION_KEY = "slotflow_active_workspace_id"


class WorkspaceNotMember(PermissionError):
    """Raised when the caller asks to set an active workspace they don't belong to."""


def get_active_workspace(request: HttpRequest) -> Workspace | None:
    """Resolve the caller's active workspace.

    Order of resolution:
    1. The session-stored id (validated against the user's memberships every
       call so a stale value can't promote them into a workspace they no
       longer belong to).
    2. The user's sole membership when they have exactly one (existing
       single-membership fallback).
    3. None — multi-membership user who hasn't picked yet, or no memberships.
    """
    user = getattr(request, "user", None)
    if user is None or not user.is_authenticated:
        return None

    raw = request.session.get(SESSION_KEY)
    if raw:
        try:
            workspace = Workspace.objects.get(pk=raw)
        except (Workspace.DoesNotExist, ValueError):
            request.session.pop(SESSION_KEY, None)
        else:
            if get_membership(user, workspace) is not None:
                return workspace
            # Stale session — user no longer in that workspace.
            request.session.pop(SESSION_KEY, None)

    memberships = list(Membership.objects.filter(user=user).select_related("workspace")[:2])
    if len(memberships) == 1:
        return memberships[0].workspace
    return None


def set_active_workspace(request: HttpRequest, workspace_id: str) -> Workspace:
    user = getattr(request, "user", None)
    if user is None or not user.is_authenticated:
        raise WorkspaceNotMember("Authentication required.")

    try:
        workspace = Workspace.objects.get(pk=workspace_id)
    except (Workspace.DoesNotExist, ValueError) as exc:
        raise WorkspaceNotMember(f"No workspace with id {workspace_id!r}.") from exc

    if get_membership(user, workspace) is None:
        raise WorkspaceNotMember(f"User {user.pk} has no membership in workspace {workspace.pk}.")
    request.session[SESSION_KEY] = str(workspace.pk)
    return workspace


def clear_active_workspace(request: HttpRequest) -> None:
    request.session.pop(SESSION_KEY, None)
