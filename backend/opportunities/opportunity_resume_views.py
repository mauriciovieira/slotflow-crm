from __future__ import annotations

import uuid

from django.db import IntegrityError
from rest_framework import mixins, permissions, status, viewsets
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

from .models import OpportunityResume
from .opportunity_resume_serializers import (
    OpportunityResumeCreateSerializer,
    OpportunityResumeSerializer,
)
from .permissions import IsWorkspaceMember
from .services import (
    CrossWorkspaceLinkForbidden,
    WorkspaceMembershipRequired,
    WorkspaceWriteForbidden,
    link_resume_to_opportunity,
    unlink_resume,
)


class OpportunityResumeViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """Workspace-scoped CRUD-ish for OpportunityResume.

    No PATCH: links are immutable; to change role or note, unlink + relink.
    """

    permission_classes = [permissions.IsAuthenticated, IsWorkspaceMember]
    http_method_names = ["get", "post", "delete", "head", "options"]

    def get_serializer_class(self):
        if self.action == "create":
            return OpportunityResumeCreateSerializer
        return OpportunityResumeSerializer

    def get_queryset(self):
        user = self.request.user
        qs = (
            OpportunityResume.objects.filter(
                opportunity__workspace__memberships__user=user,
            )
            .select_related(
                "opportunity",
                "opportunity__workspace",
                "resume_version",
                "resume_version__base_resume",
                "created_by",
            )
            .distinct()
        )
        opportunity = self.request.query_params.get("opportunity")
        if opportunity:
            try:
                uuid.UUID(opportunity)
            except (ValueError, AttributeError, TypeError) as exc:
                raise ValidationError({"opportunity": "Invalid opportunity UUID."}) from exc
            qs = qs.filter(opportunity_id=opportunity)
        return qs

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        opportunity = serializer.validated_data["opportunity"]
        resume_version = serializer.validated_data["resume_version"]
        try:
            link = link_resume_to_opportunity(
                actor=request.user,
                opportunity=opportunity,
                resume_version=resume_version,
                role=serializer.validated_data["role"],
                note=serializer.validated_data.get("note", ""),
            )
        except (WorkspaceMembershipRequired, WorkspaceWriteForbidden) as exc:
            raise PermissionDenied(str(exc)) from exc
        except CrossWorkspaceLinkForbidden as exc:
            raise ValidationError({"resume_version": str(exc)}) from exc
        except IntegrityError as exc:
            # The (opportunity, resume_version, role) unique constraint
            # can fire on duplicate links. Surface as a 400 so the FE can
            # render a sensible message instead of a 500.
            raise ValidationError(
                {
                    "non_field_errors": [
                        "This resume version is already linked to the opportunity with that role."
                    ]
                }
            ) from exc
        out = OpportunityResumeSerializer(link, context=self.get_serializer_context())
        return Response(out.data, status=status.HTTP_201_CREATED)

    def perform_destroy(self, instance):
        try:
            unlink_resume(actor=self.request.user, link=instance)
        except (WorkspaceMembershipRequired, WorkspaceWriteForbidden) as exc:
            raise PermissionDenied(str(exc)) from exc
