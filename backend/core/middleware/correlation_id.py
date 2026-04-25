from __future__ import annotations

import re
import uuid
from contextvars import ContextVar

from django.http import HttpRequest, HttpResponse

REQUEST_HEADER = "X-Request-ID"
_DJANGO_META_KEY = "HTTP_X_REQUEST_ID"
_VALID_INCOMING = re.compile(r"^[A-Za-z0-9-]{8,64}$")

_correlation_id: ContextVar[str | None] = ContextVar("slotflow_correlation_id", default=None)


def get_correlation_id() -> str | None:
    """Return the per-request correlation id, or None outside the request scope."""
    return _correlation_id.get()


def _normalize(raw: str | None) -> str:
    if raw and _VALID_INCOMING.match(raw):
        return raw
    return uuid.uuid4().hex


class CorrelationIdMiddleware:
    """Ensure every request has a stable id we can stamp onto logs.

    Reads `X-Request-ID` if upstream provided one (any safe printable token);
    mints a fresh `uuid4().hex` otherwise. The id is exposed three ways:

    - `request.correlation_id` — for views.
    - `get_correlation_id()` — module-level helper for log filters and any
      code that doesn't have the request handy (e.g. Celery later).
    - `X-Request-ID` response header — for clients chaining through.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        request_id = _normalize(request.META.get(_DJANGO_META_KEY))
        request.correlation_id = request_id
        token = _correlation_id.set(request_id)
        try:
            response = self.get_response(request)
            response[REQUEST_HEADER] = request_id
            return response
        finally:
            _correlation_id.reset(token)
