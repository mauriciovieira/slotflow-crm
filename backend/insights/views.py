from __future__ import annotations

import datetime as dt
import uuid

from django.http import Http404
from django.shortcuts import get_object_or_404
from rest_framework import permissions
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from tenancy.models import Workspace
from tenancy.permissions import get_membership

from .services import compute_compensation_snapshot


def _serialize_snapshot(snapshot) -> dict:
    """Render a `CompensationSnapshot` for the wire.

    Decimals → strings so JSON parsing doesn't fold them to floats.
    """
    return {
        "workspace_id": snapshot.workspace_id,
        "target_currency": snapshot.target_currency,
        "date": snapshot.date.isoformat(),
        "total": str(snapshot.total),
        "line_items": [
            {
                "opportunity_id": item.opportunity_id,
                "title": item.title,
                "company": item.company,
                "stage": item.stage,
                "source_amount": str(item.source_amount),
                "source_currency": item.source_currency,
                "converted_amount": str(item.converted_amount),
            }
            for item in snapshot.line_items
        ],
        "skipped": [
            {
                "opportunity_id": s.opportunity_id,
                "title": s.title,
                "company": s.company,
                "reason": s.reason,
            }
            for s in snapshot.skipped
        ],
    }


class CompensationSnapshotView(APIView):
    """`GET /api/insights/compensation-snapshot/?workspace=&currency=&date=`.

    Required: `workspace`. Optional: `currency` (default `USD`),
    `date` (default today). Membership-gated: viewers can read.
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        workspace_raw = request.query_params.get("workspace")
        if not workspace_raw:
            raise ValidationError({"workspace": "Required."})
        try:
            uuid.UUID(workspace_raw)
        except (ValueError, AttributeError, TypeError) as exc:
            raise ValidationError({"workspace": "Invalid UUID."}) from exc
        workspace = get_object_or_404(Workspace, pk=workspace_raw)
        if get_membership(request.user, workspace) is None:
            # Hide existence of workspaces the caller can't see.
            raise Http404("Workspace not found.")

        currency = request.query_params.get("currency") or "USD"
        date_raw = request.query_params.get("date")
        if date_raw:
            try:
                date = dt.date.fromisoformat(date_raw)
            except ValueError as exc:
                raise ValidationError({"date": "Invalid date (YYYY-MM-DD)."}) from exc
        else:
            date = dt.date.today()

        snapshot = compute_compensation_snapshot(
            workspace=workspace,
            target_currency=currency,
            date=date,
        )
        return Response(_serialize_snapshot(snapshot))
