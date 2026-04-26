from __future__ import annotations

import hashlib
import secrets


def issue_token() -> tuple[str, str]:
    """Return (raw_token, sha256_hex_hash). Raw must only ever be shown once."""
    raw = secrets.token_urlsafe(32)
    return raw, hash_token(raw)


def hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def sha256_email(email: str) -> str:
    """Forensic-correlation hash. Lowercase + strip first so case differences collapse."""
    return hashlib.sha256(email.strip().lower().encode("utf-8")).hexdigest()
