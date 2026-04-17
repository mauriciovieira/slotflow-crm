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

INSTALLED_APPS += [
    "django_extensions",
    "debug_toolbar",
]

# https://django-debug-toolbar.readthedocs.io/en/latest/installation.html
MIDDLEWARE.insert(1, "debug_toolbar.middleware.DebugToolbarMiddleware")

INTERNAL_IPS = ["127.0.0.1", "::1"]
