from __future__ import annotations

import hashlib
import secrets
from datetime import timedelta
from typing import TYPE_CHECKING

from django.core.exceptions import PermissionDenied
from django.db import transaction
from django.utils import timezone

from audit.services import write_audit_event
from mcp.models import McpToken

if TYPE_CHECKING:
    import uuid

    from django.contrib.auth.models import AbstractBaseUser


PLAINTEXT_PREFIX = "slt_"
DEFAULT_TTL_DAYS = 30
MAX_TTL_DAYS = 365


def _hash_plaintext(plaintext: str) -> str:
    return hashlib.sha256(plaintext.encode("utf-8")).hexdigest()


def _generate_plaintext() -> str:
    return f"{PLAINTEXT_PREFIX}{secrets.token_urlsafe(32)}"


@transaction.atomic
def issue_token(
    *, actor: AbstractBaseUser, name: str, ttl_days: int = DEFAULT_TTL_DAYS
) -> tuple[McpToken, str]:
    """Create a new McpToken row, returning `(record, plaintext)`.

    The plaintext is the only place the secret is exposed; the caller must
    show it to the user once and discard. The model stores only the hash and
    the last four characters of the plaintext for UI preview.
    """
    if ttl_days < 1 or ttl_days > MAX_TTL_DAYS:
        raise ValueError(f"ttl_days must be between 1 and {MAX_TTL_DAYS}.")
    plaintext = _generate_plaintext()
    token_hash = _hash_plaintext(plaintext)
    record = McpToken.objects.create(
        user=actor,
        name=name,
        token_hash=token_hash,
        last_four=plaintext[-4:],
        expires_at=timezone.now() + timedelta(days=ttl_days),
    )
    # Audit only the safe-to-log fields. The plaintext never leaves this
    # function — `last_four` and `expires_at` are enough to identify the
    # token in the log without weakening the at-rest hash guarantee.
    write_audit_event(
        actor=actor,
        action="mcp_token.issued",
        entity=record,
        metadata={
            "name": record.name,
            "expires_at": record.expires_at.isoformat(),
            "ttl_days": ttl_days,
            "last_four": record.last_four,
        },
    )
    return record, plaintext


@transaction.atomic
def revoke_token(*, actor: AbstractBaseUser, token_id: uuid.UUID) -> McpToken:
    """Mark a token revoked. Idempotent. Raises PermissionDenied for non-owners."""
    try:
        token = McpToken.objects.select_for_update().get(pk=token_id)
    except McpToken.DoesNotExist as exc:
        raise McpToken.DoesNotExist(f"No McpToken with id {token_id}.") from exc
    if token.user_id != actor.pk:
        raise PermissionDenied("You do not own that token.")
    already_revoked = token.revoked_at is not None
    if not already_revoked:
        token.revoked_at = timezone.now()
        token.save(update_fields=["revoked_at", "updated_at"])
    write_audit_event(
        actor=actor,
        action="mcp_token.revoked",
        entity=token,
        metadata={
            "name": token.name,
            "last_four": token.last_four,
            "already_revoked": already_revoked,
        },
    )
    return token
