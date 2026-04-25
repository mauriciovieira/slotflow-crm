from __future__ import annotations

from typing import TYPE_CHECKING, Any

from django.db import models, transaction

from core.middleware.correlation_id import get_correlation_id

from .models import AuditEvent

if TYPE_CHECKING:
    from django.contrib.auth.models import AbstractBaseUser

    from tenancy.models import Workspace


SYSTEM_ACTOR_REPR = "<system>"


def _format_actor(actor: AbstractBaseUser | None) -> str:
    if actor is None:
        return SYSTEM_ACTOR_REPR
    username = getattr(actor, "username", None) or "<unknown>"
    return f"{username} (id={actor.pk})"


def _entity_descriptor(entity: models.Model | None) -> tuple[str, str]:
    """Return `(entity_type, entity_id)` for the audit row."""
    if entity is None or entity.pk is None:
        return ("", "")
    cls = type(entity)
    label = f"{cls._meta.app_label}.{cls.__name__}"
    return (label, str(entity.pk))


@transaction.atomic
def write_audit_event(
    *,
    actor: AbstractBaseUser | None,
    action: str,
    entity: models.Model | None = None,
    workspace: Workspace | None = None,
    correlation_id: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> AuditEvent:
    """Persist an `AuditEvent`. Caller-side opt-in.

    `correlation_id` defaults to the request-scoped value injected by
    `core.middleware.correlation_id` so HTTP callers don't have to thread it.
    Celery / CLI callers pass an explicit value or leave it blank.
    """
    entity_type, entity_id = _entity_descriptor(entity)
    cid = correlation_id if correlation_id is not None else (get_correlation_id() or "")
    return AuditEvent.objects.create(
        actor=actor,
        actor_repr=_format_actor(actor),
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        workspace=workspace,
        correlation_id=cid,
        metadata=metadata or {},
    )
