from __future__ import annotations

import uuid

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

from mcp.auth import McpAuthError
from mcp.tokens.services import issue_token

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _bypass_2fa_middleware(monkeypatch):
    monkeypatch.setattr("core.middleware.require_2fa.is_2fa_bypass_active", lambda: True)


@pytest.fixture
def fresh_2fa(monkeypatch):
    """Make `require_fresh_2fa_session` a no-op (the user is verified)."""
    monkeypatch.setattr("mcp.tokens.views.require_fresh_2fa_session", lambda req: None)


def _user(username="alice"):
    return get_user_model().objects.create_user(
        username=username, email=f"{username}@example.com", password="x"
    )


def _client(user=None) -> APIClient:
    client = APIClient()
    if user is not None:
        client.force_authenticate(user=user)
    return client


def test_anonymous_collection_returns_401_or_403():
    response = _client().get("/api/mcp/tokens/")
    assert response.status_code in (401, 403)


def test_collection_returns_403_when_2fa_session_not_fresh(monkeypatch):
    def _raise(_request):
        raise McpAuthError("not fresh", status_code=403)

    monkeypatch.setattr("mcp.tokens.views.require_fresh_2fa_session", _raise)
    user = _user()
    response = _client(user).get("/api/mcp/tokens/")
    assert response.status_code == 403
    assert "not fresh" in response.json()["detail"]


def test_issue_token_returns_201_with_plaintext_once(fresh_2fa):
    user = _user()
    response = _client(user).post("/api/mcp/tokens/", data={"name": "Cursor"}, format="json")
    assert response.status_code == 201, response.content
    body = response.json()
    assert "plaintext" in body
    assert body["plaintext"].startswith("slt_")
    assert body["last_four"] == body["plaintext"][-4:]
    assert "token_hash" not in body


def test_issue_rejects_ttl_out_of_range(fresh_2fa):
    user = _user()
    response = _client(user).post(
        "/api/mcp/tokens/",
        data={"name": "x", "ttl_days": 0},
        format="json",
    )
    assert response.status_code == 400


def test_list_returns_only_callers_tokens(fresh_2fa):
    alice = _user("alice")
    bob = _user("bob")
    issue_token(actor=alice, name="A1")
    issue_token(actor=alice, name="A2")
    issue_token(actor=bob, name="B1")

    response = _client(alice).get("/api/mcp/tokens/")
    assert response.status_code == 200
    names = sorted(item["name"] for item in response.json())
    assert names == ["A1", "A2"]


def test_revoke_own_token_returns_204_and_sets_revoked_at(fresh_2fa):
    user = _user()
    record, _ = issue_token(actor=user, name="x")

    response = _client(user).delete(f"/api/mcp/tokens/{record.pk}/")
    assert response.status_code == 204
    record.refresh_from_db()
    assert record.revoked_at is not None
    first_stamp = record.revoked_at

    # Idempotent — second call still 204, timestamp unchanged.
    response = _client(user).delete(f"/api/mcp/tokens/{record.pk}/")
    assert response.status_code == 204
    record.refresh_from_db()
    assert record.revoked_at == first_stamp


def test_revoke_other_users_token_returns_403(fresh_2fa):
    owner = _user("owner")
    other = _user("other")
    record, _ = issue_token(actor=owner, name="x")
    response = _client(other).delete(f"/api/mcp/tokens/{record.pk}/")
    assert response.status_code == 403
    record.refresh_from_db()
    assert record.revoked_at is None


def test_revoke_nonexistent_returns_404(fresh_2fa):
    user = _user()
    response = _client(user).delete(f"/api/mcp/tokens/{uuid.uuid4()}/")
    assert response.status_code == 404


def test_list_renders_expires_at_iso(fresh_2fa):
    user = _user()
    issue_token(actor=user, name="x")
    response = _client(user).get("/api/mcp/tokens/")
    body = response.json()
    assert len(body) == 1
    # Must be a parseable ISO timestamp in the future.
    assert body[0]["expires_at"]
    parsed = timezone.datetime.fromisoformat(body[0]["expires_at"])
    assert parsed > timezone.now() - timezone.timedelta(seconds=5)
