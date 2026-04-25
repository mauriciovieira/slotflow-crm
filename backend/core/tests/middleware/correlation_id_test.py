from __future__ import annotations

import pytest
from django.http import HttpResponse

from core.middleware.correlation_id import (
    REQUEST_HEADER,
    CorrelationIdMiddleware,
    get_correlation_id,
)


class _Recorder:
    def __init__(self):
        self.captured_id: str | None = None

    def __call__(self, request):
        self.captured_id = request.correlation_id
        return HttpResponse("ok")


@pytest.fixture
def request_factory():
    from django.test import RequestFactory

    return RequestFactory()


def test_missing_header_mints_request_id_and_sets_response_header(request_factory):
    rec = _Recorder()
    middleware = CorrelationIdMiddleware(rec)
    response = middleware(request_factory.get("/healthz"))

    assert rec.captured_id is not None
    assert response[REQUEST_HEADER] == rec.captured_id
    assert len(rec.captured_id) >= 8


def test_valid_incoming_header_is_echoed_unchanged(request_factory):
    rec = _Recorder()
    middleware = CorrelationIdMiddleware(rec)
    response = middleware(request_factory.get("/healthz", HTTP_X_REQUEST_ID="upstream-1234"))

    assert rec.captured_id == "upstream-1234"
    assert response[REQUEST_HEADER] == "upstream-1234"


def test_malformed_incoming_header_is_replaced(request_factory):
    rec = _Recorder()
    middleware = CorrelationIdMiddleware(rec)
    # Spaces / unicode aren't in the safe charset; we mint a fresh id.
    response = middleware(request_factory.get("/healthz", HTTP_X_REQUEST_ID="bad id with spaces"))

    assert rec.captured_id != "bad id with spaces"
    assert response[REQUEST_HEADER] == rec.captured_id


def test_contextvar_is_set_during_request_and_cleared_after(request_factory):
    seen: dict[str, str | None] = {}

    def view(request):
        seen["during"] = get_correlation_id()
        return HttpResponse("ok")

    middleware = CorrelationIdMiddleware(view)
    middleware(request_factory.get("/healthz"))

    assert seen["during"] is not None
    # After the request, the contextvar resets to None.
    assert get_correlation_id() is None


def test_two_concurrent_requests_do_not_leak_ids(request_factory):
    """Each thread sees only its own incoming id; the contextvar is per-task."""
    import threading

    results: dict[int, str | None] = {}

    def view(request):
        # Sleep briefly so the two threads overlap.
        import time

        time.sleep(0.05)
        results[threading.get_ident()] = request.correlation_id
        return HttpResponse("ok")

    middleware = CorrelationIdMiddleware(view)

    def run(idx):
        middleware(request_factory.get("/healthz", HTTP_X_REQUEST_ID=f"req-{idx}-aaaa"))

    threads = [threading.Thread(target=run, args=(i,)) for i in range(2)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert sorted(results.values()) == ["req-0-aaaa", "req-1-aaaa"]
