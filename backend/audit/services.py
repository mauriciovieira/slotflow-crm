from __future__ import annotations

from typing import TYPE_CHECKING, Any

from django.db import models, transaction

from core.middleware.correlation_id import get_correlation_id

from .models import AuditEvent

if TYPE_CHECKING:
    from django.contrib.auth.models import AbstractBaseUser

    from tenancy.models import Workspace


SYSTEM_ACTOR_REPR = "<system>"


def format_actor_repr(actor: AbstractBaseUser | None) -> str:
    """Public helper that returns the human label we freeze on audit-style rows.

    Other apps (e.g. `opportunities.OpportunityStageTransition`) need the
    same `username (id=N)` shape on their own append-only tables so the
    label survives user deletion. Exposing it here keeps the formatting
    in one place; downstream callers should NOT reach into the leading-
    underscore alias for backward compatibility.
    """
    if actor is None:
        return SYSTEM_ACTOR_REPR
    username = getattr(actor, "username", None) or "<unknown>"
    return f"{username} (id={actor.pk})"


# Backward-compatible alias for in-app callers; new callers should import
# `format_actor_repr` directly. Kept private-prefixed so an accidental
# export from another module still resolves.
_format_actor = format_actor_repr


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
    raw_cid = correlation_id if correlation_id is not None else (get_correlation_id() or "")
    # Clamp to the model's `max_length=64` so a buggy caller passing a longer
    # value can't blow up the surrounding transaction at save time. The
    # middleware already enforces `[A-Za-z0-9-]{8,64}`; this guard is defense
    # in depth for service-layer / Celery callers that build the id by hand.
    cid = raw_cid[:64]
    event = AuditEvent.objects.create(
        actor=actor,
        actor_repr=_format_actor(actor),
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        workspace=workspace,
        correlation_id=cid,
        metadata=metadata or {},
    )
    # Fan out an in-app notification to every workspace owner except the
    # actor. Workspace-less audit events (system-only) don't fan out;
    # the audit log itself is the durable record there.
    if workspace is not None:
        # Local import to break the audit ↔ notifications cycle: the
        # notifications app imports tenancy, audit doesn't import
        # notifications at module load.
        from notifications.services import notify_workspace_owners

        notify_workspace_owners(
            workspace=workspace,
            actor=actor,
            kind=action,
            payload={
                "actor_repr": event.actor_repr,
                "entity_type": entity_type,
                "entity_id": entity_id,
                "correlation_id": cid,
                # Only the small, FE-friendly subset of metadata —
                # avoid leaking PII / large blobs into the notification
                # payload.
                **{
                    k: v
                    for k, v in (metadata or {}).items()
                    if k in {"title", "company", "name", "stage", "from", "to"}
                },
            },
        )
    return event
