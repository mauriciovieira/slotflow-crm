from __future__ import annotations

import uuid

from rest_framework import permissions, status
from rest_framework.generics import ListAPIView
from rest_framework.pagination import PageNumberPagination
from rest_framework.request import Request
from rest_framework.response import Response

from tenancy.models import MembershipRole, Workspace
from tenancy.permissions import user_has_workspace_role

from .models import AuditEvent
from .serializers import AuditEventSerializer


class AuditEventPagination(PageNumberPagination):
    page_size = 50
    page_size_query_param = "page_size"
    max_page_size = 200


class AuditEventListView(ListAPIView):
    """Owner-only read of `AuditEvent` rows scoped to one workspace.

    Query params:
        workspace (uuid, required) — the workspace to scope on.
        action (str, optional)     — exact match on the `action` field.
        entity_type (str, optional)
        entity_id (str, optional)

    Authz: requires the requesting user to hold OWNER on the workspace.
    Member / viewer roles return 403 — the audit log can leak who did what
    across the whole team and is not a default member surface.
    """

    serializer_class = AuditEventSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = AuditEventPagination

    def list(self, request: Request, *args, **kwargs) -> Response:
        workspace_id = request.query_params.get("workspace")
        if not workspace_id:
            return Response(
                {"detail": "workspace query parameter is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            uuid.UUID(workspace_id)
        except ValueError:
            return Response(
                {"detail": "workspace must be a UUID."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        workspace = Workspace.objects.filter(pk=workspace_id).first()
        if workspace is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        if not user_has_workspace_role(request.user, workspace, min_role=MembershipRole.OWNER):
            return Response(
                {"detail": "Owner role required to view the audit log."},
                status=status.HTTP_403_FORBIDDEN,
            )
        return super().list(request, *args, **kwargs)

    def get_queryset(self):
        params = self.request.query_params
        qs = AuditEvent.objects.filter(workspace_id=params.get("workspace"))
        if action := params.get("action"):
            qs = qs.filter(action=action)
        if entity_type := params.get("entity_type"):
            qs = qs.filter(entity_type=entity_type)
        if entity_id := params.get("entity_id"):
            qs = qs.filter(entity_id=entity_id)
        return qs.order_by("-created_at")
