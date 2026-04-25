# Resume — Full Slice (BE + FE + e2e)

**Date:** 2026-04-25
**Status:** Approved
**Scope:** First full-stack PR. Resume CRUD end to end: DRF API + dashboard UI list/detail/create + new-version flow + e2e walkthrough + audit wires. Mirrors what Opportunity got across PRs #16 → #22 but in a single PR.

## Goal

Replace the `/dashboard/resumes` stub with a real product surface: list workspace resumes, open one, see its versions, append a new version with raw JSON Resume, archive a base resume.

## Non-goals

- Rich JSON Resume editor (sections / items panels). The version form is a `<textarea>` for the canonical document — a structured editor lands later.
- Importers (JSON file upload, LinkedIn PDF) — Track 05 follow-ups.
- Render pipeline (HTML / PDF / themes) — Track 05 follow-up.
- Linking resume versions to opportunity / interview — separate later PR.
- `is_current` denormalised field — latest version is `max(version_number)`.
- Frontend TOTP-aware copy (the seeded e2e user already bypasses).

## Architecture

### Backend (`backend/resumes/`)

**Model change:** add `archived_at = DateTimeField(null=True, blank=True)` to `BaseResume` (same shape as `Opportunity.archived_at`). Migration `0002_baseresume_archived_at`. Default queryset filters archived rows out.

**Service layer (`services.py`):**

- `create_resume(*, actor, workspace, name) -> BaseResume`. Membership + write-role gate (mirrors `opportunities.services.create_opportunity`). Audit `resume.created`.
- `archive_resume(*, actor, base_resume) -> BaseResume`. `select_for_update` on the row, `archived_at = now()` if not already set, idempotent. Audit `resume.archived` (with `already_archived` flag).
- `create_resume_version(*, actor, base_resume, document, notes="") -> ResumeVersion`. Computes the next `version_number` inside `select_for_update` so concurrent appends don't collide. Computes `document_hash = sha256(json.dumps(document, sort_keys=True))`. Audit `resume_version.created` with metadata `{base_resume_id, version_number, document_hash}`.

**Permissions:** new `IsWorkspaceMember` clone in `resumes/permissions.py` — same shape as opportunities'. (Lift to `core/permissions.py` once a third domain needs it.)

**Serializers:**

- `ResumeVersionSerializer` — read-only on `id, version_number, document_hash, created_at, updated_at, created_by`; renders `created_by` via the same `get_created_by` shape as opportunities.
- `ResumeVersionCreateSerializer` — accepts `document` (JSON object) and optional `notes`.
- `BaseResumeSerializer` — full read shape including `latest_version: { version_number: int } | null`. Backed by a `Max("versions__version_number")` annotation on the viewset queryset so list endpoints stay flat in both query count and memory regardless of version-history depth. Detail consumers needing the full version object hit `/api/resumes/<id>/versions/`. Workspace is write-once on create.

**Views (`resumes/views.py`):**

- `BaseResumeViewSet(ModelViewSet)` at `/api/resumes/`:
  - GET (list, scoped to caller's memberships, `archived_at IS NULL`), POST (create), GET <uuid>, PATCH <uuid>, DELETE <uuid> (soft archive).
  - Filter `?workspace=<uuid>` (validated UUID, error mirroring opportunities).
- `ResumeVersionViewSet(GenericViewSet, ListModelMixin, CreateModelMixin, RetrieveModelMixin)` at `/api/resumes/<base_resume_id>/versions/`:
  - List the base resume's versions; create appends a new version via the service.

URL wiring under `backend/resumes/urls.py` registered from `backend/config/urls.py` at `/api/resumes/`.

**Audit:** wires sit in `services.py` per the established pattern (PR #27 / #28).

**Tests** (per-app per-category):
- `tests/models/base_resume_test.py`: `archived_at` defaults None; round-trip.
- `tests/services/resume_test.py`: create / archive / create_version success; non-member rejection; viewer rejection; idempotent archive; concurrent-version-bump uses `select_for_update` (single-call test asserts second call gets `version_number=2`); audit rows land for each action.
- `tests/api/resume_test.py`: anon 401/403; list scoped + excludes archived; create 201; create-cross-workspace 400/403; PATCH happy path; DELETE 204 + sets `archived_at`; viewer 403 on writes; version list returns rows in newest-version-first; version create accepts JSON object; archived `latest_version` field renders.

### Frontend (`frontend/src/`)

**Hooks (`lib/resumesHooks.ts`):**

- `useResumes()` — `GET /api/resumes/`.
- `useResume(id)` — `GET /api/resumes/<id>/`.
- `useResumeVersions(baseId)` — `GET /api/resumes/<baseId>/versions/`.
- `useCreateResume()` — POST.
- `useArchiveResume(id)` — DELETE.
- `useCreateResumeVersion(baseId)` — POST.

Cache invalidations follow the opportunities pattern.

**Screens:**

- `screens/ResumesList.tsx` — workspace's resumes (loading/error/empty/populated). "New resume" CTA links to `/dashboard/resumes/new`.
- `screens/ResumeCreate.tsx` — single-field form (`name`). On success → detail (`/dashboard/resumes/:resumeId`) so the user lands directly on the new-version composer.
- `screens/ResumeDetail.tsx` — shows the base resume name + a list of versions (newest first) + "New version" button + "Archive" inline confirm. The new-version flow shows a `<textarea>` accepting raw JSON; on submit the form parses + posts. Parse errors display inline.

**Routing:** swap the `resumes` slug from `<StubPanel />` to `<ResumesList />`. Add `resumes/new` and `resumes/:resumeId` siblings.

**Test ids:** mirror the opportunities-side naming. Mirror to `e2e/support/selectors.ts`.

**Frontend tests (Vitest):** list states, detail states, create-resume submit + redirect, version create + redirect, archive confirm + redirect.

### E2E (`e2e/tests/resumes.spec.ts`)

One spec, signed-in as the seeded e2e user:

1. Reset → login → land on dashboard.
2. Click Resumes nav → land on `/dashboard/resumes` empty state.
3. Click "New resume" → fill name → submit.
4. Detail loads with no versions yet.
5. Click "New version" → paste JSON `{"basics": {"name": "Alice"}}` → submit.
6. Version count = 1.
7. Click Archive → confirm → return to list with empty state.

This proves the BE↔FE↔auth wiring works in one click-through.

## Test plan

- Backend pytest gains ~25 cases (~7 service, ~14 API, ~2 model, audit assertions piggybacked on the API ones). 182 → ~207.
- Frontend vitest gains ~10 cases. 83 → ~93.
- E2E gains 1 spec. Total e2e suites still small.

## Risk & rollback

- One additive `archived_at` column on `BaseResume`. New URL surface, all gated by `IsAuthenticated` + `IsWorkspaceMember`.
- Frontend swaps a stub slug to a live route. Reversion is one merge revert.
- e2e test runs against the seeded workspace from `seed_e2e_user`; no schema work in CI.

## Out of scope reminders

- No DRF API change to opportunities.
- No structured Resume sections / items.
- No importer / renderer / theme work.
- No `OpportunityResume` link — comes after this lands.
