# Track 08: Observability and Operations

Status: Draft (awaiting approval)  
Spec reference: `docs/superpowers/specs/2026-04-16-slotflow-crm-design.md`  
Execution mode: isolated worktree (`.worktrees/track-08-observability-and-ops`)

## 1) Objectives

- Make production operations safe and debuggable for MVP:
  - consistent structured logs
  - actionable error reporting
  - health checks suitable for Render and GitHub Actions deploy gates
  - audit trail coverage for security-sensitive actions
- Provide operator runbooks for common failure modes (deploy, jobs, auth, FX).

## 2) Scope Boundaries

- In scope:
  - logging/metrics/tracing baseline
  - health endpoints and readiness semantics
  - audit event persistence/query utilities
  - operational documentation (`docs/runbooks/`)
  - integration hooks for error tracking (optional but recommended)
- Out of scope:
  - building a full analytics warehouse
  - full SIEM integration
  - on-call paging maturity beyond basic alerts (unless trivial)

## 3) Deliverables

### A) Structured Logging Standard

- Adopt JSON logging in production environments.
- Required fields on every request/job log line:
  - `timestamp`, `level`, `service`, `environment`
  - `request_id` / `correlation_id`
  - `user_id` (when authenticated)
  - `workspace_id` (when resolved)
  - `tool_name` (MCP-only)
- PII redaction rules documented (emails, message bodies, transcripts).

### B) Error Tracking

- Integrate an error tracker compatible with Django + Celery (vendor choice documented in PR).
- Ensure Celery task failures attach task name, args metadata (redacted), and correlation id.

### C) Metrics (MVP Set)

Minimum counters/gauges:

- HTTP: request count, error rate, latency histogram (basic)
- Celery: task success/failure/retry counts by queue and task name
- Jobs: import/render/insight job terminal state counts
- FX: quote freshness lag (time since last successful fetch)

Implementation approach:

- start with logs + simple metrics endpoint or statsd-compatible integration (choose in PR)

### D) Tracing (Optional in MVP, but planned)

- OpenTelemetry hooks behind feature flag.
- If deferred, document explicit follow-up milestone.

### E) Health Checks

- `/health/live`: process alive
- `/health/ready`: DB connectivity + Redis connectivity + migrations expectation (define rules)
- Celery worker health signal strategy (queue ping task)

### F) Audit Events

- Implement `AuditEvent` persistence aligned with spec requirements.
- Emit audit events for:
  - membership/role changes (when introduced)
  - MCP token issuance/revocation
  - mutating domain operations (configurable allowlist in MVP)
  - failed authorization attempts (sampled if noisy)

### G) Runbooks

Add `docs/runbooks/` entries:

- deploy rollback strategy on Render
- stuck async jobs recovery
- FX provider outage behavior
- transcript upload failures triage
- database migration failure triage

## 4) Execution Phases

### Phase A - Logging + Request Correlation

- Add middleware for `request_id` propagation.
- Ensure DRF and MCP entrypoints attach the same correlation id.

Exit criteria:

- a single user action can be traced across web + worker logs via `request_id`.

### Phase B - Health Endpoints + CI Deploy Gates

- Implement readiness checks used by GitHub Actions post-deploy steps.

Exit criteria:

- staging deploy workflow fails if readiness fails.

### Phase C - Audit + Security Events

- Implement audit writer utility and enforce usage on sensitive endpoints/tools.

Exit criteria:

- security-sensitive actions produce audit rows with actor + workspace + entity ids.

### Phase D - Metrics/Alerts Baseline

- Define alert thresholds for:
  - elevated 5xx rate
  - celery failure spikes
  - job backlog growth

Exit criteria:

- at least one actionable alert exists for staging (even if manual check initially).

## 5) Render Operational Notes

- Ensure each service emits identifiable `service` name (`web`, `worker`, `beat`, `mcp`, `frontend` if applicable).
- Document log retention expectations and where to view logs (Render dashboard + optional drain).

## 6) Testing Strategy

- Unit tests:
  - redaction helpers
  - audit event serializer constraints
- Integration tests:
  - readiness endpoint behavior with broken DB (expected failure mode)

## 7) Risks and Mitigations

- Log volume/cost:
  - Mitigation: sampling for high-volume paths, structured log levels.
- Accidental PII logging:
  - Mitigation: redaction utilities + code review checklist.

## 8) Out of Scope for Track 08

- full product analytics dashboards
- advanced distributed tracing rollout (unless explicitly included)

## 9) Approval Gate

Approval of this track authorizes:

- creating dedicated worktree for observability/ops implementation,
- implementing logging/health/audit/metrics baseline,
- opening focused PRs without changing core domain behavior unless required for instrumentation.

