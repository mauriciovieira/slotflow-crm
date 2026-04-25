from __future__ import annotations

import json
import logging

import pytest

from core.logging import JsonFormatter
from core.middleware.correlation_id import _correlation_id


def _format(record: logging.LogRecord) -> dict:
    raw = JsonFormatter().format(record)
    return json.loads(raw)


def _record(msg="hello", level=logging.INFO, **kwargs) -> logging.LogRecord:
    extra = kwargs.pop("extra", {})
    record = logging.LogRecord(
        name=kwargs.pop("name", "slotflow.test"),
        level=level,
        pathname=__file__,
        lineno=10,
        msg=msg,
        args=(),
        exc_info=kwargs.pop("exc_info", None),
        func="_record",
    )
    for k, v in extra.items():
        setattr(record, k, v)
    return record


def test_required_fields_present_on_plain_call():
    payload = _format(_record())
    assert payload["level"] == "INFO"
    assert payload["logger"] == "slotflow.test"
    assert payload["message"] == "hello"
    assert payload["module"]
    assert payload["timestamp"]
    assert payload["timestamp"].endswith("+00:00")


def test_extra_kwargs_land_as_top_level_fields():
    payload = _format(_record(extra={"workspace_id": "ws-1", "row_count": 3}))
    assert payload["workspace_id"] == "ws-1"
    assert payload["row_count"] == 3


def test_exception_info_is_rendered_as_traceback_string():
    try:
        raise RuntimeError("boom")
    except RuntimeError:
        import sys

        record = _record(level=logging.ERROR, exc_info=sys.exc_info())
    payload = _format(record)
    assert "RuntimeError" in payload["exc_info"]
    assert "boom" in payload["exc_info"]


def test_correlation_id_is_pulled_from_contextvar():
    token = _correlation_id.set("req-abcdef12")
    try:
        payload = _format(_record())
    finally:
        _correlation_id.reset(token)
    assert payload["correlation_id"] == "req-abcdef12"


def test_unserialisable_extra_is_coerced_to_string():
    class Weird:
        def __str__(self) -> str:
            return "<weird>"

    payload = _format(_record(extra={"obj": Weird()}))
    assert payload["obj"] == "<weird>"


@pytest.mark.parametrize("level", [logging.DEBUG, logging.WARNING, logging.ERROR])
def test_levelname_round_trips(level):
    payload = _format(_record(level=level))
    assert payload["level"] == logging.getLevelName(level)
