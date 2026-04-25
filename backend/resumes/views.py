from __future__ import annotations

import uuid

from django.core.exceptions import ValidationError as DjangoValidationError
from django.http import Http404
from django.shortcuts import get_object_or_404
from rest_framework import mixins, permissions, status, viewsets
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

from tenancy.models import Membership

from .models import BaseResume, ResumeVersion
from .permissions import IsWorkspaceMember
from .serializers import (
    BaseResumeSerializer,
    ResumeVersionCreateSerializer,
    ResumeVersionSerializer,
)
from .services import (
    WorkspaceWriteForbidden,
    archive_resume,
    create_resume,
    create_resume_version,
)


class BaseResumeViewSet(viewsets.ModelViewSet):
    """Workspace-scoped CRUD for BaseResume. Soft-delete via DELETE."""

    serializer_class = BaseResumeSerializer
    permission_classes = [permissions.IsAuthenticated, IsWorkspaceMember]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        user = self.request.user
        qs = (
            BaseResume.objects.filter(
                workspace__memberships__user=user,
                archived_at__isnull=True,
            )
            .select_related("workspace", "created_by")
            .distinct()
        )
        workspace = self.request.query_params.get("workspace")
        if workspace:
            try:
                uuid.UUID(workspace)
            except (ValueError, AttributeError, TypeError) as exc:
                raise ValidationError({"workspace": "Invalid workspace UUID."}) from exc
            qs = qs.filter(workspace_id=workspace)
        return qs

    def _resolve_active_workspace(self, validated_data):
        from tenancy.active_workspace import get_active_workspace

        if "workspace" in validated_data and validated_data["workspace"] is not None:
            return validated_data["workspace"]

        active = get_active_workspace(self.request._request)
        if active is not None:
            return active

        memberships = list(
            Membership.objects.filter(user=self.request.user).select_related("workspace")[:2]
        )
        if len(memberships) == 0:
            raise ValidationError({"workspace": "You don't belong to any workspace yet."})
        if len(memberships) > 1:
            raise ValidationError(
                {
                    "workspace": (
                        "You belong to multiple workspaces; specify `workspace` "
                        "in the request body or pick one via "
                        "/api/auth/active-workspace/."
                    )
                }
            )
        return memberships[0].workspace

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        workspace = self._resolve_active_workspace(serializer.validated_data)
        try:
            resume = create_resume(
                actor=request.user,
                workspace=workspace,
                name=serializer.validated_data["name"],
            )
        except WorkspaceWriteForbidden as exc:
            raise PermissionDenied(str(exc)) from exc
        out = self.get_serializer(resume)
        return Response(out.data, status=status.HTTP_201_CREATED)

    def perform_destroy(self, instance):
        archive_resume(actor=self.request.user, base_resume=instance)


class ResumeVersionViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    """Versions for a single BaseResume — `/api/resumes/<base_resume_id>/versions/`."""

    permission_classes = [permissions.IsAuthenticated]
    http_method_names = ["get", "post", "head", "options"]

    def get_serializer_class(self):
        if self.action == "create":
            return ResumeVersionCreateSerializer
        return ResumeVersionSerializer

    def _get_base_resume(self) -> BaseResume:
        raw = self.kwargs.get("base_resume_id")
        try:
            uuid.UUID(str(raw))
        except (ValueError, AttributeError, TypeError) as exc:
            raise Http404("Invalid base resume id.") from exc
        try:
            base_resume = get_object_or_404(
                BaseResume.objects.select_related("workspace"),
                pk=raw,
                archived_at__isnull=True,
            )
        except DjangoValidationError as exc:
            raise Http404("Invalid base resume id.") from exc
        from tenancy.permissions import get_membership

        if get_membership(self.request.user, base_resume.workspace) is None:
            raise Http404("Base resume not found.")
        return base_resume

    def get_queryset(self):
        base_resume = self._get_base_resume()
        return ResumeVersion.objects.filter(base_resume=base_resume).select_related("created_by")

    def create(self, request, *args, **kwargs):
        base_resume = self._get_base_resume()
        serializer = ResumeVersionCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            version = create_resume_version(
                actor=request.user,
                base_resume=base_resume,
                document=serializer.validated_data["document"],
                notes=serializer.validated_data.get("notes", ""),
            )
        except WorkspaceWriteForbidden as exc:
            raise PermissionDenied(str(exc)) from exc
        out = ResumeVersionSerializer(version, context={"request": request})
        return Response(out.data, status=status.HTTP_201_CREATED)
