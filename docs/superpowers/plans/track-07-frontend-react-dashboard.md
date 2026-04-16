# Track 07: Frontend React Dashboard

Status: Draft (awaiting approval)  
Spec reference: `docs/superpowers/specs/2026-04-16-slotflow-crm-design.md`  
Design reference: `DESIGN.md` (Mintlify-inspired tokens)  
Execution mode: isolated worktree (`.worktrees/track-07-frontend-react-dashboard`)

## 1) Objectives

- Deliver the tenant-facing React UI for MVP workflows:
  - opportunity-centric dashboard
  - pipeline and interview step management
  - people and conversation timelines (manual input mode)
  - resume structured editor + import/render status UX
  - interview recordings/transcripts + coaching review surfaces (minimal viable UX)
  - compensation comparison with FX display currencies (user preferences)
- Implement the design system baseline from `DESIGN.md` as code-level tokens and primitives.

## 2) Constraints and Decisions

- Latest stable toolchain at implementation time:
  - Node.js LTS (or latest stable if explicitly chosen in PR)
  - React latest stable compatible with chosen bundler
- Prefer TypeScript for the frontend.
- The frontend must treat the Django API as the system of record (no local authoritative domain state).
- All screens must respect workspace scoping and role-based UX (hide/disable actions consistently with backend rules).

## 3) Deliverables

- React app scaffold (recommended: Vite + React + TS).
- Routing and layout:
  - authenticated app shell
  - workspace switcher
  - role-aware navigation
- API client layer:
  - typed client with interceptors
  - error normalization to user-visible messages
  - idempotency key helper for mutating requests
- State management:
  - server state via TanStack Query (recommended)
  - minimal client state (workspace selection, UI preferences)
- Design system implementation:
  - `tokens` module derived from `DESIGN.md` (colors, radii, typography, spacing)
  - primitives: `Button`, `Card`, `Input`, `Badge`, `Modal`, `Toast`, `Table`, `Tabs`
- Feature modules (folders):
  - `opportunities/`
  - `organizations/`
  - `people/`
  - `conversations/`
  - `interviews/`
  - `resumes/`
  - `settings/` (currency preferences)
- Testing:
  - Vitest + Testing Library for components and hooks
  - Playwright e2e for core dashboard journey (align with Track 01 CI)

## 4) Authentication UX (2FA)

- Implement login + 2FA verification flow matching backend requirements.
- Session handling:
  - cookie/session strategy as defined by Django (CSRF-aware requests)
  - clear “2FA required” gating before accessing app routes
- MCP token management UI is optional in MVP; if omitted, document deferral explicitly in PR.

## 5) Core Screens (MVP)

### A) Opportunity Dashboard

- List opportunities with filters (status, next step, overdue indicators).
- Opportunity detail:
  - hiring context summary (end client + optional intermediary + employment model)
  - compensation display:
    - show source currency + period
    - show converted values for user-selected currencies
    - show FX rate metadata (official/parallel when available)
  - pipeline summary (current step, step list)

### B) Interview Steps

- Step list with statuses, assignments, dates, notes.
- Recording link capture UI.
- Transcript upload UI + processing status polling.

### C) Conversations

- Thread list and message timeline.
- Manual message logging (email/LinkedIn) with direction/channel.

### D) Resume

- Structured editor for sections/items (integrated with backend editor endpoints).
- Import status UI for JSON/PDF jobs (`needs_review` highlighted).
- Theme selection + render job status + download/preview entrypoints.

### E) Coaching / Retrospectives (Minimal)

- Display generated insights and allow user to save/edit retrospective notes.
- Historical import paste flow with review/confirm step.

## 6) FX and Currency Preferences UX

- Settings screen:
  - select display currencies (default USD+BRL)
  - show last-updated quote timestamp and provider/rate type labels
- Dashboard computations:
  - client may compute display conversions using quotes from API, but must not invent rates locally without server data

## 7) Accessibility and Quality Bar

- Keyboard navigability for primary flows.
- Focus states aligned with brand green focus ring from `DESIGN.md`.
- Basic responsive behavior for dashboard tables/cards.

## 8) Integration Contract with Backend

- The frontend consumes DRF endpoints delivered by parallel tracks; this track may introduce:
  - OpenAPI-derived types (optional) or hand-written Zod schemas
- Strict rule:
  - any new endpoint requirement must be negotiated as a small backend follow-up PR unless already in spec.

## 9) Testing Strategy

- Unit/component tests:
  - token/theme components
  - formatting utilities (currency, dates)
  - workspace guard wrappers
- E2E tests:
  - login + 2FA stub strategy (documented)
  - create opportunity -> set hiring context -> view dashboard conversion row
  - upload transcript -> poll status -> view normalized preview (smoke)

## 10) Risks and Mitigations

- CSRF/session friction:
  - Mitigation: standardize API client CSRF header behavior early.
- FX display mismatch vs server:
  - Mitigation: render exact server-provided converted values when available; client-side conversion only as fallback if explicitly supported by API.
- Large tables performance:
  - Mitigation: pagination/virtualization in later iteration; MVP uses simple pagination.

## 11) Out of Scope for Track 07

- MCP server implementation (Track 04)
- deep backend job implementations beyond consuming APIs (Tracks 05/06)
- polished marketing site

## 12) Approval Gate

Approval of this track authorizes:
- creating dedicated worktree for frontend implementation,
- scaffolding the React app and delivering MVP screens with design system baseline,
- opening focused PRs limited to frontend concerns and API consumption contracts.
