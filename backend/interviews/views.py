from __future__ import annotations

import uuid

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Count, OuterRef, Subquery
from django.http import Http404
from django.shortcuts import get_object_or_404
from rest_framework import mixins, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

from .models import InterviewCycle, InterviewStep
from .permissions import IsCycleWorkspaceMember
from .serializers import (
    InterviewCycleSerializer,
    InterviewStepCreateSerializer,
    InterviewStepSerializer,
    InterviewStepStatusSerializer,
)
from .services import (
    WorkspaceMembershipRequired,
    WorkspaceWriteForbidden,
    add_interview_step,
    start_interview_cycle,
    update_step_status,
)


class InterviewCycleViewSet(viewsets.ModelViewSet):
    """Workspace-scoped CRUD for InterviewCycle (no DELETE for this slice)."""

    serializer_class = InterviewCycleSerializer
    permission_classes = [permissions.IsAuthenticated, IsCycleWorkspaceMember]
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_queryset(self):
        user = self.request.user
        # Annotate `_steps_count` and `_last_step_status` directly on the row
        # so the list serializer renders both without prefetching the whole
        # step set. `Count` is cheap (one JOIN+aggregate) and the Subquery
        # picks just the newest step's status column.
        last_status_sq = (
            InterviewStep.objects.filter(cycle=OuterRef("pk"))
            .order_by("-sequence")
            .values("status")[:1]
        )
        qs = (
            InterviewCycle.objects.filter(
                opportunity__workspace__memberships__user=user,
            )
            .annotate(
                _steps_count=Count("steps", distinct=True),
                _last_step_status=Subquery(last_status_sq),
            )
            .select_related("opportunity", "opportunity__workspace")
            .distinct()
        )

        opportunity = self.request.query_params.get("opportunity")
        if opportunity:
            try:
                uuid.UUID(opportunity)
            except (ValueError, AttributeError, TypeError) as exc:
                raise ValidationError({"opportunity": "Invalid opportunity UUID."}) from exc
            qs = qs.filter(opportunity_id=opportunity)

        workspace = self.request.query_params.get("workspace")
        if workspace:
            try:
                uuid.UUID(workspace)
            except (ValueError, AttributeError, TypeError) as exc:
                raise ValidationError({"workspace": "Invalid workspace UUID."}) from exc
            qs = qs.filter(opportunity__workspace_id=workspace)

        return qs

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            cycle = start_interview_cycle(
                actor=request.user,
                opportunity=serializer.validated_data["opportunity"],
                name=serializer.validated_data["name"],
                notes=serializer.validated_data.get("notes", ""),
            )
        except (WorkspaceMembershipRequired, WorkspaceWriteForbidden) as exc:
            raise PermissionDenied(str(exc)) from exc
        out = self.get_serializer(cycle)
        return Response(out.data, status=status.HTTP_201_CREATED)


class InterviewStepViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    """Steps for a single InterviewCycle — `/api/interview-cycles/<cycle_id>/steps/`."""

    permission_classes = [permissions.IsAuthenticated]
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_serializer_class(self):
        if self.action == "create":
            return InterviewStepCreateSerializer
        if self.action == "set_status":
            return InterviewStepStatusSerializer
        return InterviewStepSerializer

    def _get_cycle(self) -> InterviewCycle:
        raw = self.kwargs.get("cycle_id")
        try:
            uuid.UUID(str(raw))
        except (ValueError, AttributeError, TypeError) as exc:
            raise Http404("Invalid cycle id.") from exc
        try:
            cycle = get_object_or_404(
                InterviewCycle.objects.select_related("opportunity", "opportunity__workspace"),
                pk=raw,
            )
        except DjangoValidationError as exc:
            raise Http404("Invalid cycle id.") from exc
        from tenancy.permissions import get_membership

        if get_membership(self.request.user, cycle.opportunity.workspace) is None:
            # Hide existence of cycles the caller can't see.
            raise Http404("Cycle not found.")
        return cycle

    def get_queryset(self):
        cycle = self._get_cycle()
        return InterviewStep.objects.filter(cycle=cycle)

    def create(self, request, *args, **kwargs):
        cycle = self._get_cycle()
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            step = add_interview_step(
                actor=request.user,
                cycle=cycle,
                kind=serializer.validated_data.get("kind"),
                scheduled_for=serializer.validated_data.get("scheduled_for"),
                duration_minutes=serializer.validated_data.get("duration_minutes"),
                interviewer=serializer.validated_data.get("interviewer", ""),
                notes=serializer.validated_data.get("notes", ""),
            )
        except (WorkspaceMembershipRequired, WorkspaceWriteForbidden) as exc:
            raise PermissionDenied(str(exc)) from exc
        out = InterviewStepSerializer(step, context=self.get_serializer_context())
        return Response(out.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["patch"], url_path="status")
    def set_status(self, request, cycle_id=None, pk=None):
        # Loading the cycle re-runs the membership/Http404 check; then look
        # the step up scoped to that cycle so we never leak a step from a
        # cycle the caller isn't allowed to see.
        cycle = self._get_cycle()
        step = get_object_or_404(InterviewStep, pk=pk, cycle=cycle)
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            updated = update_step_status(
                actor=request.user,
                step=step,
                status=serializer.validated_data["status"],
                notes=serializer.validated_data.get("notes"),
            )
        except (WorkspaceMembershipRequired, WorkspaceWriteForbidden) as exc:
            raise PermissionDenied(str(exc)) from exc
        out = InterviewStepSerializer(updated, context=self.get_serializer_context())
        return Response(out.data)
