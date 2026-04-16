from __future__ import annotations

import os
from pathlib import Path
from typing import Final

from dotenv import load_dotenv

_TRUE_VALUES: Final[frozenset[str]] = frozenset({"1", "true", "yes", "on"})


def load_env(base_dir: Path) -> None:
    """Load local `.env` files if present (never required in production).

    Precedence for duplicate keys (``override=False``): OS environment, then
    repo-root ``.env``, then ``backend/.env``.
    """

    repo_root = base_dir.parent
    load_dotenv(repo_root / ".env", override=False)
    load_dotenv(base_dir / ".env", override=False)


def env_bool(name: str, default: bool = False) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in _TRUE_VALUES
