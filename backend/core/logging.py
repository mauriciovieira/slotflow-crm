from __future__ import annotations

import json
import logging
from datetime import UTC, datetime

from .middleware.correlation_id import get_correlation_id

_RESERVED_LOGRECORD_ATTRS = {
    "name",
    "msg",
    "args",
    "levelname",
    "levelno",
    "pathname",
    "filename",
    "module",
    "exc_info",
    "exc_text",
    "stack_info",
    "lineno",
    "funcName",
    "created",
    "msecs",
    "relativeCreated",
    "thread",
    "threadName",
    "processName",
    "process",
    "message",
    "asctime",
    "taskName",
}


def _safe(value):
    """Coerce a log `extra=` value to something json.dumps can render.

    Primitives, lists, and dicts pass through. Anything else is stringified
    so a stray `extra={"obj": SomeModel(...)}` doesn't crash the formatter."""
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    if isinstance(value, dict):
        return {str(k): _safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_safe(v) for v in value]
    return str(value)


class JsonFormatter(logging.Formatter):
    """Render `LogRecord`s as a single-line JSON document.

    Always includes timestamp/level/logger/message; pulls
    `correlation_id` from the request-scoped contextvar when available; folds
    any unknown attributes (everything not part of the stdlib `LogRecord`
    surface) into the payload so callers can pass `extra={...}` and have it
    show up as top-level keys.
    """

    def format(self, record: logging.LogRecord) -> str:  # noqa: D401
        payload: dict[str, object] = {
            "timestamp": datetime.fromtimestamp(record.created, tz=UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "func": record.funcName,
            "line": record.lineno,
        }
        cid = get_correlation_id()
        if cid is not None:
            payload["correlation_id"] = cid

        for key, value in record.__dict__.items():
            if key in _RESERVED_LOGRECORD_ATTRS or key.startswith("_"):
                continue
            # Don't let an `extra={"level": "foo"}` clobber the real `level`
            # we just wrote — log metadata has to stay trustworthy. Collisions
            # land under an `extra__<key>` namespace.
            if key in payload:
                payload[f"extra__{key}"] = _safe(value)
            else:
                payload[key] = _safe(value)

        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)

        return json.dumps(payload, default=str)
