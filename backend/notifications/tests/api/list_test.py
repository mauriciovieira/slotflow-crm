from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from notifications.models import Notification
from notifications.services import create_notification
from tenancy.models import Workspace

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _bypass_2fa_middleware(monkeypatch):
    monkeypatch.setattr("core.middleware.require_2fa.is_2fa_bypass_active", lambda: True)


def _user(name="alice"):
    return get_user_model().objects.create_user(
        username=name, email=f"{name}@example.com", password="x"
    )


def _ws(slug="ws-a"):
    return Workspace.objects.create(name=f"Workspace {slug}", slug=slug)


def _client(user=None) -> APIClient:
    c = APIClient()
    if user is not None:
        c.force_authenticate(user)
    return c


def test_anonymous_returns_401_or_403():
    response = _client().get("/api/notifications/")
    assert response.status_code in (401, 403)


def test_list_returns_only_recipients_rows():
    a = _user("a")
    b = _user("b")
    ws = _ws()
    create_notification(recipient=a, kind="x", workspace=ws, payload={"i": 1})
    create_notification(recipient=b, kind="x", workspace=ws, payload={"i": 2})

    body = _client(a).get("/api/notifications/").json()
    assert body["count"] == 1
    assert body["results"][0]["payload"] == {"i": 1}


def test_list_orders_newest_first():
    a = _user()
    ws = _ws()
    n1 = create_notification(recipient=a, kind="first", workspace=ws)
    n2 = create_notification(recipient=a, kind="second", workspace=ws)
    n3 = create_notification(recipient=a, kind="third", workspace=ws)

    body = _client(a).get("/api/notifications/").json()
    ids = [row["id"] for row in body["results"]]
    assert ids == [str(n3.id), str(n2.id), str(n1.id)]


def test_unread_filter_excludes_read_rows():
    a = _user()
    ws = _ws()
    n_read = create_notification(recipient=a, kind="x", workspace=ws)
    Notification.objects.filter(pk=n_read.pk).update(read_at="2026-04-25T10:00:00Z")
    create_notification(recipient=a, kind="x", workspace=ws)

    body = _client(a).get("/api/notifications/?unread=1").json()
    assert body["count"] == 1


def test_response_shape():
    a = _user()
    ws = _ws()
    create_notification(
        recipient=a, kind="opportunity.archived", workspace=ws, payload={"title": "T"}
    )

    body = _client(a).get("/api/notifications/").json()
    row = body["results"][0]
    assert set(row.keys()) == {
        "id",
        "kind",
        "payload",
        "workspace",
        "read_at",
        "created_at",
    }
    assert row["workspace"] == str(ws.id)
    assert row["payload"]["title"] == "T"


def test_unread_count_endpoint():
    a = _user()
    ws = _ws()
    create_notification(recipient=a, kind="x", workspace=ws)
    create_notification(recipient=a, kind="x", workspace=ws)
    n = create_notification(recipient=a, kind="x", workspace=ws)
    Notification.objects.filter(pk=n.pk).update(read_at="2026-04-25T10:00:00Z")

    body = _client(a).get("/api/notifications/unread-count/").json()
    assert body == {"count": 2}


def test_mark_read_flips_listed_ids():
    a = _user()
    ws = _ws()
    n1 = create_notification(recipient=a, kind="x", workspace=ws)
    n2 = create_notification(recipient=a, kind="x", workspace=ws)

    response = _client(a).post(
        "/api/notifications/mark-read/", {"ids": [str(n1.id)]}, format="json"
    )
    assert response.status_code == 200
    assert response.json() == {"marked": 1}
    n1.refresh_from_db()
    n2.refresh_from_db()
    assert n1.read_at is not None
    assert n2.read_at is None


def test_mark_read_rejects_non_list_payload():
    a = _user()
    response = _client(a).post("/api/notifications/mark-read/", {"ids": "tok-1"}, format="json")
    assert response.status_code == 400


def test_mark_read_does_not_affect_other_users_rows():
    a = _user("a")
    b = _user("b")
    ws = _ws()
    n_other = create_notification(recipient=b, kind="x", workspace=ws)
    response = _client(a).post(
        "/api/notifications/mark-read/", {"ids": [str(n_other.id)]}, format="json"
    )
    assert response.status_code == 200
    assert response.json() == {"marked": 0}
    n_other.refresh_from_db()
    assert n_other.read_at is None


def test_mark_all_read_flips_only_recipients_unread():
    a = _user("a")
    b = _user("b")
    ws = _ws()
    create_notification(recipient=a, kind="x", workspace=ws)
    create_notification(recipient=a, kind="y", workspace=ws)
    create_notification(recipient=b, kind="z", workspace=ws)

    response = _client(a).post("/api/notifications/mark-all-read/")
    assert response.status_code == 200
    assert response.json() == {"marked": 2}
    assert Notification.objects.filter(recipient=b, read_at__isnull=True).count() == 1
