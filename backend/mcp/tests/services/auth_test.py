from __future__ import annotations

import pytest
from django.contrib.auth.models import AnonymousUser
from django.test import RequestFactory

from identity.models import User
from mcp.auth import McpAuthError, mark_otp_session_fresh, require_fresh_2fa_session


@pytest.mark.django_db
def test_mcp_requires_authentication() -> None:
    request = RequestFactory().get("/mcp/ping")
    request.session = {}
    request.user = AnonymousUser()

    with pytest.raises(McpAuthError) as excinfo:
        require_fresh_2fa_session(request)

    assert excinfo.value.status_code == 401


@pytest.mark.django_db
def test_mcp_requires_verified_user() -> None:
    user = User.objects.create_user(username="u1", password="x")
    request = RequestFactory().get("/mcp/ping")
    request.session = {}
    request.user = user

    with pytest.raises(McpAuthError) as excinfo:
        require_fresh_2fa_session(request)

    assert "OTP" in excinfo.value.message


@pytest.mark.django_db
def test_mcp_requires_fresh_mark_in_session(monkeypatch: pytest.MonkeyPatch) -> None:
    user = User.objects.create_user(username="u2", password="x")

    request = RequestFactory().get("/mcp/ping")
    request.session = {}
    request.user = user

    monkeypatch.setattr(user, "is_verified", lambda: True, raising=False)

    with pytest.raises(McpAuthError):
        require_fresh_2fa_session(request)

    mark_otp_session_fresh(request)
    require_fresh_2fa_session(request, max_age_seconds=3600)
