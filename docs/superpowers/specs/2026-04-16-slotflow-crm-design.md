# Slotflow CRM MVP Design

Date: 2026-04-16  
Status: Approved for planning  
Scope: MVP (1.0)

## 1) Product Goal

Build a SaaS-ready system to manage job opportunities ("slots"), interview pipelines, recruiter conversations, and opportunity-specific resume tailoring from a JSON Resume source.

The MVP focuses on control and clarity:

- track where each conversation is happening (email, LinkedIn)
- define a custom interview cycle per opportunity
- assign one or more people to each interview step
- generate AI response drafts for inbound messages (human review before send)
- tailor resume versions per opportunity based on structured requirements

## 2) MVP Objectives

- Centralize opportunity, people, pipeline, and conversation context in one place.
- Provide a customizable interview cycle for each opportunity.
- Keep communication support human-in-the-loop (AI drafts only, no auto-send).
- Improve resume targeting by mapping requirements to tailored resume content.
- Ship as a multi-tenant web app deployable on Render.

## 3) Users and Tenancy

Primary user for MVP is the workspace owner, but the system is multi-user and multi-tenant from day one.

- Tenant model: `Workspace`
- Users belong to one or more workspaces through membership records.
- Django Admin access is restricted to system administrators only (internal operations).
- Basic role-based access control:
  - `Owner`: full access
  - `Member`: create/update operational records
  - `Viewer`: read-only

All domain records are tenant-scoped and must enforce workspace isolation.
Product users can only access opportunity and related records from workspaces where they have membership.

## 4) Core Domain Model

- `Workspace`
  - account/tenant boundary for data isolation
- `User`
  - authenticated person using the product
- `Membership`
  - joins user to workspace with role
- `Person`
  - generic contact entity with role tags
  - examples: recruiter, interviewer, hiring manager
  - channels: email, LinkedIn URL, phone, notes
- `Opportunity`
  - the job/submission unit being tracked
  - fields: title, source site, status, priority, deadlines, compensation notes, custom notes
  - hiring context fields:
    - `end_client_organization_id` (final company where work will happen)
    - `intermediary_organization_id` (optional agency/consultancy handling hiring)
    - `employment_model` (direct hire, contractor via intermediary, other)
    - `compensation_model` (salary, hourly, mixed)
  - compensation comparison fields (stored on opportunity):
    - `compensation_currency` (source/original currency, for example `USD`, `BRL`, `EUR`)
    - `compensation_period` (`hour`, `month`, `year`)
    - `compensation_min` / `compensation_max`
    - `pto_days`
    - `sick_days`
- `UserCurrencyPreference`
  - per-user dashboard preference for which currencies should be displayed in comparisons
  - default preferred currencies: `USD` and `BRL`
- `FxQuoteSnapshot`
  - cached FX quote data from public providers (official and parallel market rate sources when available)
  - used to convert opportunity compensation values for dashboard comparison
- `Organization`
  - company/legal entity participating in hiring context
  - types: end client, agency, consultancy, staffing partner, other
  - fields: legal/trade name, location, website, notes
- `OpportunityRequirement`
  - structured role requirements linked to one opportunity
  - categories: must-have, nice-to-have, years/seniority, tech stack, language, location/work model, domain requirements
- `InterviewCycle`
  - one custom cycle per opportunity
- `InterviewStep`
  - ordered customizable steps in the cycle
  - fields: type/name, status, assigned people, target dates, outcomes, notes
- `InterviewSessionArtifact`
  - stores external recording references for an interview step (for example Loom URL)
- `InterviewTranscript`
  - stores uploaded transcript content/metadata (SRT, VTT, TXT or equivalent normalized text)
- `ConversationThread`
  - communication context, grouped by channel and relationship to opportunity/person
- `Message`
  - manual log entry in MVP
  - direction (inbound/outbound), channel (email/LinkedIn), timestamp, raw text, normalized text
- `BaseResume`
  - source JSON Resume profile
- `ResumeVersion`
  - opportunity-tailored resume variant derived from base profile
- `ResumeSection`
  - normalized section container stored in database (summary, work, education, projects, skills, etc.)
- `ResumeItem`
  - normalized item entry linked to a section (for example one experience/project entry)
- `ResumeEvidenceMap`
  - links requirement(s) to resume bullet(s)/section(s) to explain tailoring choices
- `ResumeRender`
  - rendered output metadata for a selected JSON Resume theme (theme id, format, artifact URL, version hash)
- `ResumeImportJob`
  - tracks resume ingestion from user-provided sources (full JSON Resume upload or LinkedIn PDF export)
- `ReplySuggestion`
  - AI-generated response draft
  - includes metadata: tone/style, source context summary, accepted/edited status
- `ProcessRetrospective`
  - captures post-interview/process reflection, lessons learned, and suggested improvements
- `ProcessOutcome`
  - captures final outcome (won/lost/withdrawn), rejection reasons, and feedback evidence
- `HistoricalProcessImportJob`
  - tracks imports of previously lost processes from pasted emails/LinkedIn messages

### 4.1 DDD Modeling (MVP)

#### Bounded Contexts

- `IdentityAndAccess`
  - user identity, membership, roles, authentication/2FA, MCP token issuance
- `OpportunityManagement`
  - opportunities, requirements, interview cycle/steps, pipeline transitions
- `InterviewLearning`
  - interview recordings, transcript analysis, cross-process feedback synthesis, coaching guidance
- `RelationshipAndCommunication`
  - people directory, conversation threads, message logging
- `ResumeTailoring`
  - base resume, tailored resume versions, requirement-to-evidence mapping
  - section/item editor, JSON Resume export, themed rendering, and import pipelines
- `AIWritingAssistance`
  - reply suggestion generation lifecycle and decision state
- `BillingAndEntitlements`
  - tenant-level feature access rights used by policy checks

#### Aggregates and Aggregate Roots

- `Workspace` (aggregate root)
  - owns tenant boundary and membership policies
  - child entities: `Membership`
- `Opportunity` (aggregate root)
  - child entities: `OpportunityRequirement`, `InterviewCycle`, `InterviewStep`, `InterviewSessionArtifact`, `InterviewTranscript`, `ProcessOutcome`
  - enforces pipeline transition rules and ordering constraints
- `Organization` (aggregate root)
  - reusable organization registry for end clients and intermediaries
- `ConversationThread` (aggregate root)
  - child entities: `Message`
  - enforces channel and direction consistency
- `Person` (aggregate root)
  - independent registry entity linked by reference from opportunity/thread contexts
- `BaseResume` (aggregate root)
  - source profile for resume tailoring operations
- `ResumeVersion` (aggregate root)
  - child entities: `ResumeSection`, `ResumeItem`, `ResumeEvidenceMap`, `ResumeRender`
  - tied to one `Opportunity` and one base profile lineage
- `ResumeImportJob` (aggregate root)
  - tracks status and provenance of resume imports from JSON Resume and LinkedIn PDF sources
- `ReplySuggestion` (aggregate root)
  - tracks draft generation, revision decision, and acceptance status
- `ProcessRetrospective` (aggregate root)
  - tracks coaching insights derived from transcripts, outcomes, and historical process evidence
- `HistoricalProcessImportJob` (aggregate root)
  - tracks lifecycle of imports from pasted recruiter emails and LinkedIn messages
- `WorkspaceEntitlement` (aggregate root)
  - defines paid capability availability per workspace

#### Value Objects (Initial Set)

- `WorkspaceId`, `UserId`, `OpportunityId`, `ThreadId`, `MessageId`
- `OrganizationId`
- `ResumeVersionId`, `ResumeSectionId`, `ResumeItemId`, `ResumeImportJobId`
- `InterviewStepId`, `InterviewTranscriptId`, `ProcessOutcomeId`, `HistoricalProcessImportJobId`
- `EmailAddress`, `LinkedInProfileUrl`, `PhoneNumber`
- `MoneyRange` (for compensation notes when structured)
- `CompensationCurrency` (ISO currency code, not limited to a fixed list)
- `CompensationPeriod` (`hour`, `month`, `year`)
- `DateWindow` (target date windows and deadlines)
- `PipelineStatus`, `StepStatus`, `MessageDirection`, `ChannelType`
- `RoleType` (`Owner`, `Member`, `Viewer`)
- `FeatureCode` (for entitlement + flag checks)
- `JsonResumeDocument`, `ThemeId`, `ImportSourceType`
- `TranscriptFormat`, `OutcomeStatus`, `FeedbackSignal`, `RecordingProvider`
- `EmploymentModel`, `CompensationModel`, `OrganizationType`
- `FxRateType` (`official`, `parallel`)

#### Domain Services (Initial Set)

- `AccessPolicyService`
  - evaluates role, workspace membership, and entitlement constraints
- `FeatureAccessService`
  - combines global flags and tenant entitlements for final feature authorization
- `PipelineTransitionService`
  - validates and executes allowed interview step transitions
- `ReplySuggestionService`
  - orchestrates suggestion generation using thread + opportunity context
- `McpAuthorizationService`
  - resolves active workspace context and request-level access for MCP calls
- `ResumeImportService`
  - parses and normalizes full JSON Resume uploads and LinkedIn PDF exports
- `ResumeRenderingService`
  - renders a `ResumeVersion` into JSON Resume themes and manages output artifacts
- `InterviewInsightService`
  - analyzes transcripts and outcome feedback to produce guidance for upcoming steps
- `HistoricalImportService`
  - normalizes pasted email/LinkedIn content into structured historical process records
- `CurrencyConversionService`
  - fetches/caches FX rates from public APIs and converts compensation for dashboard comparison

#### Domain Invariants (Must Hold)

- Every mutable domain record is scoped to exactly one `Workspace`.
- No user can read/write records outside workspaces where membership exists.
- `Opportunity` cannot reference people/threads from another workspace.
- `Opportunity` must reference exactly one end-client organization and may reference one intermediary organization.
- `Opportunity` cannot use the same organization as both end client and intermediary.
- `Opportunity` must preserve the original compensation currency provided by the user.
- `InterviewStep` transition must follow defined cycle transition rules.
- `Message` must have valid `channel`, `direction`, and timestamp.
- `ReplySuggestion` generation requires sufficient conversation/opportunity context.
- Premium capabilities require both global flag allowance and workspace entitlement.
- `InterviewSessionArtifact` URL must be a valid supported external recording URL.
- `InterviewTranscript` must preserve source format metadata and normalized text extraction.
- Lost process records must retain feedback provenance (source snippet and timestamp when available).
- `ResumeVersion` is the canonical source for JSON Resume snapshots generated by the editor/import pipeline.
- `ResumeSection` and `ResumeItem` ordering must be deterministic for stable JSON Resume rendering.
- LinkedIn PDF import must produce traceable provenance metadata in `ResumeImportJob`.

#### Repository Interfaces (Conceptual)

- `WorkspaceRepository`, `MembershipRepository`
- `OpportunityRepository`, `InterviewCycleRepository`
- `OrganizationRepository`
- `PersonRepository`, `ConversationThreadRepository`, `MessageRepository`
- `BaseResumeRepository`, `ResumeVersionRepository`
- `ReplySuggestionRepository`
- `WorkspaceEntitlementRepository`
- `AuditEventRepository`

### 4.2 Minimal Schema for New Entities

#### `Organization`

- Purpose: reusable organization registry for end clients and intermediaries.
- Minimum fields:
  - `id` (UUID, PK)
  - `workspace_id` (FK -> `Workspace`, indexed)
  - `organization_type` (enum: `end_client`, `agency`, `consultancy`, `staffing_partner`, `other`)
  - `legal_name` (string)
  - `display_name` (string, optional)
  - `website_url` (string, optional)
  - `country_code` (string, optional)
  - `notes` (text, optional)
  - `created_by_user_id` (FK -> `User`)
  - `created_at`, `updated_at` (datetime)
- Constraints:
  - unique (`workspace_id`, `legal_name`) to reduce duplicates per tenant.
  - organization records are tenant-scoped and cannot be referenced cross-workspace.

#### `InterviewSessionArtifact`

- Purpose: persist interview recording references linked to an interview step/session.
- Minimum fields:
  - `id` (UUID, PK)
  - `workspace_id` (FK -> `Workspace`, indexed)
  - `opportunity_id` (FK -> `Opportunity`, indexed)
  - `interview_step_id` (FK -> `InterviewStep`, indexed)
  - `provider` (enum: `loom`, `google_drive`, `other`)
  - `recording_url` (text/url)
  - `title` (string, optional)
  - `recorded_at` (datetime, optional)
  - `created_by_user_id` (FK -> `User`)
  - `created_at`, `updated_at` (datetime)
- Constraints:
  - `workspace_id` must match related `Opportunity` and `InterviewStep`.
  - `recording_url` must be valid URL and allowed provider/scheme.

#### `InterviewTranscript`

- Purpose: persist source transcript file metadata and normalized content for analysis.
- Minimum fields:
  - `id` (UUID, PK)
  - `workspace_id` (FK -> `Workspace`, indexed)
  - `opportunity_id` (FK -> `Opportunity`, indexed)
  - `interview_step_id` (FK -> `InterviewStep`, indexed)
  - `artifact_id` (FK -> `InterviewSessionArtifact`, nullable)
  - `source_format` (enum: `vtt`, `srt`, `txt`, `other`)
  - `source_file_url` (string/text, optional if inline paste supported later)
  - `normalized_text` (long text)
  - `language_code` (string, optional)
  - `duration_seconds` (integer, optional)
  - `confidence_score` (decimal, optional)
  - `created_by_user_id` (FK -> `User`)
  - `created_at`, `updated_at` (datetime)
- Constraints:
  - transcript must be tenant-scoped and linked to one interview step.
  - keep original format metadata even when normalized text exists.

#### `ProcessOutcome`

- Purpose: persist process result and explicit recruiter/interviewer feedback signals.
- Minimum fields:
  - `id` (UUID, PK)
  - `workspace_id` (FK -> `Workspace`, indexed)
  - `opportunity_id` (FK -> `Opportunity`, unique/indexed)
  - `status` (enum: `won`, `lost`, `withdrawn`, `inconclusive`)
  - `outcome_at` (datetime, optional)
  - `rejection_reason` (string, optional)
  - `feedback_summary` (text, optional)
  - `feedback_signals` (jsonb array/object)
  - `evidence_refs` (jsonb, optional)
  - `created_by_user_id` (FK -> `User`)
  - `created_at`, `updated_at` (datetime)
- Constraints:
  - max one active outcome per opportunity.
  - evidence snippets must reference tenant-owned content only.

#### `ProcessRetrospective`

- Purpose: store post-process reflection and coaching guidance snapshots.
- Minimum fields:
  - `id` (UUID, PK)
  - `workspace_id` (FK -> `Workspace`, indexed)
  - `opportunity_id` (FK -> `Opportunity`, indexed)
  - `process_outcome_id` (FK -> `ProcessOutcome`, nullable)
  - `strengths` (jsonb array)
  - `improvements` (jsonb array)
  - `recommended_talking_points` (jsonb array)
  - `source_transcript_ids` (jsonb array of ids)
  - `source_historical_import_ids` (jsonb array of ids)
  - `created_by_user_id` (FK -> `User`)
  - `created_at`, `updated_at` (datetime)
- Constraints:
  - all referenced source ids must belong to same workspace.

#### `HistoricalProcessImportJob`

- Purpose: track lifecycle of imports from pasted email/LinkedIn historical content.
- Minimum fields:
  - `id` (UUID, PK)
  - `workspace_id` (FK -> `Workspace`, indexed)
  - `source_type` (enum: `email_paste`, `linkedin_paste`, `mixed_paste`)
  - `status` (enum: `pending`, `processing`, `needs_review`, `completed`, `failed`)
  - `raw_input_text` (long text)
  - `normalized_payload` (jsonb, optional)
  - `extracted_company` (string, optional)
  - `extracted_role_title` (string, optional)
  - `extracted_rejection_reason` (string, optional)
  - `error_code` (string, optional)
  - `error_message` (text, optional)
  - `retry_count` (integer, default 0)
  - `created_by_user_id` (FK -> `User`)
  - `created_at`, `updated_at`, `completed_at` (datetime)
- Constraints:
  - status transitions must follow defined state machine.
  - input and extracted data remain workspace-scoped.

#### Indexing and Audit Baseline

- Required composite indexes:
  - (`workspace_id`, `opportunity_id`) on all opportunity-linked entities.
  - (`workspace_id`, `status`) on async job entities.
  - (`workspace_id`, `interview_step_id`) on transcript/artifact entities.
- Required audit metadata on all new entities:
  - actor (`created_by_user_id` / `updated_by_user_id` where applicable)
  - timestamps (`created_at`, `updated_at`)
  - soft-delete marker if entity is user-removable in MVP.

## 5) Functional Requirements

### 5.1 Opportunity and Pipeline Management

- Create, update, archive opportunities.
- Associate each opportunity with:
  - one end client organization
  - optional intermediary (agency/consultancy) organization
  - employment/contract model metadata
- Define a custom interview cycle for each opportunity.
- Add, reorder, and update interview steps.
- Assign one or more `Person` records to each step.
- Track step status and outcomes with timestamps and notes.
- Store final process outcome (`won`, `lost`, `withdrawn`) and structured rejection/feedback notes.
- Persist compensation/perk context in a way that supports cross-opportunity comparison.
- Compensation fields must support:
  - source currency persisted exactly as entered by user (for example `USD`, `BRL`, `EUR`)
  - period in `hour`, `month`, or `year`
  - PTO and sick-day values on each opportunity record
- Dashboard compensation comparison must support:
  - online FX conversion using public forex APIs
  - conversion display for official and parallel BRL/USD rates when available
  - per-user preferred display currencies (default `USD` and `BRL`)
  - transparent support for newly seen currencies without manual admin registration

### 5.2 People and Contact Registry

- Create and manage generic `Person` records.
- Support multiple role tags per person.
- Store contact channels (email, LinkedIn, phone) and free-form notes.
- Link people to opportunities, interview steps, and conversation threads.
- Maintain an `Organization` registry reusable across opportunities and contacts.

### 5.3 Conversation Tracking (MVP Input Mode)

- Manual message entry for email and LinkedIn.
- Keep message timeline per thread and opportunity context.
- Support inbound and outbound direction tagging.
- Preserve audit history (soft-delete/archive behavior preferred).
- Allow importing historical lost-process context by pasting recruiter emails and LinkedIn messages.

### 5.4 Interview Recording, Transcript, and Coaching

- For each interview step/session, allow storing one or more external recording links (for example Loom).
- Allow transcript upload in common formats (SRT, VTT, TXT, and extensible parser support for equivalent formats).
- Normalize transcript content into searchable text while preserving original file and format metadata.
- Generate coaching insights for upcoming interviews based on:
  - current opportunity interview transcript content
  - historical interview transcripts
  - explicit feedback/rejection reasons from lost processes
- Provide actionable guidance on:
  - message clarity and structure
  - missed points and suggested stronger framing
  - recurring weak signals across multiple failed processes
- Keep human-in-the-loop behavior: suggestions are advisory and user-editable.

### 5.5 AI-Assisted Replies (Human Review)

- Generate draft replies from selected thread context.
- Use opportunity requirements and current pipeline state as context.
- No automatic sending in MVP.
- User can accept/edit/reject drafts.

### 5.6 Resume Tailoring

- Provide a structured resume editor backed by database entities (`ResumeSection` and `ResumeItem`).
- Persist each resume version as canonical JSON Resume document output.
- Allow users to upload a full JSON Resume file directly as source for an opportunity-specific version.
- Accept LinkedIn PDF export uploads and generate a normalized resume version from extracted content.
- Render JSON Resume using available themes from the JSON Resume ecosystem ([https://jsonresume.org/themes](https://jsonresume.org/themes)).
- Keep track of selected theme and rendered artifacts per resume version.
- Store base resume as JSON Resume.
- Create opportunity-specific resume variants.
- Show requirement coverage and gaps.
- Store rationale mapping between requirements and selected resume evidence.

### 5.7 MCP Text Interface (Developer-Focused)

- Provide a tenant-aware MCP server as a first-class product interface for developer users.
- Support opportunity lifecycle operations via MCP (create, list, update, archive, pipeline progression).
- Support conversation ingestion via MCP, including manual upload/logging of recruiter messages.
- Support people/interview step assignment and timeline operations via MCP.
- Ensure functional parity for core pipeline interactions between web UI and MCP interface.
- All MCP operations must enforce workspace membership, role checks, and audit logging.

### 5.8 MCP Initial Contract (MVP)

- Transport and protocol:
  - MCP server exposed by the backend stack as a tenant-aware product interface.
  - JSON input/output with stable tool names and versioned response payloads.
- Required request context for all tools:
  - authenticated user identity
  - active `workspace_id`
  - idempotency key for mutating operations (when applicable)
- Initial tool set:
  - `workspace.list`: list workspaces where the user has membership.
  - `opportunity.list`: list workspace-scoped opportunities with filters/status.
  - `opportunity.create`: create opportunity with required fields and initial status.
  - `opportunity.update`: update mutable opportunity fields.
  - `organization.upsert`: create/update organization registry records.
  - `opportunity.set_hiring_context`: set end client, intermediary, and employment model.
  - `user.currency_preferences.get`: return current dashboard currency preferences for authenticated user.
  - `user.currency_preferences.set`: set preferred dashboard display currencies (defaults to `USD` + `BRL`).
  - `fx.quotes.get`: return latest conversion quotes (including `official`/`parallel` when available) for requested currency pairs.
  - `pipeline.advance`: move opportunity/interview step with transition validation.
  - `interview.recording.add`: attach recording URL(s) to an interview step/session.
  - `interview.transcript.upload`: upload and register transcript for an interview step/session.
  - `interview.insights.generate`: generate coaching guidance from transcript/outcome history.
  - `person.upsert`: create/update people used in interview and conversation context.
  - `thread.list`: list conversation threads by opportunity/person/channel.
  - `message.log`: log inbound/outbound recruiter message for a thread/opportunity.
  - `process.outcome.set`: persist process result and feedback signals.
  - `process.history.import_pasted`: import prior lost process evidence from pasted emails/LinkedIn messages.
  - `reply_suggestion.generate`: generate AI draft reply with entitlement and role checks.
  - `resume_version.create_or_update`: create/update opportunity-tailored resume version.
  - `resume.import_json`: ingest a full JSON Resume payload for an opportunity.
  - `resume.import_linkedin_pdf`: ingest a LinkedIn PDF export and generate normalized resume content.
  - `resume.render_theme`: render a resume version using a selected JSON Resume theme.
  - `resume.themes.list`: list supported theme identifiers available for rendering.
- Baseline response contract:
  - success payload includes `data`, `workspace_id`, and `request_id`.
  - error payload includes machine-readable `code`, human-readable `message`, and optional `field_errors`.
  - authorization failures return explicit `forbidden_workspace` or `insufficient_role` style codes.

## 6) Data Flow (Primary Journey)

1. User creates `Opportunity`.
2. User links one end-client organization and optional intermediary organization, with employment model.
3. User captures structured `OpportunityRequirement` data.
4. User defines custom `InterviewCycle` and `InterviewStep` sequence.
5. User links `Person` contacts and assigns them to steps.
6. User logs messages manually for email/LinkedIn.
7. User requests an AI `ReplySuggestion` based on thread + opportunity context.
8. User updates or creates `ResumeVersion` for the opportunity and reviews requirement coverage.
9. User advances pipeline as interviews progress.
10. User may execute the same core lifecycle actions through MCP tools with equivalent validation and authorization rules.
11. User links interview recordings/transcripts and receives coaching insights for subsequent steps.
12. After outcome, user stores explicit feedback and preserves lost-process evidence for future learning.

### 6.1 Resume Import and Rendering Flows

#### A) Full JSON Resume Import (User-Provided)

1. User selects opportunity context and uploads a complete JSON Resume document.
2. API/MCP validates authentication, workspace membership, role, and opportunity ownership.
3. System creates `ResumeImportJob` with source `json_resume_upload` and status `pending`.
4. Celery worker validates JSON schema compatibility and normalizes unsupported/custom fields.
5. Worker maps normalized content into `ResumeSection` and `ResumeItem` structures.
6. System creates or updates `ResumeVersion` and stores canonical `JsonResumeDocument` snapshot.
7. `ResumeImportJob` transitions to `completed` with warnings (if any) and provenance metadata.
8. User reviews imported content in the structured editor before publishing/rendering.

#### B) LinkedIn PDF Export Import

1. User uploads LinkedIn profile PDF in the selected workspace/opportunity context.
2. API/MCP performs file-level checks (type, size, malware scan hook, workspace scope).
3. System creates `ResumeImportJob` with source `linkedin_pdf` and status `pending`.
4. Celery pipeline extracts raw text and document segments from PDF.
5. Parsing stage classifies content into candidate resume sections (summary, experience, education, skills, projects).
6. Normalization stage converts candidates to `ResumeSection`/`ResumeItem` and computes per-field confidence scores.
7. System writes a draft `ResumeVersion` plus extraction metadata (confidence, parser notes, missing fields).
8. `ResumeImportJob` moves to:
  - `needs_review` when confidence is below threshold or critical fields are missing
  - `completed` when extraction quality meets baseline
9. User reviews/edits extracted content in editor and confirms the version for downstream use.

#### C) Theme Rendering Flow (JSON Resume Themes)

1. User selects a `ResumeVersion` and a theme identifier from `resume.themes.list`.
2. API/MCP validates access and confirms the theme is in the supported allowlist.
3. System enqueues render task with idempotency safeguards for (`resume_version_id`, `theme_id`, `format`).
4. Celery render worker builds themed output from canonical JSON Resume snapshot.
5. System stores artifact metadata in `ResumeRender` (theme id, format, checksum/hash, artifact location, timestamps).
6. Previous artifacts remain versioned for auditability; latest successful render is marked as active.
7. Response returns artifact references for preview/download and any non-fatal render warnings.

#### D) Failure Handling and Recovery

- `ResumeImportJob` states: `pending`, `processing`, `needs_review`, `completed`, `failed`.
- `ResumeRender` states: `pending`, `processing`, `completed`, `failed`.
- Every failed job/render stores machine-readable error code and operator-facing message.
- Retriable failures (transient IO/parser timeout) use bounded retries with exponential backoff.
- Non-retriable failures (invalid payload, unsupported file) fail fast with actionable validation feedback.
- Manual retry is available after user correction (for example re-upload corrected PDF/JSON).

#### E) Human-in-the-Loop Guarantees

- Imported data is never auto-published externally; user confirmation is required before external use.
- Low-confidence extracted fields are highlighted and require explicit review.
- Original source artifact reference is retained for traceability and dispute resolution.
- Edits made after import preserve lineage (`imported_value` vs `user_edited_value`) for audit.

### 6.2 Interview Learning and Historical Loss Analysis Flows

#### A) Interview Recording + Transcript Flow

1. User attaches recording URL (Loom or supported provider) to a specific interview step/session.
2. User uploads transcript file (SRT/VTT/TXT or equivalent supported format).
3. System validates file type/size, workspace scope, and interview step association.
4. Celery normalizes transcript into canonical segmented text with timestamps when available.
5. Transcript is stored with source metadata and linked to the interview step.

#### B) Coaching Insight Generation Flow

1. User requests coaching for a current opportunity step.
2. System gathers context from:
  - current opportunity transcripts/messages
  - prior outcomes and rejection feedback
  - historical lost-process imports
3. Insight service generates:
  - strengths to keep
  - improvement opportunities
  - suggested talking points for upcoming rounds
4. User reviews and optionally saves selected guidance into `ProcessRetrospective`.

#### C) Historical Lost-Process Import via Pasted Content

1. User pastes email and/or LinkedIn message threads from previous processes.
2. System creates `HistoricalProcessImportJob` with source metadata and workspace scope.
3. Parser normalizes pasted content into thread/message timeline and extracts feedback cues.
4. User confirms/edits extracted company, role, stage, and rejection reason fields.
5. System stores finalized `ProcessOutcome` and links source evidence snippets.

#### D) Cross-Process Learning Loop

1. On new interview preparation, system queries prior lost-process outcomes and retrospectives.
2. Repeated feedback signals are clustered into recurring themes.
3. Guidance is surfaced as ranked recommendations for the current pipeline step.
4. User feedback on recommendations is captured to improve future suggestion quality.

### 6.3 State Machines (Resume Import/Render)

#### A) `ResumeImportJob` State Machine

- States:
  - `pending`
  - `processing`
  - `needs_review`
  - `completed`
  - `failed`
- Events:
  - `enqueue_processing`
  - `start_processing`
  - `processing_succeeded`
  - `processing_needs_review`
  - `processing_failed`
  - `user_confirmed_review`
  - `user_requested_retry`
- Allowed transitions:
  - `pending` -> `processing` on `start_processing`
  - `processing` -> `completed` on `processing_succeeded`
  - `processing` -> `needs_review` on `processing_needs_review`
  - `processing` -> `failed` on `processing_failed`
  - `needs_review` -> `completed` on `user_confirmed_review`
  - `needs_review` -> `processing` on `user_requested_retry`
  - `failed` -> `processing` on `user_requested_retry`
- Guard conditions:
  - `start_processing`: source artifact exists, workspace/opportunity scope is valid, and job not terminal.
  - `processing_succeeded`: canonical JSON Resume snapshot persisted and section/item normalization complete.
  - `processing_needs_review`: one or more critical fields missing OR confidence below threshold.
  - `user_confirmed_review`: user has `Owner` or `Member` role in workspace and unresolved critical warnings are addressed/acknowledged.
  - `user_requested_retry`: retry budget not exceeded and cause is retriable or source artifact replaced.
- Side effects by transition:
  - entering `processing`: enqueue Celery task chain and set `started_at`.
  - entering `needs_review`: store confidence map, missing fields, parser diagnostics.
  - entering `completed`: persist `completed_at`, link finalized `resume_version_id`, emit audit event.
  - entering `failed`: persist machine-readable error code/message and increment retry count.
- Terminality:
  - `completed` is terminal for current artifact version.
  - `failed` is terminal unless explicit `user_requested_retry` creates a new processing attempt.

#### B) `ResumeRender` State Machine

- States:
  - `pending`
  - `processing`
  - `completed`
  - `failed`
- Events:
  - `enqueue_render`
  - `start_render`
  - `render_succeeded`
  - `render_failed`
  - `retry_render`
- Allowed transitions:
  - `pending` -> `processing` on `start_render`
  - `processing` -> `completed` on `render_succeeded`
  - `processing` -> `failed` on `render_failed`
  - `failed` -> `processing` on `retry_render`
- Guard conditions:
  - `start_render`: `ResumeVersion` exists, active theme is supported, and idempotency key is unique or points to same render intent.
  - `render_succeeded`: artifact stored successfully, checksum/hash generated, and metadata persisted.
  - `retry_render`: failure reason is retriable OR user changed theme/format/input version.
- Side effects by transition:
  - entering `processing`: enqueue Celery render task and set `started_at`.
  - entering `completed`: store artifact location, checksum/hash, `completed_at`, and mark active render pointer.
  - entering `failed`: persist error code/message and failure diagnostics for support visibility.

#### C) Cross-Cutting State Machine Rules

- All transitions are workspace-scoped and must be authorized server-side.
- Transition operations are idempotent and safe under retries.
- Illegal transitions must return explicit domain error codes (for example `invalid_state_transition`).
- State changes emit audit events including actor, workspace, entity id, previous state, next state, and reason.

## 7) Non-Functional Requirements

### 7.1 Multi-Tenant Safety

- Every query must be workspace-scoped.
- Prevent cross-tenant reads/writes at service and persistence layers.
- Include tenant context in audit events.
- Organization and opportunity relationship queries must remain within workspace boundary.

### 7.2 Security and Privacy

- Role-based access checks on each mutating endpoint.
- Django Admin is not part of the tenant-facing product surface and must remain restricted to system administrators.
- MCP server endpoints/tools must require authenticated user context and workspace-scoped authorization.
- 2FA is mandatory for all interactive logins (tenant-facing users and system administrators).
- MCP access tokens can only be issued after a successful login session that has completed 2FA verification.
- Encrypted secrets/config in Render environment variables.
- Protect personal contact data and conversation history.
- Recording links and transcript artifacts are treated as sensitive interview data and must follow tenant isolation and access policy.

### 7.3 Reliability

- Basic activity/event log for critical actions:
  - stage changes
  - assignments
  - resume version updates
  - reply suggestion actions
- Async import/render jobs must expose observable status and timestamps for each transition.
- Idempotency is required for mutating MCP/API operations that can be retried by clients.

### 7.4 Usability

- Opportunity-centric dashboard with quick visibility into:
  - next interview step
  - overdue actions
  - recent messages awaiting response
  - resume tailoring status
- Compensation comparison view in dashboard:
  - shows original opportunity currency and period
  - shows converted values in user-selected currencies
  - defaults to `USD` and `BRL` display currencies for new users

### 7.5 Feature Access Strategy (Global + Tenant)

- Feature availability for paid capabilities must be tenant-scoped through workspace entitlements (source of truth for billing and plan enforcement).
- Global operational controls should use feature flags (`django-waffle`) for rollout, beta gating, and emergency kill switches.
- Authorization for premium features should evaluate in this order:
  1. Global flag state (enabled/disabled)
  2. Workspace entitlement (paid plan/add-on access)
  3. User permission within workspace role policy
- Example premium capabilities for entitlement checks:
  - AI reply suggestions
  - LinkedIn integration
  - interview transcript coaching insights

### 7.6 Authentication and Token Lifecycle

- Authentication baseline:
  - Django-based auth with mandatory second factor in all environments (except explicit local development bypass, if enabled).
  - Django Admin login requires the same mandatory 2FA policy.
- MCP token issuance:
  - User authenticates with username/password + 2FA.
  - User requests MCP token from a token-issuance endpoint tied to the verified session.
  - Issued token is user-bound, workspace-aware, and short-lived.
- Token safety controls:
  - support token expiry, revocation, and rotation
  - store only hashed token fingerprints at rest
  - log issuance/revocation/use events for auditability
- Authorization remains server-side on every MCP call (token presence never bypasses workspace role/entitlement checks).

## 8) Validation and Error Handling

- Validate required fields for opportunity creation and interview step updates.
- Validate hiring context rules:
  - end client organization is required for each opportunity
  - intermediary organization is optional and cannot equal end client in the same opportunity
- Validate compensation normalization rules:
  - `compensation_currency` must be a valid ISO currency code
  - `compensation_period` must be one of `hour`, `month`, or `year`
  - `compensation_min` must be <= `compensation_max` when both are provided
  - `pto_days` and `sick_days` must be non-negative integers
- Validate user currency preferences:
  - each preferred currency must be a valid ISO code
  - empty preference list falls back to default (`USD`, `BRL`)
- Enforce consistent cycle transitions (with explicit override path when needed).
- Validate channel types for messages.
- AI suggestion endpoint returns actionable errors when context is missing.
- Validate JSON Resume payload structure before import persistence.
- Validate LinkedIn PDF uploads for type/size and parser eligibility before job execution.
- Return confidence and missing-data warnings after PDF extraction when human review is required.
- Validate requested theme id against supported JSON Resume theme allowlist.
- Validate recording URLs against allowed schemes/providers.
- Validate transcript upload format/size and fail with actionable parser diagnostics when unsupported.
- Preserve operation safety: no hard deletes for core records in MVP unless explicitly required.

## 9) Testing Strategy (MVP)

- Unit tests:
  - requirement parsing/validation
  - interview cycle transition rules
  - permission checks by role
  - suggestion generation adapter behavior
  - resume import normalization (JSON and LinkedIn PDF extracted structures)
  - render theme selection and allowlist validation
  - import confidence threshold decisions (`completed` vs `needs_review`)
  - transcript parsing and normalization across supported subtitle/text formats
  - cross-process feedback clustering and recommendation ranking behavior
- Integration tests:
  - create opportunity -> define cycle -> assign contacts -> log messages -> generate draft -> create resume version
  - upload JSON Resume -> normalize -> create/update `ResumeVersion` -> render theme artifact
  - upload LinkedIn PDF -> extract -> review required path -> finalize resume version
  - attach recording URL + upload transcript -> generate interview coaching insights
  - import pasted historical messages -> confirm extracted loss outcome -> reuse insights in new process
- Smoke e2e:
  - core dashboard flow for one opportunity from creation to interview progression

## 10) Deployment Target

- Deploy on Render with the following service layout:
  - `web`: Django app (API and admin)
  - `frontend`: React app
  - `worker`: Celery background worker
  - `beat`: Celery scheduler for recurring jobs
  - `redis`: broker/result backend for Celery
  - `db`: PostgreSQL primary database
- Environment strategy:
  - `staging` deploy is automatic after merge to main integration branch via GitHub Actions.
  - `production` deploy is manual via GitHub Actions `workflow_dispatch`.
  - Render deploys are triggered from CI using Render deploy hooks or Render API.
- Environment-specific configuration via secure env vars.
- Baseline observability with logs and error tracking suitable for MVP operations.

## 11) Explicit Out of Scope for MVP 1.0

- Automated submission of resumes on external job sites.
- Automatic ingestion from email/LinkedIn APIs.
- Autonomous sending of recruiter replies.
- Advanced recommendation analytics beyond basic requirement coverage.

## 12) Future Extensions (Post-MVP)

- Channel integrations for message ingestion and sync.
- Semi-automated workflow nudges and SLA reminders.
- Submission automation (Playwright or equivalent) with user-defined safeguards.
- Analytics dashboards for funnel conversion and response effectiveness.

## 13) Acceptance Criteria for MVP

- User can manage opportunities with custom interview cycles per opportunity.
- User can model hiring context per opportunity (end client + optional intermediary + employment model).
- User can store compensation in the source currency provided for each opportunity (including non-default currencies like `EUR`).
- User can compare opportunity compensation in dashboard using online FX conversion with default display in `USD` and `BRL`.
- User can customize which currencies are shown in dashboard comparisons.
- User can register and reuse people across opportunities and interview steps.
- User can manually log email/LinkedIn conversations and see timelines.
- User can attach interview recording links and upload transcripts for interview steps.
- User can generate AI drafts for replies and edit before sending externally.
- User can generate coaching insights from interview transcripts and prior loss feedback.
- User can store and analyze lost process outcomes, including historical imports from pasted email/LinkedIn content.
- User can manage base JSON Resume + opportunity-tailored resume versions.
- User can edit resume content through structured section/item entities and generate JSON Resume output.
- User can upload a complete JSON Resume for a specific opportunity.
- User can upload a LinkedIn PDF export and obtain a generated resume version.
- User can render resume output with supported JSON Resume themes.
- User can inspect requirement coverage and identified gaps for each opportunity.
- User can execute core pipeline actions through MCP tools with equivalent workspace and role restrictions.
- MCP token issuance requires successful 2FA-authenticated login.
- Django Admin access is limited to system administrators and also protected by mandatory 2FA.
- Multi-tenant boundaries and role checks are enforced for all core operations.

## 14) Application Specification (Pre-Implementation)

### 14.1 Django App Modules

- `apps.identity`
  - `Workspace`, `Membership`, MCP token issuance, 2FA enforcement, user currency preferences.
- `apps.organizations`
  - `Organization` registry and hiring-context lookup support.
- `apps.opportunities`
  - `Opportunity`, `OpportunityRequirement`, interview cycle/steps, hiring context, compensation fields.
- `apps.people`
  - `Person` registry and role-tagging.
- `apps.conversations`
  - `ConversationThread`, `Message`, historical pasted-content ingestion entry points.
- `apps.interview_learning`
  - interview artifacts/transcripts, outcomes, retrospectives, historical import jobs, insight generation orchestration.
- `apps.resumes`
  - base resume, resume versions/sections/items/evidence, import jobs, renders, theme rendering.
- `apps.billing`
  - workspace entitlements and feature access policy inputs.
- `apps.fx`
  - FX quote snapshots and currency conversion provider adapters.
- `apps.audit`
  - centralized audit event logging and query utilities.

### 14.2 Model-Level Specification (Django ORM Baseline)

- **Shared mixins**
  - `WorkspaceScopedModel`: `workspace`, `created_at`, `updated_at`, `created_by`, optional `updated_by`.
  - `SoftDeleteModel` (where applicable): `deleted_at`, `deleted_by`.
- **Opportunity model**
  - include hiring context (`end_client_organization`, `intermediary_organization`, `employment_model`).
  - include compensation comparison fields (`compensation_currency`, `compensation_period`, `compensation_min`, `compensation_max`, `pto_days`, `sick_days`).
  - DB check constraints:
    - `compensation_min <= compensation_max` when both present.
    - `end_client_organization_id != intermediary_organization_id` when intermediary set.
- **UserCurrencyPreference model**
  - fields: `user`, `workspace`, `preferred_currencies` (json/text array).
  - default: `["USD", "BRL"]`.
  - unique constraint on (`user`, `workspace`).
- **FxQuoteSnapshot model**
  - fields: `base_currency`, `quote_currency`, `rate`, `rate_type`, `provider`, `fetched_at`, `expires_at`.
  - composite index: (`base_currency`, `quote_currency`, `rate_type`, `fetched_at desc`).
- **Async job models**
  - `ResumeImportJob`, `HistoricalProcessImportJob`, `ResumeRender` must store:
    - `status`, `error_code`, `error_message`, `retry_count`, `started_at`, `completed_at`.
  - expose deterministic state transition methods in model/service layer.

### 14.3 API Layer (HTTP Views / DRF ViewSets)

- **API style**
  - Django REST Framework with `ViewSet` + serializer pattern.
  - one workspace resolver middleware/dependency to set active workspace context.
- **Core ViewSets**
  - `OpportunityViewSet`: list/create/retrieve/update/archive.
  - `OpportunityHiringContextAction`: set end-client/intermediary/employment model.
  - `OrganizationViewSet`: list/create/update for registry.
  - `InterviewStepViewSet`: manage cycle steps and assignments.
  - `InterviewArtifactViewSet`: add/list recording links.
  - `InterviewTranscriptViewSet`: upload/list transcript assets.
  - `ProcessOutcomeViewSet`: set/update process outcome.
  - `ProcessRetrospectiveViewSet`: create/list coaching retrospectives.
  - `ResumeVersionViewSet`: CRUD for resume versions and structured editor data.
  - `ResumeImportViewSet`: JSON/PDF import endpoints.
  - `ResumeRenderViewSet`: trigger render and fetch artifacts.
  - `CurrencyPreferenceViewSet`: get/set dashboard display currencies.
  - `FxQuoteViewSet`: list latest quotes used in dashboard conversion.
- **Permissions**
  - enforce role checks with custom permission classes:
    - read: `Owner`, `Member`, `Viewer`
    - mutate: `Owner`, `Member`
    - administrative operations: `Owner` (workspace scope) or system admin when global.

### 14.4 MCP Controller Layer

- **Design**
  - MCP tools call thin controllers that delegate to the same application services used by HTTP views.
  - no MCP-only business logic; parity is enforced in service layer.
- **Controller mapping**
  - `opportunity.*`, `organization.*`, `pipeline.*` -> `OpportunityApplicationService`
  - `interview.*`, `process.*` -> `InterviewLearningApplicationService`
  - `resume.*` -> `ResumeApplicationService`
  - `user.currency_preferences.*`, `fx.quotes.get` -> `CurrencyApplicationService`
- **MCP request pipeline**
  - authenticate token -> resolve workspace -> authorize role -> validate payload -> execute service -> map typed response/error.
- **Error contract**
  - standard error mapping for: `validation_error`, `forbidden_workspace`, `insufficient_role`, `invalid_state_transition`, `rate_unavailable`.

### 14.5 Application Services (Use-Case Boundary)

- `OpportunityApplicationService`
  - create/update opportunity, set hiring context, update compensation metadata, compare normalized compensation.
- `InterviewLearningApplicationService`
  - attach recording links, register transcript uploads, generate insights, persist outcomes/retrospectives, run historical import confirmations.
- `ResumeApplicationService`
  - manage structured editor entities, import JSON/PDF, generate canonical JSON Resume snapshots, trigger themed render jobs.
- `CurrencyApplicationService`
  - get/set user display preferences, fetch/cached FX quotes, compute dashboard conversion payloads.
- `AuthApplicationService`
  - 2FA-gated login/session checks and MCP token issuance/revocation.

### 14.6 Celery Tasks and Queues

- **Queues**
  - `imports`: resume and historical process ingestion.
  - `render`: JSON Resume themed render tasks.
  - `insights`: transcript analysis and coaching synthesis.
  - `fx`: periodic FX quote refresh jobs.
- **Task contracts**
  - idempotent task signatures with explicit entity IDs and workspace IDs.
  - retry policy per task type (bounded retries + exponential backoff).
  - all terminal outcomes persist status/error and emit audit events.
- **Beat schedules**
  - FX quote refresh (high frequency for dashboard freshness).
  - stale-job watchdog for stuck `processing` jobs.

### 14.7 Query/Read Models for Dashboard

- `OpportunityDashboardReadModel` (materialized query or optimized SQL view):
  - opportunity summary, next step, status, hiring context, source compensation, converted compensation for preferred currencies, quick warning flags.
- `InterviewCoachingReadModel`:
  - latest insight cards, recurring weaknesses, linked evidence snippets.
- `ResumeProgressReadModel`:
  - requirement coverage, latest render status, latest import status.

### 14.8 Observability and Operational Specs

- structured logs include: `workspace_id`, `user_id`, `request_id`, `tool_name` (for MCP), `service_name`, latency.
- metrics:
  - MCP tool success/error rates
  - async job success/failure/retry counts
  - FX quote freshness lag
  - transcript parse success rate by format.
- tracing:
  - one trace across HTTP/MCP entrypoint -> service -> async task enqueue.

### 14.9 Implementation Guardrails

- enforce workspace scoping at repository/query layer, not only controller layer.
- keep all domain transitions in services/domain methods; controllers remain orchestration-only.
- avoid direct model mutation in celery tasks without invoking domain transition methods.
- ensure tests exist for parity between HTTP and MCP behavior for the same use case.

### 14.10 React Design Specification Source

- Frontend visual/design system baseline must follow `DESIGN.md`.
- `DESIGN.md` is authored from the Design.md framework reference: [https://getdesign.md/mintlify/design-md](https://getdesign.md/mintlify/design-md)
- Implementation guidance:
  - convert `DESIGN.md` tokens into code-level design tokens (colors, radius, spacing, typography).
  - expose tokens in a shared frontend theme module (`tokens.ts` / CSS variables).
  - enforce component consistency through a reusable UI primitives layer (buttons, cards, inputs, badges, layout containers).
  - keep accessibility requirements aligned with the design spec (contrast, focus states, keyboard flow).

### 14.11 Development Workflow and CI/CD Specification

- Local developer environment:
  - project must run fully local using an isolated environment (`virtualenv`, `uv`, or equivalent).
  - standard local commands must include lint, unit tests, and end-to-end tests (Playwright).
  - provide a single bootstrap path for first run (install deps, create env file template, run migrations, start services).
- Required local quality gates:
  - backend lint + type checks (if enabled) + unit tests.
  - frontend lint + unit/component tests.
  - Playwright e2e against local stack.
- Git workflow:
  - feature work happens in isolated branches/worktrees.
  - merges to integration branch trigger full CI and staging deployment.
- GitHub Actions pipelines:
  - `ci.yml` on pull requests: lint + unit tests + e2e (or required e2e subset).
  - `deploy-staging.yml` on merge to main: deploy staging services on Render automatically.
  - `deploy-production.yml` manual trigger (`workflow_dispatch`): deploy production on Render.
- Render deployment integration:
  - staging and production use distinct Render services/environments.
  - CI uses Render deploy hooks or Render API with scoped secrets (`RENDER_STAGING_DEPLOY_HOOK`, `RENDER_PROD_DEPLOY_HOOK`).
  - production workflow supports optional approval gate before running deploy step.

### 14.12 CI Implementation Planning Baseline (Separate Plan Track)

- CI implementation must be planned and executed as a dedicated track, separate from feature/domain implementation plans.
- This spec section is the source-of-truth baseline for generating one or more standalone CI implementation plans.
- CI baseline plan structure:
  1. Define branch strategy, required checks, and workflow split.
  2. Standardize local commands (`lint`, unit tests, e2e) with CI parity.
  3. Implement `ci.yml` for pull-request validation.
  4. Implement `deploy-staging.yml` for automatic staging deploy on merge.
  5. Implement `deploy-production.yml` for manual production deploy (`workflow_dispatch`).
  6. Configure GitHub environments/secrets and approval gates.
  7. Add post-deploy health checks and failure diagnostics.
- Required workflow split:
  - `.github/workflows/ci.yml`
  - `.github/workflows/deploy-staging.yml`
  - `.github/workflows/deploy-production.yml`
- Execution order recommendation:
  - phase A: CI validation workflow only
  - phase B: staging auto-deploy
  - phase C: production manual deploy with approvals
- WorkTree execution model:
  - each major implementation plan (for example CI, backend domain, MCP server, frontend UI) should run in a separate git worktree.
  - each worktree produces focused commits and an isolated PR stream.
  - merge sequencing should preserve dependency order across plans.

