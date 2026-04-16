# Track 06: Interview Learning, Retrospectives, and Historical Imports

Status: Draft (awaiting approval)  
Spec reference: `docs/superpowers/specs/2026-04-16-slotflow-crm-design.md`  
Execution mode: isolated worktree (`.worktrees/track-06-interview-learning-and-retrospective`)

## 1) Objectives

- Implement interview artifact capture (recording URLs) and transcript ingestion (SRT/VTT/TXT + extensible formats).
- Implement coaching insight generation that is advisory, tenant-scoped, and entitlement-aware.
- Implement historical lost-process import via pasted email/LinkedIn content with human confirmation.
- Implement cross-process learning signals that can rank guidance using prior outcomes and retrospectives.

## 2) Scope Boundaries

- In scope:
  - application services + Celery tasks for transcript normalization and coaching synthesis
  - persistence for `InterviewSessionArtifact`, `InterviewTranscript`, `ProcessOutcome`, `ProcessRetrospective`, `HistoricalProcessImportJob`
  - minimal DRF endpoints for upload/status/retrieval (full UX in Track 07)
  - MCP tool wiring only through shared services (transport details remain Track 04)
- Out of scope:
  - full React dashboards and polished review UX (Track 07)
  - automatic ingestion from email/LinkedIn APIs (explicitly out of MVP in spec)
  - full observability platform (Track 08), beyond structured logs

## 3) Deliverables

- Transcript pipeline:
  - parsers for `vtt`, `srt`, `txt` with a plugin interface for additional formats
  - normalized transcript text + optional timestamp segments
  - storage strategy for original upload bytes/metadata
- Coaching insight service:
  - `InterviewInsightService` implementation with adapter boundary for LLM provider
  - deterministic “context packaging” from transcripts, messages, outcomes, historical imports
  - output schema versioned (`insight_version`)
- Historical import pipeline:
  - `HistoricalImportService` to parse pasted content into candidate timeline + extracted fields
  - `HistoricalProcessImportJob` state machine aligned with spec flows
- Cross-process learning:
  - clustering/ranking approach documented (start simple: TF-IDF/keyword themes or rule-based bucketing; upgrade later)
  - explicit user feedback capture on recommendations (stored as structured events)

## 4) Entitlements and Feature Flags

- Coaching insights are premium-capable per spec:
  - evaluate global flag (`django-waffle`) + workspace entitlement + role
- Provide clear error codes when blocked:
  - `feature_disabled`
  - `entitlement_required`

## 5) Execution Phases

### Phase A - Recording Links and Transcript Registration

- CRUD for `InterviewSessionArtifact` bound to `InterviewStep`.
- Upload/register transcript files with validation (size/type) and enqueue normalization task.

Exit criteria:
- transcript normalization produces searchable text and preserves source format metadata.

### Phase B - Coaching Insight Generation

- Build context objects:
  - selected transcript(s) + recent messages + opportunity requirements summary + pipeline state
  - historical signals: prior `ProcessOutcome`, `ProcessRetrospective`, completed `HistoricalProcessImportJob`
- Implement generation with:
  - strict prompt templates + redaction rules for PII (document policy in PR)
  - human-in-the-loop defaults (stored suggestions, not auto actions)

Exit criteria:
- insight generation returns structured JSON with rationale snippets referencing internal IDs only.

### Phase C - Historical Lost-Process Import

- Accept pasted content and create `HistoricalProcessImportJob`.
- Async parsing to propose:
  - company/title/outcome cues
  - message timeline candidates
- User confirmation step (API) to finalize extracted `ProcessOutcome` evidence references.

Exit criteria:
- imports that are ambiguous land in `needs_review` with diagnostics.

### Phase D - Cross-Process Learning Loop (MVP)

- Implement recommendation ranking:
  - start with frequency-based theme extraction across lost processes
  - store “themes” with counts and example evidence references
- Add lightweight user feedback on recommendations.

Exit criteria:
- system can surface top N recurring themes for a workspace without requiring full ML stack.

## 6) Celery and Queues

- Queue: `insights`
  - transcript normalization
  - historical import parsing
  - coaching synthesis (may be long-running)
- Retry policy:
  - bounded retries for provider timeouts
  - non-retriable for invalid uploads

## 7) Security and Privacy

- Transcripts and recordings are highly sensitive:
  - tenant-isolated storage paths
  - access checks on every fetch
  - optional encryption-at-rest decision documented (MVP may rely on provider encryption)
- Redact or minimize third-party PII in model prompts; log redaction policy.

## 8) Testing Strategy

- Unit tests:
  - subtitle parsers (fixtures)
  - entitlement gating logic
  - theme extraction ranking determinism on fixed corpus
- Integration tests:
  - attach recording + upload transcript -> normalized transcript persisted
  - generate insights -> persisted retrospective snapshot
  - paste historical import -> needs_review -> confirm -> outcome stored

## 9) Risks and Mitigations

- LLM provider variability:
  - Mitigation: adapter interface + contract tests on structured output parsing.
- Privacy leakage via prompts:
  - Mitigation: redaction pipeline + allowlist of fields included in prompts.
- Parsing quality for pasted threads:
  - Mitigation: `needs_review` path always available.

## 10) Validation Checklist

- all interview learning records are workspace-scoped.
- premium gating matches spec ordering: flag -> entitlement -> role.
- async jobs have explicit statuses and error diagnostics.
- no auto-send or external automation is introduced.

## 11) Approval Gate

Approval of this track authorizes:
- creating dedicated worktree for interview learning pipelines,
- implementing services/tasks for transcripts, coaching, and historical imports,
- opening focused PRs without expanding resume rendering scope (Track 05) or full UI scope (Track 07).
