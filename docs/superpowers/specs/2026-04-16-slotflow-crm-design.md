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
- Basic role-based access control:
  - `Owner`: full access
  - `Member`: create/update operational records
  - `Viewer`: read-only

All domain records are tenant-scoped and must enforce workspace isolation.

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
  - fields: company, title, source site, status, priority, deadlines, compensation notes, custom notes

- `OpportunityRequirement`
  - structured role requirements linked to one opportunity
  - categories: must-have, nice-to-have, years/seniority, tech stack, language, location/work model, domain requirements

- `InterviewCycle`
  - one custom cycle per opportunity

- `InterviewStep`
  - ordered customizable steps in the cycle
  - fields: type/name, status, assigned people, target dates, outcomes, notes

- `ConversationThread`
  - communication context, grouped by channel and relationship to opportunity/person

- `Message`
  - manual log entry in MVP
  - direction (inbound/outbound), channel (email/LinkedIn), timestamp, raw text, normalized text

- `BaseResume`
  - source JSON Resume profile

- `ResumeVersion`
  - opportunity-tailored resume variant derived from base profile

- `ResumeEvidenceMap`
  - links requirement(s) to resume bullet(s)/section(s) to explain tailoring choices

- `ReplySuggestion`
  - AI-generated response draft
  - includes metadata: tone/style, source context summary, accepted/edited status

## 5) Functional Requirements

### 5.1 Opportunity and Pipeline Management

- Create, update, archive opportunities.
- Define a custom interview cycle for each opportunity.
- Add, reorder, and update interview steps.
- Assign one or more `Person` records to each step.
- Track step status and outcomes with timestamps and notes.

### 5.2 People and Contact Registry

- Create and manage generic `Person` records.
- Support multiple role tags per person.
- Store contact channels (email, LinkedIn, phone) and free-form notes.
- Link people to opportunities, interview steps, and conversation threads.

### 5.3 Conversation Tracking (MVP Input Mode)

- Manual message entry for email and LinkedIn.
- Keep message timeline per thread and opportunity context.
- Support inbound and outbound direction tagging.
- Preserve audit history (soft-delete/archive behavior preferred).

### 5.4 AI-Assisted Replies (Human Review)

- Generate draft replies from selected thread context.
- Use opportunity requirements and current pipeline state as context.
- No automatic sending in MVP.
- User can accept/edit/reject drafts.

### 5.5 Resume Tailoring

- Store base resume as JSON Resume.
- Create opportunity-specific resume variants.
- Show requirement coverage and gaps.
- Store rationale mapping between requirements and selected resume evidence.

## 6) Data Flow (Primary Journey)

1. User creates `Opportunity`.
2. User captures structured `OpportunityRequirement` data.
3. User defines custom `InterviewCycle` and `InterviewStep` sequence.
4. User links `Person` contacts and assigns them to steps.
5. User logs messages manually for email/LinkedIn.
6. User requests an AI `ReplySuggestion` based on thread + opportunity context.
7. User updates or creates `ResumeVersion` for the opportunity and reviews requirement coverage.
8. User advances pipeline as interviews progress.

## 7) Non-Functional Requirements

### 7.1 Multi-Tenant Safety

- Every query must be workspace-scoped.
- Prevent cross-tenant reads/writes at service and persistence layers.
- Include tenant context in audit events.

### 7.2 Security and Privacy

- Role-based access checks on each mutating endpoint.
- Encrypted secrets/config in Render environment variables.
- Protect personal contact data and conversation history.

### 7.3 Reliability

- Basic activity/event log for critical actions:
  - stage changes
  - assignments
  - resume version updates
  - reply suggestion actions

### 7.4 Usability

- Opportunity-centric dashboard with quick visibility into:
  - next interview step
  - overdue actions
  - recent messages awaiting response
  - resume tailoring status

## 8) Validation and Error Handling

- Validate required fields for opportunity creation and interview step updates.
- Enforce consistent cycle transitions (with explicit override path when needed).
- Validate channel types for messages.
- AI suggestion endpoint returns actionable errors when context is missing.
- Preserve operation safety: no hard deletes for core records in MVP unless explicitly required.

## 9) Testing Strategy (MVP)

- Unit tests:
  - requirement parsing/validation
  - interview cycle transition rules
  - permission checks by role
  - suggestion generation adapter behavior

- Integration tests:
  - create opportunity -> define cycle -> assign contacts -> log messages -> generate draft -> create resume version

- Smoke e2e:
  - core dashboard flow for one opportunity from creation to interview progression

## 10) Deployment Target

- Deploy on Render (`web` + `db` services as needed by selected stack).
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
- User can register and reuse people across opportunities and interview steps.
- User can manually log email/LinkedIn conversations and see timelines.
- User can generate AI drafts for replies and edit before sending externally.
- User can manage base JSON Resume + opportunity-tailored resume versions.
- User can inspect requirement coverage and identified gaps for each opportunity.
- Multi-tenant boundaries and role checks are enforced for all core operations.
