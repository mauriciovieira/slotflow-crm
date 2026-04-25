from __future__ import annotations

import uuid

from django.db import IntegrityError
from rest_framework import mixins, permissions, status, viewsets
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

from .models import InterviewStepResume
from .permissions import IsCycleWorkspaceMember
from .services import (
    CrossWorkspaceLinkForbidden,
    WorkspaceMembershipRequired,
    WorkspaceWriteForbidden,
    link_resume_to_step,
    unlink_step_resume,
)
from .step_resume_serializers import (
    InterviewStepResumeCreateSerializer,
    InterviewStepResumeSerializer,
)


class InterviewStepResumeViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """Workspace-scoped CRUD-ish for InterviewStepResume.

    No PATCH: links are immutable. Change note → unlink + relink.
    """

    permission_classes = [permissions.IsAuthenticated, IsCycleWorkspaceMember]
    http_method_names = ["get", "post", "delete", "head", "options"]

    def get_serializer_class(self):
        if self.action == "create":
            return InterviewStepResumeCreateSerializer
        return InterviewStepResumeSerializer

    def get_queryset(self):
        user = self.request.user
        qs = (
            InterviewStepResume.objects.filter(
                step__cycle__opportunity__workspace__memberships__user=user,
            )
            .select_related(
                "step",
                "step__cycle",
                "step__cycle__opportunity",
                "step__cycle__opportunity__workspace",
                "resume_version",
                "resume_version__base_resume",
                "created_by",
            )
            .distinct()
        )
        step = self.request.query_params.get("step")
        if step:
            try:
                uuid.UUID(step)
            except (ValueError, AttributeError, TypeError) as exc:
                raise ValidationError({"step": "Invalid step UUID."}) from exc
            qs = qs.filter(step_id=step)
        # `?cycle=` is the FE's primary filter: fetching all step links for a
        # cycle once and bucketing client-side avoids the N+1 network round-
        # trips that would happen if every step rendered its own request.
        cycle = self.request.query_params.get("cycle")
        if cycle:
            try:
                uuid.UUID(cycle)
            except (ValueError, AttributeError, TypeError) as exc:
                raise ValidationError({"cycle": "Invalid cycle UUID."}) from exc
            qs = qs.filter(step__cycle_id=cycle)
        return qs

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        step = serializer.validated_data["step"]
        resume_version = serializer.validated_data["resume_version"]
        try:
            link = link_resume_to_step(
                actor=request.user,
                step=step,
                resume_version=resume_version,
                note=serializer.validated_data.get("note", ""),
            )
        except (WorkspaceMembershipRequired, WorkspaceWriteForbidden) as exc:
            raise PermissionDenied(str(exc)) from exc
        except CrossWorkspaceLinkForbidden as exc:
            raise ValidationError({"resume_version": str(exc)}) from exc
        except IntegrityError as exc:
            # The (step, resume_version) unique constraint catches duplicate
            # links — surface as 400 instead of 500.
            raise ValidationError(
                {"non_field_errors": ["This resume version is already linked to that step."]}
            ) from exc
        # Re-fetch with the same `select_related` chain the list queryset
        # uses so the response serializer's `resume_version_summary` doesn't
        # trigger a follow-up query for `resume_version.base_resume.name`.
        hydrated = InterviewStepResume.objects.select_related(
            "step",
            "step__cycle",
            "step__cycle__opportunity",
            "step__cycle__opportunity__workspace",
            "resume_version",
            "resume_version__base_resume",
            "created_by",
        ).get(pk=link.pk)
        out = InterviewStepResumeSerializer(hydrated, context=self.get_serializer_context())
        return Response(out.data, status=status.HTTP_201_CREATED)

    def perform_destroy(self, instance):
        try:
            unlink_step_resume(actor=self.request.user, link=instance)
        except (WorkspaceMembershipRequired, WorkspaceWriteForbidden) as exc:
            raise PermissionDenied(str(exc)) from exc
