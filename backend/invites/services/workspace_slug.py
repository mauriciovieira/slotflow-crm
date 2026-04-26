from __future__ import annotations

import re

from django.utils.text import slugify

from tenancy.models import Workspace

_LOCAL_PART_RE = re.compile(r"[^a-z0-9-]+")


def _base(email: str) -> str:
    local = (email or "").split("@", 1)[0].lower()
    # Replace common separators with hyphens before slugify so "alice.smith+tag"
    # collapses to "alice-smith-tag" rather than "alicesmithtag".
    pre = re.sub(r"[._+\s]+", "-", local).strip("-")
    cleaned = slugify(pre) or _LOCAL_PART_RE.sub("-", pre).strip("-")
    return cleaned or "user"


def unique_slug_from_email(email: str) -> str:
    """Return a Workspace slug derived from `email`'s local part, unique in DB."""
    base = _base(email)
    candidate = base
    n = 2
    while Workspace.objects.filter(slug=candidate).exists():
        candidate = f"{base}-{n}"
        n += 1
    return candidate
