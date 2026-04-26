from __future__ import annotations


def test_production_csp_drops_unsafe_inline_and_unsafe_eval():
    """Construct the production middleware directly and inspect the CSP it
    would emit. We don't override `DEBUG=False` on the test client (that
    triggers HSTS redirects through our own ALLOWED_HOSTS); instead we
    instantiate the middleware and check the prebuilt CSP string.
    """
    from django.test.utils import override_settings

    from core.middleware.security_headers import SecurityHeadersMiddleware

    with override_settings(DEBUG=False):
        # `get_response` is unused for header inspection; pass a noop.
        middleware = SecurityHeadersMiddleware(lambda request: None)
        csp = middleware._csp

    # Production CSP must not weaken script-src with unsafe-inline /
    # unsafe-eval — those re-enable XSS sinks the FE bundle doesn't use.
    assert "'unsafe-eval'" not in csp
    # Allow `'unsafe-inline'` *only* in style-src (Tailwind dynamic
    # class-application keeps it briefly necessary). Make sure it does
    # not leak into the script-src directive.
    script_part = next(
        (segment for segment in csp.split(";") if segment.strip().startswith("script-src")),
        "",
    )
    assert "'unsafe-inline'" not in script_part, (
        f"script-src must not include 'unsafe-inline': {script_part!r}"
    )
