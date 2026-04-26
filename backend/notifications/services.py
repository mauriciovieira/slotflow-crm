from __future__ import annotations

import uuid
from collections.abc import Iterable
from typing import Any

from django.contrib.auth.models import AbstractBaseUser
from django.db import transaction

from tenancy.models import Membership, MembershipRole, Workspace

from .models import Notification


@transaction.atomic
def create_notification(
    *,
    recipient: AbstractBaseUser,
    kind: str,
    payload: dict[str, Any] | None = None,
    workspace: Workspace | None = None,
) -> Notification:
    """Persist one `Notification` row. Caller-side opt-in.

    Higher-level helpers in this module fan out to multiple recipients
    (e.g. `notify_workspace_owners`).
    """
    return Notification.objects.create(
        recipient=recipient,
        kind=kind,
        payload=payload or {},
        workspace=workspace,
    )


def notify_workspace_owners(
    *,
    workspace: Workspace,
    actor: AbstractBaseUser | None,
    kind: str,
    payload: dict[str, Any] | None = None,
) -> list[Notification]:
    """Notify every OWNER of `workspace` except the actor.

    The actor is excluded so a user doesn't get a notification for their
    own action — the audit log is the durable record for self-actions.
    System actions (`actor=None`) notify all owners.
    """
    qs = Membership.objects.filter(workspace=workspace, role=MembershipRole.OWNER).select_related(
        "user"
    )
    if actor is not None and getattr(actor, "pk", None) is not None:
        qs = qs.exclude(user_id=actor.pk)
    rows: list[Notification] = []
    for membership in qs:
        rows.append(
            create_notification(
                recipient=membership.user,
                kind=kind,
                payload=payload,
                workspace=workspace,
            )
        )
    return rows


def mark_read(*, recipient: AbstractBaseUser, ids: Iterable[Any]) -> int:
    """Mark the listed notifications as read for `recipient`.

    Returns the number of rows actually flipped (excludes already-read
    rows and rows owned by another user). Filters by `recipient` to
    keep the call workspace-isolated even if a malicious caller
    forwards another user's id. Non-UUID values in `ids` are dropped
    silently — the UUIDField filter would otherwise raise on malformed
    input and 500 the endpoint.
    """
    from django.utils import timezone

    valid_ids: list[uuid.UUID] = []
    for raw in ids:
        try:
            valid_ids.append(uuid.UUID(str(raw)))
        except (ValueError, AttributeError, TypeError):
            continue
    if not valid_ids:
        return 0
    return Notification.objects.filter(
        recipient=recipient, id__in=valid_ids, read_at__isnull=True
    ).update(read_at=timezone.now())


def mark_all_read(*, recipient: AbstractBaseUser) -> int:
    """Mark every unread notification for `recipient` as read."""
    from django.utils import timezone

    return Notification.objects.filter(recipient=recipient, read_at__isnull=True).update(
        read_at=timezone.now()
    )
