from __future__ import annotations

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.local")
os.environ.setdefault("SLOTFLOW_USE_SQLITE", "1")
