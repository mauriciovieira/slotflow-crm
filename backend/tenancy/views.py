from __future__ import annotations

from django.core.exceptions import ValidationError
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.request import Request
from rest_framework.response import Response

from .models import Invitation, Membership, MembershipRole, Workspace
from .permissions import get_membership, user_has_workspace_role
from .serializers import InvitationSerializer, MemberSerializer
from .services import (
    InvitationConflictError,
    InvitationStateError,
    LastOwnerError,
    accept_invitation,
    change_role,
    create_invitation,
    remove_member,
    revoke_invitation,
    transfer_ownership,
)


def _require_workspace_membership(user, workspace_id):
    """Return `(workspace, membership)`. `membership` is `None` for outsiders.

    Callers translate `None` into a 404 so we don't leak the existence of a
    workspace the requester doesn't belong to.
    """
    workspace = get_object_or_404(Workspace, pk=workspace_id)
    membership = get_membership(user, workspace)
    return workspace, membership


def _err(detail: str, code: int = status.HTTP_400_BAD_REQUEST) -> Response:
    return Response({"detail": detail}, status=code)


_TRUTHY = {"1", "true", "yes", "on"}
_FALSY = {"0", "false", "no", "off", ""}


def _parse_bool(value, *, default: bool = False) -> bool:
    """Parse a JSON value as a bool. Strings like ``"false"`` and ``"0"``
    coerce to ``False`` instead of being treated as truthy non-empty
    strings, which is what `bool(value)` would do otherwise.
    """
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in _TRUTHY:
            return True
        if normalized in _FALSY:
            return False
    return default


def _validation_message(exc: ValidationError) -> str:
    """Pull a single human string out of a Django `ValidationError`."""
    if hasattr(exc, "message") and isinstance(exc.message, str):
        return exc.message
    if hasattr(exc, "messages") and exc.messages:
        return exc.messages[0]
    return str(exc)


@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def list_members_view(request: Request, workspace_id):
    workspace, membership = _require_workspace_membership(request.user, workspace_id)
    if membership is None:
        return _err("Workspace not found.", status.HTTP_404_NOT_FOUND)
    qs = (
        Membership.objects.filter(workspace=workspace)
        .select_related("user")
        .order_by("user__username")
    )
    return Response(MemberSerializer(qs, many=True).data)


@api_view(["PATCH", "DELETE"])
@permission_classes([permissions.IsAuthenticated])
def member_detail_view(request: Request, workspace_id, membership_id):
    workspace, requester_membership = _require_workspace_membership(request.user, workspace_id)
    if requester_membership is None:
        return _err("Workspace not found.", status.HTTP_404_NOT_FOUND)
    membership = get_object_or_404(Membership, pk=membership_id, workspace=workspace)
    is_owner = user_has_workspace_role(request.user, workspace, min_role=MembershipRole.OWNER)
    is_self = membership.user_id == request.user.pk

    if request.method == "PATCH":
        if not is_owner:
            return _err("Owner role required.", status.HTTP_403_FORBIDDEN)
        new_role = request.data.get("role")
        if not new_role:
            return _err("`role` is required.")
        try:
            change_role(actor=request.user, membership=membership, new_role=new_role)
        except LastOwnerError as exc:
            return _err(_validation_message(exc), status.HTTP_409_CONFLICT)
        except ValidationError as exc:
            return _err(_validation_message(exc))
        return Response(MemberSerializer(membership).data)

    # DELETE: owners can remove anyone; non-owners can only self-leave.
    if not is_owner and not is_self:
        return _err("You can only remove yourself.", status.HTTP_403_FORBIDDEN)
    try:
        remove_member(actor=request.user, membership=membership)
    except LastOwnerError as exc:
        return _err(_validation_message(exc), status.HTTP_409_CONFLICT)
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def transfer_ownership_view(request: Request, workspace_id):
    workspace, requester_membership = _require_workspace_membership(request.user, workspace_id)
    if requester_membership is None:
        return _err("Workspace not found.", status.HTTP_404_NOT_FOUND)
    if not user_has_workspace_role(request.user, workspace, min_role=MembershipRole.OWNER):
        return _err("Owner role required.", status.HTTP_403_FORBIDDEN)
    target_id = request.data.get("to_membership_id")
    if not target_id:
        return _err("`to_membership_id` is required.")
    target = get_object_or_404(Membership, pk=target_id, workspace=workspace)
    demote_self = _parse_bool(request.data.get("demote_self"), default=True)
    try:
        transfer_ownership(
            actor=request.user,
            actor_membership=requester_membership,
            target_membership=target,
            demote_self=demote_self,
        )
    except ValidationError as exc:
        return _err(_validation_message(exc))
    return Response({"ok": True})


@api_view(["GET", "POST"])
@permission_classes([permissions.IsAuthenticated])
def invitations_view(request: Request, workspace_id):
    workspace, requester_membership = _require_workspace_membership(request.user, workspace_id)
    if requester_membership is None:
        return _err("Workspace not found.", status.HTTP_404_NOT_FOUND)
    if not user_has_workspace_role(request.user, workspace, min_role=MembershipRole.OWNER):
        return _err("Owner role required.", status.HTTP_403_FORBIDDEN)

    if request.method == "GET":
        # Only surface invitations that are still actionable. Expired
        # rows would otherwise dangle in the UI and conflict with
        # `create_invitation`'s "expired ⇒ no conflict" rule.
        qs = Invitation.objects.filter(
            workspace=workspace,
            accepted_at__isnull=True,
            revoked_at__isnull=True,
            expires_at__gt=timezone.now(),
        ).order_by("-created_at")
        return Response(InvitationSerializer(qs, many=True).data)

    email = request.data.get("email", "")
    role = request.data.get("role") or MembershipRole.MEMBER
    try:
        invitation = create_invitation(
            actor=request.user, workspace=workspace, email=email, role=role
        )
    except InvitationConflictError as exc:
        return _err(_validation_message(exc), status.HTTP_409_CONFLICT)
    except ValidationError as exc:
        return _err(_validation_message(exc))
    payload = InvitationSerializer(invitation).data
    # The token is private — only returned at creation so the owner can copy
    # the accept link. Subsequent listings never include it.
    payload["token"] = invitation.token
    return Response(payload, status=status.HTTP_201_CREATED)


@api_view(["DELETE"])
@permission_classes([permissions.IsAuthenticated])
def invitation_detail_view(request: Request, workspace_id, invitation_id):
    workspace, requester_membership = _require_workspace_membership(request.user, workspace_id)
    if requester_membership is None:
        return _err("Workspace not found.", status.HTTP_404_NOT_FOUND)
    if not user_has_workspace_role(request.user, workspace, min_role=MembershipRole.OWNER):
        return _err("Owner role required.", status.HTTP_403_FORBIDDEN)
    invitation = get_object_or_404(Invitation, pk=invitation_id, workspace=workspace)
    try:
        revoke_invitation(actor=request.user, invitation=invitation)
    except InvitationStateError as exc:
        return _err(_validation_message(exc), status.HTTP_409_CONFLICT)
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def accept_invitation_view(request: Request, token: str):
    try:
        membership = accept_invitation(user=request.user, token=token)
    except InvitationStateError as exc:
        return _err(_validation_message(exc), status.HTTP_409_CONFLICT)
    return Response(
        {
            "membership_id": str(membership.pk),
            "workspace_id": str(membership.workspace_id),
            "role": membership.role,
        }
    )
