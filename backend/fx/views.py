from __future__ import annotations

import datetime as dt
import uuid

from django.db import IntegrityError
from rest_framework import permissions, status, viewsets
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

from opportunities.permissions import IsWorkspaceMember

from .models import FxRate
from .serializers import FxRateSerializer
from .services import (
    FxRateNonManualDeleteForbidden,
    WorkspaceMembershipRequired,
    WorkspaceWriteForbidden,
    delete_fx_rate,
    upsert_fx_rate,
)


class FxRateViewSet(viewsets.ModelViewSet):
    """Workspace-scoped CRUD-ish for FxRate.

    No PATCH: rates are immutable per-day; an "edit" is an upsert with
    the same key. DELETE is restricted to `source="manual"` rows by the
    `delete_fx_rate` service — `task`/`seed` rows return 400 with a
    `non_field_errors` message. The UI hides the delete button on
    non-manual rows; the server-side check defends against stale tabs.
    Operators dropping a bad automated row do it through the Django
    admin.
    """

    serializer_class = FxRateSerializer
    permission_classes = [permissions.IsAuthenticated, IsWorkspaceMember]
    http_method_names = ["get", "post", "delete", "head", "options"]

    def get_queryset(self):
        user = self.request.user
        qs = (
            FxRate.objects.filter(workspace__memberships__user=user)
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
        currency = self.request.query_params.get("currency")
        if currency:
            qs = qs.filter(currency=currency.upper())
        date_from = self.request.query_params.get("date_from")
        if date_from:
            try:
                qs = qs.filter(date__gte=dt.date.fromisoformat(date_from))
            except ValueError as exc:
                raise ValidationError({"date_from": "Invalid date (YYYY-MM-DD)."}) from exc
        date_to = self.request.query_params.get("date_to")
        if date_to:
            try:
                qs = qs.filter(date__lte=dt.date.fromisoformat(date_to))
            except ValueError as exc:
                raise ValidationError({"date_to": "Invalid date (YYYY-MM-DD)."}) from exc
        return qs

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            obj = upsert_fx_rate(
                actor=request.user,
                workspace=serializer.validated_data["workspace"],
                currency=serializer.validated_data["currency"],
                base_currency=serializer.validated_data["base_currency"],
                rate=serializer.validated_data["rate"],
                date=serializer.validated_data["date"],
                source="manual",
            )
        except (WorkspaceMembershipRequired, WorkspaceWriteForbidden) as exc:
            raise PermissionDenied(str(exc)) from exc
        except ValueError as exc:
            # `rate <= 0` from the service. Surface as a field-keyed 400.
            raise ValidationError({"rate": str(exc)}) from exc
        except IntegrityError as exc:  # defensive — upsert path shouldn't normally trip
            raise ValidationError({"non_field_errors": ["Conflicting rate row."]}) from exc
        out = self.get_serializer(obj)
        return Response(out.data, status=status.HTTP_201_CREATED)

    def perform_destroy(self, instance):
        try:
            delete_fx_rate(actor=self.request.user, fx_rate=instance)
        except (WorkspaceMembershipRequired, WorkspaceWriteForbidden) as exc:
            raise PermissionDenied(str(exc)) from exc
        except FxRateNonManualDeleteForbidden as exc:
            # Server-side enforcement of the manual-only rule (the FE
            # already hides the button on non-manual rows). Surface as
            # 400 with a `non_field_errors` key so the FE can render
            # the message inline if a stale tab attempts the call.
            raise ValidationError({"non_field_errors": [str(exc)]}) from exc
