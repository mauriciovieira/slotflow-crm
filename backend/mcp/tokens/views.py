from __future__ import annotations

from django.core.exceptions import PermissionDenied
from rest_framework import permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.request import Request
from rest_framework.response import Response

from mcp.auth import McpAuthError, require_fresh_2fa_session
from mcp.models import McpToken

from .serializers import McpTokenIssueSerializer, McpTokenSerializer
from .services import issue_token, revoke_token


def _check_fresh_2fa(request: Request) -> Response | None:
    """Run the freshness gate; return a Response on failure, None on pass."""
    try:
        require_fresh_2fa_session(request._request)
    except McpAuthError as exc:
        return Response({"detail": exc.message}, status=exc.status_code)
    return None


@api_view(["GET", "POST"])
@permission_classes([permissions.IsAuthenticated])
def collection_view(request: Request) -> Response:
    blocked = _check_fresh_2fa(request)
    if blocked is not None:
        return blocked

    if request.method == "GET":
        qs = McpToken.objects.filter(user=request.user)
        return Response(McpTokenSerializer(qs, many=True).data)

    serializer = McpTokenIssueSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    record, plaintext = issue_token(
        actor=request.user,
        name=serializer.validated_data["name"],
        ttl_days=serializer.validated_data.get("ttl_days"),
    )
    payload = McpTokenSerializer(record).data
    payload["plaintext"] = plaintext
    return Response(payload, status=status.HTTP_201_CREATED)


@api_view(["DELETE"])
@permission_classes([permissions.IsAuthenticated])
def detail_view(request: Request, token_id) -> Response:
    blocked = _check_fresh_2fa(request)
    if blocked is not None:
        return blocked

    try:
        revoke_token(actor=request.user, token_id=token_id)
    except McpToken.DoesNotExist:
        return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
    except PermissionDenied as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_403_FORBIDDEN)
    return Response(status=status.HTTP_204_NO_CONTENT)
