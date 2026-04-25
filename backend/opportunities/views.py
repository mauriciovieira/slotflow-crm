from __future__ import annotations

from django.db.models import Q
from rest_framework import permissions, status, viewsets
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from tenancy.models import Membership

from .models import Opportunity, OpportunityStage
from .permissions import IsWorkspaceMember
from .serializers import OpportunitySerializer
from .services import archive_opportunity, create_opportunity


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
            qs = qs.filter(workspace_id=workspace)

        q = self.request.query_params.get("q")
        if q:
            qs = qs.filter(Q(title__icontains=q) | Q(company__icontains=q))

        return qs

    def _resolve_active_workspace(self, validated_data):
        """Pick the workspace for create. Body wins; otherwise sole membership."""
        if "workspace" in validated_data and validated_data["workspace"] is not None:
            return validated_data["workspace"]
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
                        "in the request body."
                    )
                }
            )
        return memberships[0].workspace

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        workspace = self._resolve_active_workspace(serializer.validated_data)
        opp = create_opportunity(
            actor=request.user,
            workspace=workspace,
            payload={
                "title": serializer.validated_data["title"],
                "company": serializer.validated_data["company"],
                "stage": serializer.validated_data.get("stage", OpportunityStage.APPLIED),
                "notes": serializer.validated_data.get("notes", ""),
            },
        )
        out = self.get_serializer(opp)
        return Response(out.data, status=status.HTTP_201_CREATED)

    def perform_destroy(self, instance):
        archive_opportunity(actor=self.request.user, opportunity=instance)
