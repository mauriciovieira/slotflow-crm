from __future__ import annotations

import importlib

import pytest


def _reload_production(monkeypatch, *, secret_key: str = "test-non-default-secret-key"):
    """Reload `config.settings.base` followed by `config.settings.production`
    with the env vars a real deploy sets. We have to reload `base` so the
    module-level `SECRET_KEY` constant is recomputed from the test env —
    `production` re-imports `base` via `from .base import *` but Python
    caches modules, so without the reload the production module sees the
    stale `SECRET_KEY` captured during the original conftest import.
    """
    monkeypatch.setenv("DJANGO_SECRET_KEY", secret_key)
    monkeypatch.setenv("DJANGO_ALLOWED_HOSTS", "slotflow.example.com")
    base = importlib.import_module("config.settings.base")
    importlib.reload(base)
    production = importlib.import_module("config.settings.production")
    return importlib.reload(production)


def test_production_settings_set_secure_transport_flags(monkeypatch):
    settings = _reload_production(monkeypatch)
    assert settings.SECURE_SSL_REDIRECT is True
    assert settings.SECURE_HSTS_SECONDS >= 31536000
    assert settings.SESSION_COOKIE_SECURE is True
    assert settings.CSRF_COOKIE_SECURE is True
    assert settings.SECURE_CONTENT_TYPE_NOSNIFF is True
    assert settings.X_FRAME_OPTIONS == "DENY"
    # HSTS preload is OFF by default — flip via env once the host is on
    # the preload list. Asserting the *default* documents the safety net.
    assert settings.SECURE_HSTS_PRELOAD is False


def test_production_settings_reject_default_secret_key(monkeypatch):
    """A deploy that ships with the dev placeholder secret must crash on
    import rather than silently boot insecure."""
    with pytest.raises(ValueError):
        _reload_production(monkeypatch, secret_key="dev-insecure-secret-key-change-me")
