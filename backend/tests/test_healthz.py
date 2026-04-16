from __future__ import annotations

import json

from django.test import RequestFactory

from core.views import HealthzView


def test_healthz_includes_version() -> None:
    request = RequestFactory().get("/healthz")
    response = HealthzView.as_view()(request)
    assert response.status_code == 200
    data = json.loads(response.content.decode())
    assert data["status"] == "ok"
    assert data["version"]
    assert isinstance(data["version"], str)
