# Track 03: Domain Model and Migrations

Status: Draft (awaiting approval)  
Spec reference: `docs/superpowers/specs/2026-04-16-slotflow-crm-design.md`  
Execution mode: isolated worktree (`.worktrees/track-03-domain-model-and-migrations`)

## 1) Objectives

- Implement the core domain model from the approved spec using Django ORM.
- Create safe, incremental migrations with tenant-scoped constraints.
- Establish repository/query patterns that enforce workspace isolation by default.
- Provide audit-ready model primitives for downstream MCP/API tracks.

## 2) Scope Boundaries

- In scope:
  - model definitions, enums, constraints, indexes, migrations
  - base repository/queryset interfaces
  - seed/minimal reference data where required by schema
- Out of scope:
  - full HTTP endpoints/controllers
  - MCP handlers and token flows
  - AI generation logic and prompt orchestration
  - full frontend integration

## 3) Domain Entities Included

- Identity/tenancy:
  - `Workspace`, `Membership`
- Opportunity context:
  - `Organization`, `Opportunity`, `OpportunityRequirement`, `InterviewCycle`, `InterviewStep`
- Communication:
  - `Person`, `ConversationThread`, `Message`
- Interview learning:
  - `InterviewSessionArtifact`, `InterviewTranscript`, `ProcessOutcome`, `ProcessRetrospective`, `HistoricalProcessImportJob`
- Resume:
  - `BaseResume`, `ResumeVersion`, `ResumeSection`, `ResumeItem`, `ResumeEvidenceMap`, `ResumeRender`, `ResumeImportJob`
- Commercial/feature control:
  - `WorkspaceEntitlement`, `UserCurrencyPreference`, `FxQuoteSnapshot`
- Cross-cutting:
  - `AuditEvent` (minimum audit envelope model)

## 4) Migration Strategy

### Phase A - Foundational Tables

- Create tenancy/identity tables first (`Workspace`, `Membership`) and shared mixins.
- Create `Organization`, `Person`, and `Opportunity` skeleton models with FK scaffolding.
- Add enum choices and check constraints for role and status baselines.

Exit criteria:

- migrations apply cleanly on fresh DB.
- rollback one step works cleanly for foundational migration set.

### Phase B - Opportunity and Communication Graph

- Add `OpportunityRequirement`, `InterviewCycle`, `InterviewStep`.
- Add `ConversationThread` and `Message` with channel/direction constraints.
- Add relationship constraints enforcing same-workspace references.

Exit criteria:

- sample fixture can create full opportunity + interview + conversation graph.
- constraint violations fail with expected DB-level errors.

### Phase C - Resume and Import/Render Models

- Add resume entities and lineage links:
  - `BaseResume`, `ResumeVersion`, `ResumeSection`, `ResumeItem`, `ResumeEvidenceMap`.
- Add job/render models:
  - `ResumeImportJob`, `ResumeRender`.
- Add status fields and transition-safe columns (`status`, `error_code`, `retry_count`, timestamps).

Exit criteria:

- can persist a canonical JSON Resume snapshot and rendered artifact metadata.
- import/render job rows support state-machine-related fields from spec.

### Phase D - Interview Learning and Historical Imports

- Add `InterviewSessionArtifact`, `InterviewTranscript`, `ProcessOutcome`, `ProcessRetrospective`, `HistoricalProcessImportJob`.
- Add JSON fields for structured feedback/evidence payloads.
- Add indexes for transcript/process querying by workspace/opportunity/step/status.

Exit criteria:

- can persist interview learning records with provenance references.
- async historical import job fields support status transitions and diagnostics.

### Phase E - Currency and Entitlements

- Add `WorkspaceEntitlement`, `UserCurrencyPreference`, `FxQuoteSnapshot`.
- Enforce defaults:
  - `UserCurrencyPreference.preferred_currencies` defaults to `["USD", "BRL"]`.
- Add FX uniqueness/index strategy for fast latest-rate lookup.

Exit criteria:

- opportunity compensation and user currency preferences query efficiently.
- FX snapshot lookup supports official/parallel rate types.

## 5) Required Constraints and Indexes

- Tenant scoping:
  - every mutable domain row includes `workspace_id`.
  - composite indexes on (`workspace_id`, `opportunity_id`) for opportunity-linked entities.
- Opportunity hiring context:
  - `end_client_organization_id` required.
  - `intermediary_organization_id` optional.
  - check constraint: intermediary cannot equal end client.
- Compensation:
  - `compensation_min <= compensation_max` when both present.
  - `compensation_period` enum (`hour`, `month`, `year`).
  - `compensation_currency` as ISO currency code string.
- Async jobs:
  - status index: (`workspace_id`, `status`).
  - retry/error columns required on import/render job models.

## 6) Repository and Query Pattern Baseline

- Implement custom `QuerySet`/manager utilities:
  - `for_workspace(workspace_id)` mandatory scoping helper.
  - optional `active()` helper for soft-delete capable models.
- Repository facade stubs (no heavy abstraction):
  - `OpportunityRepository`
  - `ConversationRepository`
  - `ResumeRepository`
  - `InterviewLearningRepository`
- Rule: service layer must call workspace-scoped query methods by default.

## 7) Data Integrity and Backward Safety

- Migrations should avoid destructive operations in a single step.
- For significant schema changes, use expand/contract pattern:
  - add nullable column -> backfill -> add constraint/not-null.
- Include data migration scripts only when required by model integrity.

## 8) Tests for This Track

- Model unit tests:
  - constraint enforcement (workspace scoping, hiring context, compensation ranges)
  - enum/state value validation
- Migration tests:
  - migrate up from zero and validate schema
  - migrate backwards one step for latest migration groups
- Query tests:
  - repository/manager helpers correctly isolate by workspace

## 9) Risks and Mitigations

- Large initial migration set complexity:
  - Mitigation: phased migration files grouped by bounded context.
- Cross-model FK coupling causing circular dependencies:
  - Mitigation: careful app label ordering and split migrations where necessary.
- JSON field overuse:
  - Mitigation: keep JSON for evidence/metadata only; core relationships remain relational.

## 10) Validation Checklist

- all migrations apply cleanly on fresh DB.
- all migrations pass on CI test DB.
- core model constraints from spec are enforced at DB level.
- workspace-scoped query helpers exist and are covered by tests.
- track produces no API/MCP behavior drift (schema-only scope respected).

## 11) Approval Gate

Approval of this track authorizes:

- creating dedicated worktree for domain models/migrations,
- implementing models + migrations + repository query helpers,
- opening focused PR that excludes endpoint/controller implementations.