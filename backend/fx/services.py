from __future__ import annotations

from decimal import Decimal
from typing import TYPE_CHECKING

from django.db import transaction

from audit.services import write_audit_event
from tenancy.models import MembershipRole
from tenancy.permissions import get_membership

from .models import FxRate

if TYPE_CHECKING:
    from datetime import date as date_type

    from django.contrib.auth.models import AbstractBaseUser

    from tenancy.models import Workspace


WRITE_ROLES = frozenset({MembershipRole.OWNER, MembershipRole.MEMBER})


class WorkspaceMembershipRequired(PermissionError):
    """Raised when an actor tries to act on a workspace they don't belong to."""


class WorkspaceWriteForbidden(PermissionError):
    """Raised when an actor has a membership but the role is read-only (viewer)."""


class FxRateMissing(LookupError):
    """Raised when no `FxRate` exists for the requested currency/date."""


def _enforce_write_role(actor, workspace) -> None:
    if actor is None:
        return
    membership = get_membership(actor, workspace)
    if membership is None:
        raise WorkspaceMembershipRequired(
            f"User {actor.pk} has no membership in workspace {workspace.pk}."
        )
    if membership.role not in WRITE_ROLES:
        raise WorkspaceWriteForbidden(
            f"User {actor.pk} has read-only membership in workspace {workspace.pk}."
        )


@transaction.atomic
def upsert_fx_rate(
    *,
    actor: AbstractBaseUser | None,
    workspace: Workspace,
    currency: str,
    base_currency: str,
    rate: Decimal | str | float,
    date: date_type,
    source: str = "manual",
) -> FxRate:
    """Create or update the FX rate row for `(workspace, currency,
    base_currency, date)`. Audit `fx_rate.upserted`."""
    _enforce_write_role(actor, workspace)
    rate_decimal = rate if isinstance(rate, Decimal) else Decimal(str(rate))
    obj, created = FxRate.objects.update_or_create(
        workspace=workspace,
        currency=currency.upper(),
        base_currency=base_currency.upper(),
        date=date,
        defaults={
            "rate": rate_decimal,
            "source": source,
            "created_by": actor,
        },
    )
    write_audit_event(
        actor=actor,
        action="fx_rate.upserted",
        entity=obj,
        workspace=workspace,
        metadata={
            "currency": obj.currency,
            "base_currency": obj.base_currency,
            "rate": str(obj.rate),
            "date": obj.date.isoformat(),
            "source": obj.source,
            "created": created,
        },
    )
    return obj


def _latest_rate_on_or_before(
    *, workspace: Workspace, currency: str, base_currency: str, date: date_type
) -> FxRate | None:
    """Pick the most-recent rate for `currency` on or before `date`. The
    canonical lookup behind `convert(...)` — driven by the
    `(workspace, currency, -date)` index."""
    return (
        FxRate.objects.filter(
            workspace=workspace,
            currency=currency.upper(),
            base_currency=base_currency.upper(),
            date__lte=date,
        )
        .order_by("-date")
        .first()
    )


def convert(
    *,
    workspace: Workspace,
    amount: Decimal | str | float,
    from_currency: str,
    to_currency: str,
    date: date_type,
    base_currency: str = "USD",
) -> Decimal:
    """Convert `amount` from `from_currency` to `to_currency` using the
    workspace's stored rates relative to `base_currency`.

    Returns a `Decimal`. Raises `FxRateMissing` if either side lacks a
    stored rate on or before `date`. Read-only — no audit row, since
    Insights compute paths can call this many times per render.
    """
    amount_decimal = amount if isinstance(amount, Decimal) else Decimal(str(amount))
    from_upper = from_currency.upper()
    to_upper = to_currency.upper()
    base_upper = base_currency.upper()

    # Identity short-circuit so a no-op call (USD→USD) doesn't require a row.
    if from_upper == to_upper:
        return amount_decimal

    def _rate(code: str) -> Decimal:
        if code == base_upper:
            return Decimal("1")
        row = _latest_rate_on_or_before(
            workspace=workspace, currency=code, base_currency=base_upper, date=date
        )
        if row is None:
            raise FxRateMissing(
                f"No FX rate for {code}/{base_upper} on or before {date.isoformat()}."
            )
        return row.rate

    rate_from = _rate(from_upper)
    rate_to = _rate(to_upper)
    # `rate` represents "1 base = X currency", so `amount` in `from` is
    # `amount / rate_from` base units, then `* rate_to` of the target.
    return (amount_decimal / rate_from) * rate_to
