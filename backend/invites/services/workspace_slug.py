from __future__ import annotations

import re

from django.db import IntegrityError, transaction
from django.utils.text import slugify

from tenancy.models import Workspace

_LOCAL_PART_RE = re.compile(r"[^a-z0-9-]+")
_MAX_SLUG_ATTEMPTS = 50


def _base(email: str) -> str:
    local = (email or "").split("@", 1)[0].lower()
    # Replace common separators with hyphens before slugify so "alice.smith+tag"
    # collapses to "alice-smith-tag" rather than "alicesmithtag".
    pre = re.sub(r"[._+\s]+", "-", local).strip("-")
    cleaned = slugify(pre) or _LOCAL_PART_RE.sub("-", pre).strip("-")
    return cleaned or "user"


def create_unique_workspace(*, name: str, email: str) -> Workspace:
    """Create a Workspace with a unique slug derived from `email`.

    Atomic, race-safe: each create runs inside a savepoint, and an
    IntegrityError on the unique slug column triggers retry with the next
    candidate. Bounded so a pathological input cannot loop forever.
    """
    base = _base(email)
    for n in range(1, _MAX_SLUG_ATTEMPTS + 1):
        candidate = base if n == 1 else f"{base}-{n}"
        try:
            with transaction.atomic():
                return Workspace.objects.create(name=name, slug=candidate)
        except IntegrityError:
            continue
    raise IntegrityError(
        f"Could not find a unique workspace slug after {_MAX_SLUG_ATTEMPTS} attempts "
        f"(base={base!r})."
    )
