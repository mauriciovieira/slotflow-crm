# Resume HTML Render — Full Slice (BE + FE + e2e)

**Date:** 2026-04-25
**Status:** Approved
**Scope:** Track 05 second slice. Render a `ResumeVersion`'s JSON document into HTML via a Django template, exposed both as a management command and a DRF endpoint. New "View HTML" button on each version row opens the rendering in a new tab.

## Goal

Take what's already a structured CV (the JSON document on `ResumeVersion`) and produce a presentable HTML view — the first concrete output. Foundation for later PDF / theme work without requiring it now.

## Non-goals

- PDF / DOCX rendering — separate later track.
- Theme picker — single template for now.
- Custom CSS uploads — inline styles in the template.
- Server-side caching of rendered output — re-render on each request (template render is cheap).
- LinkedIn-style avatars / images — text-only output.

## Architecture

### Backend (`backend/resumes/`)

**Service layer (`services.py`)**

- `render_resume_version_html(*, actor, version) -> str`. Membership check on `version.base_resume.workspace` (read-role allowed; viewers can render). Loads `resumes/render/default.html` template with `{ "document": version.document, "version": version }` context. Returns the rendered HTML string. Audit `resume_version.rendered` with `{base_resume_id, version_id, version_number}`.

**Template (`backend/resumes/templates/resumes/render/default.html`)**

Minimal HTML5 document. Renders top-level fields from the JSON Resume schema:
- `basics.name` (h1)
- `basics.label` (subtitle)
- `basics.email` / `basics.phone` (contact line)
- `basics.summary` (paragraph)
- `work[]` — list of `{position} at {company}` with `startDate`/`endDate` and `summary`.
- `education[]` — list of `{studyType} in {area}, {institution}`.
- `skills[]` — comma-separated `{name}`.

Relies on Django's default auto-escape (no explicit `{% load %}` tag) so any user-supplied JSON value renders as text, never markup. Inline `<style>` for basic typography.

**Management command (`resumes/management/commands/render_resume_html.py`)**

`./manage.py render_resume_html <version_uuid> [--out PATH]`. Loads version, renders HTML, writes to `--out` (or stdout). Catches missing version / archived base resume / invalid UUID via `CommandError`.

**DRF endpoint (`resumes/views.py`)**

Add `render_html` action to `ResumeVersionViewSet`:
- `GET /api/resumes/<base_resume_id>/versions/<version_id>/render/`
- Returns the rendered HTML as `text/html` (not JSON). Cache-Control: `no-store` (don't cache personal data in shared caches).
- Membership-only (read role allowed); viewers can render.

URL: explicit `path("<base_resume_id>/versions/<version_id>/render/", ...)` in `resumes/urls.py`, mirroring how `import` is mounted.

**Audit:** `resume_version.rendered` with `{base_resume_id, version_id, version_number, source: "api"|"command"}`.

**Tests:**
- `tests/services/render_test.py`: happy path; non-member denies; output contains `basics.name`; missing fields don't crash; audit row written.
- `tests/api/render_test.py`: anon 401/403; happy path returns 200 + `text/html`; cross-workspace 404; viewer 200 (read role); audit recorded.
- `tests/services/render_command_test.py`: command writes to stdout / `--out` file; rejects missing UUID; rejects invalid UUID.

### Frontend (`frontend/src/`)

**Hook (`lib/resumesHooks.ts`)**

Add `versionRenderUrl(baseId, versionId)` helper that returns the path string. No mutation hook needed — render is GET-only and viewed in a new tab; React Query won't manage it.

**Screen update (`screens/ResumeDetail.tsx`)**

Each version row gains a "View HTML" link (`<a target="_blank" rel="noopener noreferrer" href={versionRenderUrl(...)}>`) that opens the rendered HTML in a new tab. Rendered alongside the existing v-number / notes / created-at metadata.

**TestIds:** `RESUME_DETAIL_VERSION_RENDER_LINK` (per-version-id suffix). Mirror to `e2e/support/selectors.ts`.

**Frontend tests (Vitest):** version row renders the link with the expected `href`, `target="_blank"`, and `rel="noopener noreferrer"`.

### E2E (`e2e/tests/resume_render.spec.ts`)

Signed-in seeded e2e user:

1. Reset → login (via `loginAsE2EUser` helper).
2. Create resume + version with a known `basics.name`.
3. Click "View HTML" on the version row.
4. Switch to the new tab.
5. Assert the page contains the candidate name from the JSON document.

Use `context.waitForEvent("page")` to grab the new tab spawned by the `target="_blank"` link.

## Test plan

- Backend pytest gains ~19 cases (8 service, 6 api, 5 command). Final totals on this branch: 334 → 360.
- Frontend vitest gains 1 case. 144 → 145.
- E2E gains 1 spec.

## Risk & rollback

- Single new template + service + endpoint + command. No schema changes.
- Reverting removes the new endpoint + button; nothing else depends on it.
- Performance: each render parses + renders a small template against a JSON dict. Sub-millisecond per call. No need for caching at this scale.
- Security: HTML rendered server-side with Django auto-escape; no untrusted JS execution. `Cache-Control: no-store` keeps personal data out of shared caches.

## Out of scope reminders

- No PDF.
- No themes.
- No CSS overrides.
