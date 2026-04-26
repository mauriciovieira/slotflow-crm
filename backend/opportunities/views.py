from __future__ import annotations

import uuid

from django.db import transaction
from django.db.models import Q
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

from tenancy.models import Membership

from .models import Opportunity, OpportunityStage
from .permissions import IsWorkspaceMember
from .serializers import OpportunitySerializer, OpportunityStageTransitionSerializer
from .services import (
    WorkspaceWriteForbidden,
    archive_opportunity,
    create_opportunity,
    record_stage_transition,
)


class OpportunityViewSet(viewsets.ModelViewSet):
    """Workspace-scoped CRUD for Opportunity. Soft-delete via DELETE."""

    serializer_class = OpportunitySerializer
    permission_classes = [permissions.IsAuthenticated, IsWorkspaceMember]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        user = self.request.user
        qs = (
            Opportunity.objects.filter(
                workspace__memberships__user=user,
                archived_at__isnull=True,
            )
            .select_related("workspace", "created_by")
            .distinct()
        )

        stage = self.request.query_params.get("stage")
        if stage:
            valid = {choice for choice, _ in OpportunityStage.choices}
            if stage not in valid:
                raise ValidationError({"stage": f"Unknown stage '{stage}'."})
            qs = qs.filter(stage=stage)

        workspace = self.request.query_params.get("workspace")
        if workspace:
            try:
                uuid.UUID(workspace)
            except (ValueError, AttributeError, TypeError) as exc:
                raise ValidationError({"workspace": "Invalid workspace UUID."}) from exc
            qs = qs.filter(workspace_id=workspace)

        q = self.request.query_params.get("q")
        if q:
            qs = qs.filter(Q(title__icontains=q) | Q(company__icontains=q))

        return qs

    def _resolve_active_workspace(self, validated_data):
        """Pick the workspace for create.

        Resolution order:
        1. Request body explicitly carries `workspace`.
        2. Session-bound active workspace (set via
           `POST /api/auth/active-workspace/`). Validated against the user's
           memberships every read, so a stale session value can't promote.
        3. The user's sole membership when they have exactly one (the legacy
           single-membership shortcut).
        4. Otherwise 400 — multi-membership user with nothing picked yet.
        """
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
            opp = create_opportunity(
                actor=request.user,
                workspace=workspace,
                payload={
                    "title": serializer.validated_data["title"],
                    "company": serializer.validated_data["company"],
                    "stage": serializer.validated_data.get("stage", OpportunityStage.APPLIED),
                    "notes": serializer.validated_data.get("notes", ""),
                    "expected_total_compensation": serializer.validated_data.get(
                        "expected_total_compensation"
                    ),
                    "compensation_currency": serializer.validated_data.get(
                        "compensation_currency", ""
                    ),
                },
            )
        except WorkspaceWriteForbidden as exc:
            # Read-only viewers can't create — match the role-gated 403 the
            # `IsWorkspaceMember` permission already returns for PATCH/DELETE.
            raise PermissionDenied(str(exc)) from exc
        out = self.get_serializer(opp)
        return Response(out.data, status=status.HTTP_201_CREATED)

    def perform_update(self, serializer):
        # Wrap the stage save + history write in one transaction so a
        # failure in the second step rolls the first back. The project
        # does not enable `ATOMIC_REQUESTS`, so without this the row
        # could end up updated with no history recorded if the audit /
        # transition write blew up.
        with transaction.atomic():
            previous_stage = serializer.instance.stage
            instance = serializer.save()
            if instance.stage != previous_stage:
                record_stage_transition(
                    actor=self.request.user,
                    opportunity=instance,
                    from_stage=previous_stage,
                    to_stage=instance.stage,
                )

    def perform_destroy(self, instance):
        archive_opportunity(actor=self.request.user, opportunity=instance)

    @action(detail=True, methods=["get"], url_path="stage-history")
    def stage_history(self, request, pk=None):
        """Reverse-chronological (newest first) stage transitions on this opportunity.

        Workspace membership is enforced by `IsWorkspaceMember` via the
        viewset; if the user can read the opportunity they can read its
        stage history.
        """
        opportunity = self.get_object()
        rows = opportunity.stage_transitions.order_by("-created_at")
        return Response(OpportunityStageTransitionSerializer(rows, many=True).data)
