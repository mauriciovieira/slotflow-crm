from __future__ import annotations

import os

from .base import *  # noqa: F403

DEBUG = True

# Local/dev convenience: if Postgres isn't running, allow SQLite fallback.
if os.environ.get("SLOTFLOW_USE_SQLITE", "").strip().lower() in {"1", "true", "yes", "on"}:
    DATABASES = {  # noqa: F405
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",  # noqa: F405
        }
    }
