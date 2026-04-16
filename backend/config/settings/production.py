from __future__ import annotations

from .base import *  # noqa: F403

DEBUG = False

if not SECRET_KEY or SECRET_KEY.startswith("dev-insecure-"):  # noqa: F405
    raise ValueError("DJANGO_SECRET_KEY must be set for production settings.")
