from __future__ import annotations

from rest_framework.test import APIClient


def test_security_headers_present_on_every_response():
    response = APIClient().get("/healthz")
    assert response.status_code == 200
    csp = response.headers.get("Content-Security-Policy", "")
    assert csp, "Content-Security-Policy header missing"
    # Object embedding stays disabled even in dev — no Flash, no plugins.
    assert "object-src 'none'" in csp
    # Clickjacking defense via CSP (in addition to X-Frame-Options).
    assert "frame-ancestors 'none'" in csp

    permissions = response.headers.get("Permissions-Policy", "")
    assert permissions
    assert "geolocation=()" in permissions
    assert "camera=()" in permissions
    assert "microphone=()" in permissions

    referrer = response.headers.get("Referrer-Policy", "")
    assert referrer == "strict-origin-when-cross-origin"


def test_xframe_options_header_is_deny():
    response = APIClient().get("/healthz")
    assert response.headers.get("X-Frame-Options") == "DENY"
