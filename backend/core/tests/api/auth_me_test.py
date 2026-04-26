from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient


@pytest.fixture
def user(db):
    return get_user_model().objects.create_user(
        username="alice",
        email="alice@x.com",
        password="Sup3r-Secret-Pw!",
    )


@pytest.mark.django_db
def test_me_includes_mfa_via_oauth_false_by_default(user):
    client = APIClient()
    client.force_login(user)
    body = client.get("/api/auth/me/").json()
    assert body["mfa_via_oauth"] is False
    assert body["is_verified"] is False


@pytest.mark.django_db
def test_me_marks_oauth_mfa_session_as_verified(user):
    client = APIClient()
    client.force_login(user)
    session = client.session
    session["oauth_mfa_satisfied"] = True
    session.save()
    body = client.get("/api/auth/me/").json()
    assert body["mfa_via_oauth"] is True
    assert body["is_verified"] is True


@pytest.mark.django_db
def test_me_anonymous_includes_mfa_via_oauth_false():
    client = APIClient()
    body = client.get("/api/auth/me/").json()
    assert body["authenticated"] is False
    assert body["mfa_via_oauth"] is False
    assert body["is_verified"] is False
