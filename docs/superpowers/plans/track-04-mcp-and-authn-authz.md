# Track 04: MCP + Authentication and Authorization

Status: Draft (awaiting approval)  
Spec reference: `docs/superpowers/specs/2026-04-16-slotflow-crm-design.md`  
Execution mode: isolated worktree (`.worktrees/track-04-mcp-and-authn-authz`)

## 1) Objectives

- Implement the MCP server as a first-class product interface with parity to HTTP application services.
- Enforce mandatory 2FA for interactive authentication and gate MCP token issuance on a verified 2FA session.
- Enforce workspace-scoped authorization for every MCP tool call.
- Provide stable tool contracts, error mapping, idempotency, and audit hooks aligned with the spec.

## 2) Constraints and Decisions

- Runtime baseline:
  - Python: latest stable version at execution time.
  - Django: latest stable version at execution time.
- MCP must not introduce parallel business rules:
  - all tools delegate to the same application services used by DRF views (Track 07 will consume HTTP; parity is mandatory).
- MCP tokens are short-lived, revocable, and stored as hashed fingerprints at rest.
- Django Admin remains restricted to system administrators only.

## 3) Deliverables

- MCP server process packaging:
  - a dedicated entrypoint suitable for Render (Web Service or Private Service depending on exposure model)
  - structured logging with `request_id`, `workspace_id`, `user_id`, `tool_name`
- Authentication and token lifecycle:
  - 2FA enforcement for interactive login
  - MCP token issuance endpoint (HTTP) gated on verified 2FA session
  - token revocation/rotation endpoints (HTTP) for product users
- Authorization framework:
  - workspace resolver (active workspace selection rules)
  - role checks (`Owner`, `Member`, `Viewer`)
  - entitlement + global flag evaluation hooks (integrate with `django-waffle` + workspace entitlements when present)
- MCP tool registry:
  - implement the MVP tool list from spec section `5.8 MCP Initial Contract (MVP)`
  - typed request/response schemas + versioning strategy
- Testing:
  - unit tests for authz matrix
  - integration tests for representative tools (read + mutating + idempotent)

## 4) Architecture Options (Choose One in PR, Document Rationale)

### Option A - MCP as Separate Python Service (Recommended for Render)

- Pros: clean isolation, independent scaling, simpler operational boundaries.
- Cons: duplicate dependency wiring unless shared package is extracted.

### Option B - MCP Embedded in Django Repo as a Managed Process

- Pros: shared settings, ORM, and service imports are trivial.
- Cons: packaging and lifecycle coupling; still can be deployed as separate Render service using same codebase.

Decision rule:
- Prefer **same repo**, **separate Render service** for MCP, sharing Django settings and domain services.

## 5) Execution Phases

### Phase A - Security Baseline Wiring

- Ensure interactive login requires 2FA completion before “authenticated session” is considered valid for sensitive operations.
- Define what constitutes `2fa_verified_at` / session flag requirements.
- Add admin restriction policy checks.

Exit criteria:
- users cannot reach privileged product flows without 2FA verification.
- admin access remains limited to system administrators.

### Phase B - MCP Token Model and HTTP Issuance API

- Create token model:
  - user binding
  - workspace binding (optional default workspace vs per-call workspace)
  - expiry
  - revocation
  - hashed secret storage
- Implement HTTP endpoints (DRF) for:
  - issue token (requires verified 2FA session)
  - revoke token
  - list active tokens (optional, owner-only)

Exit criteria:
- token can be issued only after 2FA verification.
- tokens can be revoked and immediately fail MCP authentication.

### Phase C - MCP Server Skeleton + Auth Middleware

- Implement MCP server bootstrap:
  - transport layer
  - authentication from bearer token
  - workspace context resolution
- Implement uniform error mapping:
  - `forbidden_workspace`
  - `insufficient_role`
  - `validation_error`
  - `invalid_state_transition`
  - `rate_unavailable` (FX)

Exit criteria:
- unauthorized requests fail consistently with stable error codes.
- authorized requests attach `user`, `workspace`, `request_id` to service calls.

### Phase D - Tool Implementation (MVP Set)

Implement tools from spec (names must match contract):

- `workspace.list`
- `opportunity.list`, `opportunity.create`, `opportunity.update`
- `organization.upsert`
- `opportunity.set_hiring_context`
- `pipeline.advance`
- `interview.recording.add`
- `interview.transcript.upload`
- `interview.insights.generate`
- `person.upsert`
- `thread.list`
- `message.log`
- `process.outcome.set`
- `process.history.import_pasted`
- `reply_suggestion.generate`
- `resume_version.create_or_update`
- `resume.import_json`
- `resume.import_linkedin_pdf`
- `resume.render_theme`
- `resume.themes.list`
- `user.currency_preferences.get`, `user.currency_preferences.set`
- `fx.quotes.get`

Rules:
- mutating tools require idempotency keys where applicable.
- each tool validates workspace membership before querying.

Exit criteria:
- each tool has at least one happy-path integration test with authz enforcement test for a negative case.

### Phase E - Audit and Observability Hooks

- Emit audit events for:
  - token issuance/revocation
  - mutating MCP tools
  - failed authz attempts (sampled if high-volume)

Exit criteria:
- audit entries include actor, workspace, tool, entity identifiers.

## 6) Authorization Matrix (Minimum)

- `Viewer`: read tools only.
- `Member`: read + create/update operational records (no workspace destruction / no billing admin).
- `Owner`: member capabilities + workspace administration operations defined in later tracks (keep MVP minimal: membership invites may be out-of-scope unless already in model).

## 7) Idempotency and Concurrency

- Define idempotency key header/field convention for MCP tool calls.
- Use DB uniqueness constraints where safe (token fingerprints, idempotency records).
- Add workflow concurrency controls for deploy operations (Track 01), and optional per-user rate limits for expensive tools (`insights`, `reply_suggestion`).

## 8) Render Deployment Notes

- MCP should run as its own Render service in staging/production.
- Use private networking if MCP should not be public; if public, enforce strong token auth + TLS only.
- Secrets:
  - token signing keys
  - MCP service auth configuration

## 9) Out of Scope for Track 04

- full React UI flows (Track 07)
- deep resume parsing/rendering implementation (Track 05)
- full observability platform (Track 08), beyond minimal audit hooks

## 10) Validation Checklist

- MCP tools call shared application services (no duplicated domain logic).
- 2FA gating is enforced for token issuance.
- workspace isolation is enforced for every tool.
- stable error contract matches spec baseline.
- integration tests cover critical mutating tools and authz failures.

## 11) Approval Gate

Approval of this track authorizes:
- creating dedicated worktree for MCP + authn/authz implementation,
- implementing MCP server packaging and tool registry MVP,
- opening focused PRs limited to MCP/auth concerns (no unrelated domain expansions).
