# Structured Logging + Correlation ID — Design

**Date:** 2026-04-25
**Status:** Approved
**Scope:** Track 08 first slice. JSON log formatter + a `CorrelationIdMiddleware` that injects/propagates a per-request id. Gated behind `SLOTFLOW_LOG_JSON` env flag (default off so dev pretty-prints stay). **No metrics, no tracing, no error-tracker, no audit-event model in this PR.**

## Goal

Stop the production logs from being unstructured strings. Every log line in the request path gets a stable JSON envelope with `timestamp`, `level`, `logger`, `message`, plus `request_id` (from middleware), and — when applicable — `user_id`, `path`, `method`, `status`. Future Track 08 work (audit events, metrics, error tracker) plugs in on top of this foundation.

## Non-goals

- Metrics (counters/histograms) — separate later PR.
- OpenTelemetry tracing — later.
- Error-tracking vendor (Sentry/Rollbar/etc) — later.
- `AuditEvent` model and signal wiring — separate later PR.
- PII redaction rules / scrubbers. Scope is "structure"; redaction is its own brainstorm.
- Frontend logging.
- Switching anything to JSON in dev. The flag is opt-in.

## Architecture

### Correlation ID middleware

`backend/core/middleware/correlation_id.py` (new). Sits early in `MIDDLEWARE` (right after `SecurityMiddleware`) so every other layer can read it.

Behavior:
- On request: read the incoming `X-Request-ID` header. If missing or malformed (not a UUID-shaped string up to 64 chars), mint `uuid.uuid4().hex`. Store on `request.correlation_id` and on a `contextvars.ContextVar[str]` so the log filter can pick it up without passing the request around.
- On response: set the `X-Request-ID` response header to the same value.
- On exception: re-raise unchanged. The cleanup path resets the contextvar so it doesn't leak between threads.

A `get_correlation_id() -> str | None` helper exposes the contextvar to anything that needs it (Celery tasks, eventually).

### JSON formatter

`backend/core/logging.py` (new). Custom `logging.Formatter` subclass `JsonFormatter`:

- Emits a single JSON object per record, fields:
  - `timestamp` (ISO 8601, UTC with `Z`)
  - `level` (`record.levelname`)
  - `logger` (`record.name`)
  - `message` (formatted message — `record.getMessage()`)
  - `correlation_id` (from `get_correlation_id()`, omitted when None)
  - `module`, `func`, `line` (cheap source-locating)
  - `exc_info` (full traceback string when present)
  - any `extra=` kwargs passed to the call (typed values only — `int`, `str`, `float`, `bool`, `None`, lists/dicts of those).
- One `RequestContextFilter` (logging filter) attaches `request_id`, `user_id`, `method`, `path`, `status` when `request` is on the record. Wired by Django's request logging when configured.

### Settings wiring

`config/settings/base.py`:

- New `SLOTFLOW_LOG_JSON = env_bool("SLOTFLOW_LOG_JSON", default=False)`.
- New `LOGGING = {...}` dict-config:
  - `formatters`: `verbose` (default text), `json` (the new formatter).
  - One root `console` handler whose `formatter` is `"json"` if `SLOTFLOW_LOG_JSON` else `"verbose"`.
  - Loggers: `django` (INFO), `django.request` (WARNING), `slotflow` (DEBUG in `local`, INFO in `staging`/`production`).
- Insert `core.middleware.correlation_id.CorrelationIdMiddleware` second in `MIDDLEWARE` (after `SecurityMiddleware`, before `Session`).

`local.py` keeps the flag off by default; `production.py` flips it on. `staging.py` follows production.

### Env example

`.env.example` gets one new line:

```
# Set to 1 in staging/production to switch the root logger to JSON.
# SLOTFLOW_LOG_JSON=0
```

### Tests (per-app per-category layout)

`backend/core/tests/middleware/correlation_id_test.py` (new) — five cases:
1. Missing header → response carries an `X-Request-ID` matching `request.correlation_id`.
2. Provided valid header is echoed back unchanged.
3. Provided malformed header is replaced with a freshly-minted id (length / charset whitelist).
4. The contextvar is set during the request and cleared after.
5. Concurrent requests don't leak: two threaded synchronous requests with different incoming ids each see only their own id (uses Python's `threading` + a mock view).

`backend/core/tests/services/json_formatter_test.py` (new) — five cases:
1. Plain log call renders required fields (timestamp/level/message/logger).
2. `extra={"workspace_id": "..."}` lands as a top-level field.
3. `exc_info=True` includes the traceback string under `exc_info`.
4. `correlation_id` flows in from a manually-set contextvar.
5. Non-serializable extra values are coerced to `str(...)` so the formatter never crashes the app.

Total +10 tests. Backend pytest: 126 → 136.

### CLAUDE.md update

Append a one-paragraph note under "Architecture" explaining the correlation id is on `request.correlation_id`, the response header, and a contextvar; and that `SLOTFLOW_LOG_JSON=1` switches the root logger to JSON in staging/production.

## Frontend / e2e

Zero changes.

## Risk & rollback

Pure infrastructure. No API change. No migration. The default is text-format logs (current behavior), so dev experience is identical until the flag is set. Rollback: revert the merge.

## Open questions

- The middleware accepts any `[A-Za-z0-9-]{8,64}` value for `X-Request-ID`. A future tightening could require UUID4 specifically; for now we let upstream proxies pass through whatever they generate.
- Async / Celery propagation. Synchronous request path only in this PR; the contextvar will not flow into Celery tasks until we wire a `before_task_publish` signal that copies the id onto the message header. Separate later PR.
- A real metrics layer (Prometheus / statsd / OTLP) is the next Track 08 PR after this one.
