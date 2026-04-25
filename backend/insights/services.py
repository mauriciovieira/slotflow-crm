from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date as date_type
from decimal import Decimal
from typing import TYPE_CHECKING

from fx.services import FxRateMissing, convert
from opportunities.models import Opportunity

if TYPE_CHECKING:
    from tenancy.models import Workspace


@dataclass
class CompensationLineItem:
    opportunity_id: str
    title: str
    company: str
    stage: str
    source_amount: Decimal
    source_currency: str
    converted_amount: Decimal


@dataclass
class SkippedOpportunity:
    opportunity_id: str
    title: str
    company: str
    reason: str


@dataclass
class CompensationSnapshot:
    workspace_id: str
    target_currency: str
    date: date_type
    total: Decimal
    line_items: list[CompensationLineItem] = field(default_factory=list)
    skipped: list[SkippedOpportunity] = field(default_factory=list)


def compute_compensation_snapshot(
    *,
    workspace: Workspace,
    target_currency: str,
    date: date_type,
) -> CompensationSnapshot:
    """Sum expected compensation across active opportunities, converted to
    `target_currency` using the workspace's stored FX rates.

    Read-only — no audit row, since callers may render this often. The
    caller (DRF view) is responsible for the workspace membership check.
    Returns the partial total when an FX rate is missing for one row,
    listing those rows under `skipped` so the UI can surface them.
    """
    target_upper = target_currency.upper()
    snapshot = CompensationSnapshot(
        workspace_id=str(workspace.pk),
        target_currency=target_upper,
        date=date,
        total=Decimal("0"),
    )

    rows = Opportunity.objects.filter(
        workspace=workspace,
        archived_at__isnull=True,
    ).order_by("-created_at")

    for opp in rows:
        if opp.expected_total_compensation is None or not opp.compensation_currency:
            snapshot.skipped.append(
                SkippedOpportunity(
                    opportunity_id=str(opp.pk),
                    title=opp.title,
                    company=opp.company,
                    reason="missing-comp-fields",
                )
            )
            continue
        try:
            converted = convert(
                workspace=workspace,
                amount=opp.expected_total_compensation,
                from_currency=opp.compensation_currency,
                to_currency=target_upper,
                date=date,
            )
        except FxRateMissing:
            snapshot.skipped.append(
                SkippedOpportunity(
                    opportunity_id=str(opp.pk),
                    title=opp.title,
                    company=opp.company,
                    reason="fx-rate-missing",
                )
            )
            continue
        snapshot.line_items.append(
            CompensationLineItem(
                opportunity_id=str(opp.pk),
                title=opp.title,
                company=opp.company,
                stage=opp.stage,
                source_amount=opp.expected_total_compensation,
                source_currency=opp.compensation_currency,
                converted_amount=converted,
            )
        )
        snapshot.total += converted

    return snapshot
