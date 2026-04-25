# Opportunity DRF API — Implementation Plan

**Date:** 2026-04-25
**Spec:** `docs/superpowers/specs/2026-04-25-opportunity-api-design.md`
**Branch:** `feat/opportunity-api`
**Worktree:** `.worktrees/feat-opportunity-api`
**Base:** `main` after PR #17 merge

Single-session execution. Strict TDD: write test first, then code, run `make -C backend test` after each task, expect green. Per-category test layout per PR #17.

## Task 1 — `archived_at` model field + migration + model test

**Files:**

- `backend/opportunities/models.py`: append `archived_at = models.DateTimeField(null=True, blank=True)`.
- `backend/opportunities/migrations/0002_opportunity_archived_at.py`: autogen via `python manage.py makemigrations opportunities`.
- `backend/opportunities/tests/models/opportunity_test.py`: append `test_archived_at_defaults_none` (creates an opportunity, asserts `archived_at is None`, sets it, saves, refresh_from_db, asserts persisted).

**Acceptance:** 64 tests pass (was 63 + 1).

**Commit:** `feat(backend): add archived_at to Opportunity for soft delete`

## Task 2 — `services.py` with `create_opportunity` + `archive_opportunity` + service tests

**Files:**

- `backend/opportunities/services.py`: two `@transaction.atomic` functions per spec.
- `backend/opportunities/tests/services/__init__.py`
- `backend/opportunities/tests/services/opportunity_test.py`: tests
  1. `test_create_opportunity_in_member_workspace` — happy path, returns persisted row with `created_by` stamped.
  2. `test_create_opportunity_rejects_non_member_workspace` — raises `PermissionError` (or our own `ServiceError`; spec is intent-based — pick `PermissionError` for stdlib clarity).
  3. `test_archive_opportunity_sets_archived_at_idempotently` — first call sets timestamp; second call doesn't bump it.

**Acceptance:** 67 tests pass.

**Commit:** `feat(backend): add Opportunity service layer (create + archive)`

## Task 3 — Permission class

**Files:**

- `backend/opportunities/permissions.py`: `IsWorkspaceMember` per spec. Uses `tenancy.permissions.get_membership` to look up the membership row for `(request.user, obj.workspace)`; viewers blocked from PATCH/DELETE.
- No standalone permission unit test — permission semantics are exercised by the API tests in Task 5. (Adding a separate unit test would mock everything the API tests already cover end-to-end.)

**Commit:** `feat(backend): add IsWorkspaceMember permission for opportunities`

## Task 4 — Serializer

**Files:**

- `backend/opportunities/serializers.py`: `OpportunitySerializer` per spec, including `validate_workspace` and the read-only `created_by` nested representation.
- No standalone serializer test; covered by API tests.

**Commit:** `feat(backend): add OpportunitySerializer with workspace validation`

## Task 5 — ViewSet + URL include + API tests

**Files:**

- `backend/opportunities/views.py`: `OpportunityViewSet` per spec.
- `backend/opportunities/urls.py`: DRF router registration.
- `backend/opportunities/filters.py`: `OpportunityFilterSet` (`stage`, `workspace`) plus the `?q=` SearchFilter wiring inside the viewset.
- `backend/config/urls.py`: add `path("api/opportunities/", include("opportunities.urls"))`.
- `backend/opportunities/tests/api/__init__.py`
- `backend/opportunities/tests/api/opportunity_test.py`: full DRF test matrix per spec (~12 cases). Use `APIClient` with `force_authenticate(user)`.

**Acceptance:** ~79 tests pass.

**Commit:** `feat(backend): expose Opportunity DRF API at /api/opportunities/`

## Task 6 — Admin tweak

**Files:**

- `backend/opportunities/admin.py`: add `archived_at` to `readonly_fields` and `list_filter` (`archived_at` becomes a "yes/no" filter).

No new test.

**Commit:** `chore(backend): surface archived_at in Opportunity admin`

## Task 7 — Final checks + PR

1. `make -C backend lint`.
2. `make -C backend test` — full suite green at ~79.
3. Rebase on `origin/main` (release commits land after each merge).
4. Push, open PR, fill `.github/WORKFLOW_TEMPLATES/pull_request.md`. Title: `feat(backend): expose Opportunity DRF API`.
5. Halt for Copilot review.

## Out of plan

- Frontend list view (PR H).
- Stage transition state machine.
- Hard-delete endpoint.
- Bulk endpoints.
- MCP tool wiring (Track 04).
- Pagination tuning, search ranking, full-text.
