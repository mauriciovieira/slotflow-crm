# Track 05: Resume Import, Editor, and Themed Render Pipeline

Status: Draft (awaiting approval)  
Spec reference: `docs/superpowers/specs/2026-04-16-slotflow-crm-design.md`  
Execution mode: isolated worktree (`.worktrees/track-05-resume-import-render-pipeline`)

## 1) Objectives

- Implement structured resume editing (`ResumeSection`, `ResumeItem`) with deterministic ordering.
- Persist canonical JSON Resume snapshots per `ResumeVersion`.
- Implement ingestion pipelines:
  - full JSON Resume upload/import
  - LinkedIn PDF export import with confidence + human review path
- Implement themed rendering using JSON Resume themes ecosystem.
- Execute long-running work on Celery with explicit state machines and idempotency.

## 2) Scope Boundaries

- In scope:
  - domain services + application services for resume editor/import/render
  - Celery tasks, queues, retries, job status transitions
  - file storage strategy for uploads and rendered artifacts
  - HTTP endpoints needed by the React editor (minimal DRF surface)
  - MCP tool implementations that delegate to the same services (wired in Track 04/07 as applicable)
- Out of scope:
  - full React UI polish (Track 07)
  - full MCP transport packaging beyond service calls (Track 04)
  - advanced analytics for resume quality

## 3) Deliverables

- Resume editor persistence layer:
  - CRUD for sections/items with ordering
  - mapping layer: DB rows -> canonical JSON Resume document
  - versioning strategy for `ResumeVersion` snapshots (hash/checksum)
- Import jobs:
  - `ResumeImportJob` processing for `json_resume_upload` and `linkedin_pdf`
  - normalization + diagnostics payloads
- Render jobs:
  - `ResumeRender` pipeline producing HTML/PDF (format decision documented in PR)
  - theme allowlist and theme discovery list endpoint
- Storage:
  - object storage abstraction (S3-compatible or Render disk strategy — choose and document)
- Observability hooks:
  - structured logs per job id
  - metrics counters for job success/failure/retry

## 4) State Machine Compliance

Implement transitions aligned with spec:

- `ResumeImportJob`: `pending` -> `processing` -> (`completed` | `needs_review` | `failed`)
- `ResumeRender`: `pending` -> `processing` -> (`completed` | `failed`)

Rules:
- illegal transitions return domain error `invalid_state_transition`
- retries only through explicit events (`user_requested_retry`, bounded worker retries)

## 5) Execution Phases

### Phase A - Editor Data Model and JSON Resume Mapping

- Implement serializers/services to:
  - create/update sections/items
  - reorder deterministically
  - generate `JsonResumeDocument` snapshot on save (debounced strategy optional)
- Add validation for JSON Resume schema compatibility (library choice documented in PR).

Exit criteria:
- can round-trip: DB -> JSON Resume -> DB for MVP sections.

### Phase B - JSON Resume Import Pipeline

- Accept upload payload or file reference.
- Validate schema and map into structured rows.
- Transition job states per spec; persist warnings.

Exit criteria:
- import completes or enters `needs_review` with diagnostics.

### Phase C - LinkedIn PDF Import Pipeline

- PDF text extraction + segmentation heuristics.
- Confidence scoring + `needs_review` thresholding.
- Store provenance metadata and raw artifact reference.

Exit criteria:
- low-confidence imports never silently finalize as production-ready without review state.

### Phase D - Theme Rendering

- Integrate JSON Resume theme rendering:
  - maintain allowlist of theme ids
  - implement `resume.themes.list`
  - implement `resume.render_theme` with idempotency key (`resume_version_id`, `theme_id`, `format`)
- Store render artifacts and metadata in `ResumeRender`.

Exit criteria:
- repeated render requests with same idempotency key do not create duplicate artifacts.

### Phase E - API Surface (Minimal)

- DRF endpoints for:
  - editor CRUD
  - import kickoff + job status polling
  - render kickoff + artifact fetch
- Align authorization with workspace membership + roles.

Exit criteria:
- Postman/curl happy path works end-to-end locally.

## 6) Celery Design

- Queues:
  - `imports` for JSON/PDF ingestion
  - `render` for themed output generation
- Task design:
  - idempotent tasks
  - explicit `workspace_id` in task kwargs
  - bounded retries with exponential backoff for transient failures
- Beat:
  - optional watchdog task for stuck `processing` jobs

## 7) Security and Privacy

- Uploaded files are sensitive:
  - virus scanning hook optional but document decision
  - strict content-type/size limits
  - tenant isolation for stored objects (path prefix per workspace)
- Rendered artifacts must not leak across workspaces via URLs (signed URLs or auth-gated fetch).

## 8) Testing Strategy

- Unit tests:
  - JSON Resume mapping
  - import state transitions
  - render idempotency
  - PDF parser confidence thresholds (use fixtures)
- Integration tests:
  - upload JSON -> job completes -> snapshot persisted
  - upload PDF -> `needs_review` path -> user confirmation simulation
  - render theme -> artifact stored -> fetch succeeds

## 9) Risks and Mitigations

- PDF parsing quality variance:
  - Mitigation: confidence thresholds + review UX contract (even if UI is minimal in this track).
- Theme rendering supply chain risk:
  - Mitigation: pin theme versions or bundle known-good themes.
- Large files and timeouts:
  - Mitigation: async tasks, chunked processing where applicable, strict size caps.

## 10) Validation Checklist

- editor changes produce deterministic JSON Resume ordering.
- import/render jobs obey state machines and emit audit-friendly diagnostics.
- artifacts are tenant-isolated and access-controlled.
- idempotency works for render and critical imports.

## 11) Approval Gate

Approval of this track authorizes:
- creating dedicated worktree for resume pipelines,
- implementing services/tasks/storage for import/render,
- opening focused PRs without expanding unrelated domains.
