from __future__ import annotations

import os

import pytest

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.local")
os.environ.setdefault("SLOTFLOW_USE_SQLITE", "1")


@pytest.fixture(autouse=True)
def _disable_debug_toolbar(settings):
    """Prevent django-debug-toolbar from rendering during tests.

    The Django test client uses REMOTE_ADDR=127.0.0.1, which matches
    INTERNAL_IPS and triggers the toolbar. The toolbar's template reverses
    ``djdt:render_panel`` — those URL patterns are not always registered
    once pytest-django reshuffles settings, yielding NoReverseMatch.
    """

    settings.DEBUG_TOOLBAR_CONFIG = {"SHOW_TOOLBAR_CALLBACK": lambda _request: False}


@pytest.fixture(autouse=True)
def _clear_throttle_cache_between_tests():
    """Clear the default cache before/after every test.

    DRF's `SimpleRateThrottle` stores buckets in the `default` cache.
    Without this, two consecutive auth tests share a bucket and the
    second one starts already-throttled — even if the first test wasn't
    about throttling at all. Cheap (LocMemCache `.clear()` is O(1)) and
    keeps tests independent.
    """
    from django.core.cache import cache

    cache.clear()
    yield
    cache.clear()
