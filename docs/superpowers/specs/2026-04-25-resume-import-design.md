# Resume JSON Import — Full Slice (BE + FE + e2e)

**Date:** 2026-04-25
**Status:** Approved
**Scope:** Track 05 first slice. Add a JSON importer that creates a new `ResumeVersion` under an existing `BaseResume` from a raw JSON Resume document. Available as both a management command (for ops) and a DRF endpoint (for the dashboard).

## Goal

Cut the friction of pasting raw JSON in a textarea: let the user upload a `.json` file (or paste a body) and have the backend create a new version against the chosen base resume, with the same auditable trail as a manual create.

## Non-goals

- LinkedIn PDF / Markdown / DOCX import — separate later track.
- Schema validation against the JSON Resume spec — accept any JSON object; existing append-only contract stays.
- Multi-file batch import — one file per request.
- Importing into a brand-new base resume — caller must pre-create the base.

## Architecture

### Backend (`backend/resumes/`)

**Service layer (`services.py`)**

- `import_resume_json(*, actor, base_resume, document, notes="") -> ResumeVersion`. Thin wrapper around the existing `create_resume_version` that emits a separate audit action (`resume_version.imported`) so ops can distinguish manual creates from imports. Uses `import` as the audit-event metadata source, otherwise identical (membership / role gates / `select_for_update` on the parent / sha256 hash).

The wrapper exists rather than overloading `create_resume_version` so audit trails clearly identify provenance — ops dashboards can filter "who imported what when" without crawling the create-versions stream.

**Management command (`resumes/management/commands/import_resume_json.py`)**

`./manage.py import_resume_json <base_resume_uuid> <path-or-->`. Reads the path (or stdin when `-`) as JSON, calls `import_resume_json` with `actor=None` (system-imported). Prints the created `version_number`. Exits non-zero on validation error.

**DRF endpoint (`resumes/views.py`)**

Add `import_version` action to `ResumeVersionViewSet`:
- `POST /api/resumes/<base_resume_id>/versions/import/`
- Accepts JSON body `{"document": <object>, "notes": ""}` or `multipart/form-data` with a `file` part containing the JSON.
- Multipart path reads the file's bytes, decodes UTF-8, parses JSON. Errors surface as 400 with descriptive messages.
- The action delegates to `import_resume_json` with `actor=request.user`.

URL: an explicit `path("<base_resume_id>/versions/import/", ...)` entry in `resumes/urls.py` mounts the action under the existing nested URL layout (the action lives on `ResumeVersionViewSet` but the surrounding routes are wired by hand, not via the DRF router default).

**Audit:** `resume_version.imported` with metadata `{base_resume_id, version_number, document_hash, source: "api"|"command"}`.

**Tests:**
- `tests/services/import_test.py`: happy / non-member / viewer / cross-workspace base / sha256 matches `create_resume_version` for identical input.
- `tests/api/import_test.py`: anon 401/403; JSON-body happy path; multipart-file happy path; invalid JSON 400; non-object document 400; cycle-membership permission tests; auditing.
- `tests/services/import_command_test.py`: management command path with file argv and stdin (`-`).

### Frontend (`frontend/src/`)

**Hooks (`lib/resumesHooks.ts`)**

Add `useImportResumeVersion(baseId)` — POST to `/api/resumes/<baseId>/versions/import/`. The shipped hook is file-only: `mutate({ file, notes? })` constructs a `FormData` with `file` and optional `notes` and posts as `multipart/form-data` (the browser supplies the multipart Content-Type; `apiFetch` skips its default JSON header for non-string bodies).

The endpoint also accepts a JSON body shape (`{ document, notes? }`) for non-browser callers (CLI, future scripts), but the dashboard uses the file path; a unified `{ source }` signature wasn't needed and was dropped.

Cache invalidations match `useCreateResumeVersion`.

**Screen update (`screens/ResumeDetail.tsx`)**

Add an "Import JSON" button next to "New version". Clicking opens an import form (toggled like the new-version form):
- File picker (`<input type="file" accept="application/json">`).
- Notes input.
- "Import" button → submits.
- Inline error if backend rejects.

Empty file selection blocks the submit client-side with a friendly message; non-JSON files fail server-side and the inline error surfaces the message via the new `extractErrorMessage` path.

**TestIds:** new ids for the import form. Mirror to `e2e/support/selectors.ts`.

**Frontend tests (Vitest):** import form happy path (file submit), missing-file guard, server error rendering.

### E2E (`e2e/tests/resume_import.spec.ts`)

Signed-in seeded e2e user:

1. Reset → login.
2. Create a base resume + first version (UI).
3. Click "Import JSON" → upload a small JSON file → submit.
4. Versions list now shows v2 (newest first).

Use Playwright's `setInputFiles` to attach a fixture file from `e2e/fixtures/resume-sample.json`.

## Test plan

- Backend pytest gains ~12 cases (~5 service, ~6 API, 1 command). 312 → ~324.
- Frontend vitest gains ~3 cases. 140 → ~143.
- E2E gains 1 spec.

## Risk & rollback

- New service + endpoint + management command. No schema changes.
- Reverting removes the new endpoint; existing version-create endpoint is unaffected.
- Multipart parsing: cap upload size implicitly via Django's `DATA_UPLOAD_MAX_MEMORY_SIZE` default (~2.5 MiB); JSON resumes are typically <100 KiB so this is fine.

## Out of scope reminders

- No PDF / Markdown / DOCX importers.
- No JSON Resume schema validation (Track 05 follow-up).
- No bulk multi-file import.
