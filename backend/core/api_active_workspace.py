"""GET/POST/DELETE `/api/auth/active-workspace/`.

Read or set the per-session active workspace. Validated against the caller's
memberships every call so a stale session value can't promote them into a
workspace they no longer belong to.
"""

from __future__ import annotations

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response

from tenancy.active_workspace import (
    WorkspaceNotFound,
    WorkspaceNotMember,
    clear_active_workspace,
    get_active_workspace,
    set_active_workspace,
)
from tenancy.models import Membership


def _serialize(workspace) -> dict | None:
    if workspace is None:
        return None
    return {"id": str(workspace.pk), "name": workspace.name, "slug": workspace.slug}


def _payload(request: Request) -> dict:
    active = get_active_workspace(request._request)
    available_qs = (
        Membership.objects.filter(user=request.user)
        .select_related("workspace")
        .order_by("workspace__name")
    )
    return {
        "active": _serialize(active),
        "available": [_serialize(m.workspace) for m in available_qs],
    }


@api_view(["GET", "POST", "DELETE"])
@permission_classes([IsAuthenticated])
def active_workspace_view(request: Request) -> Response:
    if request.method == "GET":
        return Response(_payload(request))

    if request.method == "DELETE":
        clear_active_workspace(request._request)
        return Response(status=status.HTTP_204_NO_CONTENT)

    # `request.data` may be a plain `dict`, a DRF `QueryDict`, or any
    # `Mapping` depending on the parser; guard with the duck-typed `.get`
    # so a valid request doesn't fall through to a spurious 400.
    try:
        workspace_id = request.data.get("workspace")
    except AttributeError:
        workspace_id = None
    if not workspace_id:
        return Response({"workspace": "Missing workspace id."}, status=status.HTTP_400_BAD_REQUEST)
    try:
        set_active_workspace(request._request, str(workspace_id))
    except WorkspaceNotFound as exc:
        # Unknown / malformed UUID — caller's fault, treat as bad request.
        return Response({"workspace": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    except WorkspaceNotMember as exc:
        # Workspace exists but caller doesn't belong — forbidden.
        return Response({"workspace": str(exc)}, status=status.HTTP_403_FORBIDDEN)
    return Response(_payload(request))
