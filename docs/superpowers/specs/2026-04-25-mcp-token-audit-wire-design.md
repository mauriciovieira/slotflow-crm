# MCP Token → AuditEvent (first writer) — Design

**Date:** 2026-04-25
**Status:** Approved
**Scope:** Wire `mcp.tokens.services.issue_token` and `revoke_token` to emit `AuditEvent` rows. Two call sites only. **No signals, no other writers** — those land per-domain later.

## Goal

Light up the audit log with its first real writers so token issuance/revocation leaves a queryable trail. Sets the pattern every later writer (opportunity archive, login, role change) will copy: explicit `audit.write_audit_event(...)` call inside the same `transaction.atomic` block as the action.

## Non-goals

- Other audit writers — opportunity archive, login success/failure, etc.
- Auto-wired Django signals.
- Audit retention / TTL / compaction.
- Token rotation events (covered when rotation lands).

## Architecture

`backend/mcp/tokens/services.py`:

- `issue_token(...)` already runs in `@transaction.atomic`. After `Opportunity` — sorry — after `McpToken.objects.create(...)` returns, call:

  ```py
  write_audit_event(
      actor=actor,
      action="mcp_token.issued",
      entity=record,
      metadata={
          "name": record.name,
          "expires_at": record.expires_at.isoformat(),
          "ttl_days": ttl_days,
          "last_four": record.last_four,
      },
  )
  ```

  The plaintext is **never** included in metadata. Only the row's last four characters.

- `revoke_token(...)` already runs in `@transaction.atomic`. After the conditional `save(...)` (which the helper skips on already-revoked rows), call:

  ```py
  write_audit_event(
      actor=actor,
      action="mcp_token.revoked",
      entity=token,
      metadata={
          "name": token.name,
          "last_four": token.last_four,
          "already_revoked": already_revoked,  # bool
      },
  )
  ```

  `already_revoked` is `True` when the second-call path didn't bump `revoked_at` — keeps both calls auditable but flags the no-op explicitly.

Both writes carry `actor=actor` so `actor_repr` freezes the username; `entity=record/token` populates `entity_type="mcp.McpToken"` + `entity_id=str(record.pk)`. The `correlation_id` falls through from the request context.

## Why explicit calls, not signals

- Signals fire on every save, including the ones we don't want audited (e.g. updating `last_used_at` on token use). The set of audit-worthy actions is smaller than the set of writes.
- Signals make the trace harder to read (the audit row is "magically" added far from the cause).
- Track 04's MCP brainstorm + this PR's design both call out service-layer audit writes; the explicit shape is the long-term answer.

## Tests

`backend/mcp/tests/services/mcp_token_test.py` (modify) — extend with three cases:

1. `test_issue_token_writes_audit_event` — call `issue_token(actor=user, name="x")`, then assert `AuditEvent.objects.filter(action="mcp_token.issued").count() == 1` and the row has `actor==user`, `entity_type=="mcp.McpToken"`, `entity_id==str(record.pk)`, `metadata["last_four"]==record.last_four`, and (importantly) `metadata` does NOT contain the plaintext.
2. `test_revoke_token_writes_audit_event_with_already_revoked_flag_false` — call `revoke_token` once on a fresh token, expect `already_revoked: False` in metadata.
3. `test_revoke_token_writes_audit_event_with_already_revoked_flag_true_on_second_call` — call twice; assert two `mcp_token.revoked` events; the second has `already_revoked: True` and the same `revoked_at` timestamp on the row didn't move.

`backend/mcp/tests/api/mcp_token_test.py` (modify) — extend the existing happy-path issue test to assert one `AuditEvent` was written; extend the happy-path revoke test similarly. Don't write new files; just append assertions in the existing cases.

Total +5 cases (3 service + 2 API). Backend pytest: 153 → 158.

## Risk & rollback

- Two explicit calls to a known-good helper. No new schemas. No new code paths in test-only modules.
- If `write_audit_event` raises mid-transaction, the surrounding `@transaction.atomic` rolls back the token write too — which is the exact "audit row never lies about a phantom action" behaviour. We're OK with that trade.
- Rollback: revert the merge.

## Open questions

None. Token rotation (issue + revoke as one operation) gets its own audit shape later.
