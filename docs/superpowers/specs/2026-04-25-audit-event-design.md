# Audit Event — Design

**Date:** 2026-04-25
**Status:** Approved
**Scope:** Track 08 follow-on after structured logging. `AuditEvent` model + `write_audit_event` service + admin + tests. **Callers opt in explicitly — no signal hooks in this PR.**

## Goal

Give security-sensitive actions a queryable trail beyond log lines: who did what, in which workspace, on which entity, with which correlation id. Land the model + the service so MCP token issuance, opportunity archive, login, etc. can record events when they want without rewiring later.

## Non-goals

- Automatic Django signal wiring (`post_save`, login_succeeded, etc.) — separate later PR. Callers explicitly call `write_audit_event(...)` for now so the writes are intentional and small.
- Retention / TTL / partitioning. The table can grow; cleanup tooling is its own PR.
- Audit-log UI. Admin browse is enough until a real ops surface is needed.
- Tamper-evidence (hash-chain). Append-only via `revoked_at`-style flags is out of scope.
- Wiring any existing call sites in this PR. New helpers are dormant; PR after this lights up the first writer (likely `mcp.tokens.services.issue_token`).

## Architecture

### Model (`backend/audit/models.py`)

```py
class AuditEvent(TimeStampedModel):
    id = UUIDField(primary_key, default=uuid4, editable=False)
    actor = FK(User, on_delete=SET_NULL, null=True, blank=True,
               related_name="audit_events")
    actor_repr = CharField(max_length=200)              # "alice (id=12)" frozen at write
    action = CharField(max_length=100)                  # e.g. "mcp_token.issued"
    entity_type = CharField(max_length=100, blank=True) # e.g. "opportunities.Opportunity"
    entity_id = CharField(max_length=64, blank=True)    # UUID/int as string
    workspace = FK("tenancy.Workspace", on_delete=SET_NULL, null=True, blank=True,
                   related_name="audit_events")
    correlation_id = CharField(max_length=64, blank=True)
    metadata = JSONField(default=dict, blank=True)      # extra context: ip, ua, role, etc.

    class Meta:
        ordering = ("-created_at",)
        indexes = [
            Index(fields=("action", "-created_at")),
            Index(fields=("entity_type", "entity_id")),
        ]
```

Choices:

- **UUID pk** matches the rest of the codebase.
- **`actor` SET_NULL + `actor_repr` frozen string.** When a user is deleted later, the event still tells you who did it (`"alice (id=12)"`). The FK survives so live actors can be browsed in admin.
- **`workspace` SET_NULL.** Same logic — the event log outlives the workspace it was scoped to.
- **`correlation_id`** is plain `CharField`, not a FK to anything — it's the value the middleware injected on the request that produced the event. Lets you join events to log lines via grep.
- **`metadata` JSONField with `default=dict`.** Cheap for ad-hoc context (IP address, user-agent, the role used, etc.). Track 05/06 can pile on without migrations.
- **Two indexes:**
  - `(action, -created_at)` for "show me the last N `mcp_token.issued` events".
  - `(entity_type, entity_id)` for "show me everything that ever happened to this Opportunity".
- **No unique constraint** beyond the pk — multiple events per action per entity are normal.

### Service (`backend/audit/services.py`)

```py
def write_audit_event(
    *,
    actor: AbstractBaseUser | None,
    action: str,
    entity: models.Model | None = None,
    workspace: Workspace | None = None,
    correlation_id: str | None = None,
    metadata: dict | None = None,
) -> AuditEvent:
    ...
```

Behavior:

- `actor_repr`: `f"{actor.username} (id={actor.pk})"` if actor present; `"<system>"` otherwise. Frozen at write so deletes don't reshape history.
- `entity_type` / `entity_id`: derived from `type(entity).__module__` + class name and `entity.pk`. Both empty strings when `entity is None`.
- `correlation_id`: caller-provided OR pulled from `core.middleware.correlation_id.get_correlation_id()` when None. (Belt-and-braces: the middleware contextvar already covers the HTTP path; the explicit kwarg is for Celery and CLI callers that don't see the request.)
- Wraps the insert in `transaction.atomic`. This only gives rollback coupling when the caller performs the business action and calls `write_audit_event(...)` inside the same outer `atomic()` block (or from a service that is already atomic). If no outer transaction is open, the helper just creates and commits its own transaction for the audit row alone — so callers that need "audit row goes away if the action rolls back" must wrap both in their own `atomic()`.

### Admin (`backend/audit/admin.py`)

Read-only browse. The table is append-only; the admin must not let anyone re-write history.

- `list_display = ("created_at", "actor_repr", "action", "entity_type", "entity_id", "workspace")`.
- `list_filter = ("action", "workspace")`.
- `search_fields = ("actor_repr", "action", "entity_id", "correlation_id")`.
- All fields read-only. `has_add_permission` / `has_change_permission` / `has_delete_permission` all return `False`.

### App wiring

`audit` is already in `INSTALLED_APPS`. No settings changes.

### Tests (per-app per-category layout)

`backend/audit/tests/models/audit_event_test.py` (new) — six cases:
1. Minimum-field create (just `actor=None`, `action="x"`) — `actor_repr` is preserved as supplied; `metadata` defaults to `{}`.
2. `__str__` formats as `f"{action} by {actor_repr} at {created_at:%Y-%m-%dT%H:%M:%SZ}"`.
3. `actor` SET_NULL: deleting the user nullifies `actor` but leaves `actor_repr` intact.
4. `workspace` SET_NULL: deleting the workspace nullifies the FK but the event survives.
5. Default ordering newest-first.
6. Two events with the same `action` for the same entity coexist (no unique).

`backend/audit/tests/services/audit_event_test.py` (new) — six cases:
1. `write_audit_event(actor=user, action="x")` returns a row with the right `actor_repr`.
2. `actor=None` → `actor_repr == "<system>"`.
3. `entity=opp` populates `entity_type` and `entity_id` (string of `opp.pk`).
4. Caller-provided `correlation_id` lands.
5. Missing `correlation_id` falls back to `get_correlation_id()` (set via the contextvar in the test).
6. `metadata=None` → empty `{}`; `metadata={"ip": "1.2.3.4"}` round-trips.

Total +12 tests. Backend pytest: 140 → 152.

### CLAUDE.md

Append a short paragraph under "Architecture" pointing at `audit.write_audit_event` as the canonical way for new code to record an action, plus the two indexes.

## Frontend / e2e

Zero changes.

## Risk & rollback

- One additive table, no schema change to existing tables.
- No new public surface. Admin browse is staff-only + 2FA-gated.
- No call sites wired in this PR — the helpers are dormant until the next PR opts a writer in.
- Rollback: revert the merge. `manage.py migrate audit zero` drops the table.

## Open questions

- Action-name taxonomy. We're not enforcing a registry yet; callers free-form. A tightening (string-enum / Pydantic-ish) can land later when there are enough writers to taxonomise.
- PII in `metadata`. The MVP passes whatever the caller hands in. Redaction rules are their own brainstorm.
