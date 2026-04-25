from __future__ import annotations

from datetime import date as date_type
from decimal import Decimal

from celery import shared_task

from tenancy.models import Workspace

from .services import upsert_fx_rate

# Hard-coded sample rates (1 USD = X). Replaced with a live provider
# once the integration lands; the task body otherwise stays the same.
_SAMPLE_USD_RATES: dict[str, Decimal] = {
    "EUR": Decimal("0.92"),
    "BRL": Decimal("5.05"),
    "GBP": Decimal("0.79"),
}


@shared_task(name="fx.refresh_rates", queue="fx")
def refresh_rates_for_workspace(workspace_id: str) -> int:
    """Stub that seeds today's sample rates for `workspace_id`.

    Returns the number of rate rows written. Upgrades happen by replacing
    `_SAMPLE_USD_RATES` with a live API call — the audit/upsert plumbing
    is already wired through `upsert_fx_rate`.
    """
    try:
        workspace = Workspace.objects.get(pk=workspace_id)
    except Workspace.DoesNotExist:
        # The Celery scheduler may pass a workspace that's been deleted
        # since the periodic schedule was built. Bail quietly.
        return 0
    today = date_type.today()
    written = 0
    for currency, rate in _SAMPLE_USD_RATES.items():
        upsert_fx_rate(
            actor=None,
            workspace=workspace,
            currency=currency,
            base_currency="USD",
            rate=rate,
            date=today,
            source="task",
        )
        written += 1
    return written
