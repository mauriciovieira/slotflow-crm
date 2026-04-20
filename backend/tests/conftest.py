from __future__ import annotations

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.local")
os.environ.setdefault("SLOTFLOW_USE_SQLITE", "1")

import pytest


@pytest.fixture(autouse=True)
def _disable_debug_toolbar(settings):
    """Prevent django-debug-toolbar from rendering during tests.

    The Django test client uses REMOTE_ADDR=127.0.0.1, which matches
    INTERNAL_IPS and triggers the toolbar. The toolbar's template reverses
    ``djdt:render_panel`` — those URL patterns are not always registered
    once pytest-django reshuffles settings, yielding NoReverseMatch.
    """

    settings.DEBUG_TOOLBAR_CONFIG = {"SHOW_TOOLBAR_CALLBACK": lambda _request: False}
