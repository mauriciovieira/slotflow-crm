# Opportunity Model — Implementation Plan

**Date:** 2026-04-24
**Spec:** `docs/superpowers/specs/2026-04-24-opportunity-model-design.md`
**Branch:** `feat/opportunity-model`
**Worktree:** `.worktrees/feat-opportunity-model`
**Base:** `main` at merge of PR #15

Small PR, all backend. Single-session execution. One commit per logical step; `make -C backend test` and `make -C backend lint` must pass before pushing.

## Task 1 — Model + `OpportunityStage`

**File:** `backend/opportunities/models.py` — implement the `Opportunity` model and `OpportunityStage` choices exactly as the spec describes (UUID pk, workspace FK, title/company/stage/notes/created_by, `__str__`, Meta with ordering + composite index).

**Commit:** `feat(backend): add Opportunity model with workspace FK and stage choices`

## Task 2 — Migration

Run `backend/.venv/bin/python backend/manage.py makemigrations opportunities` from the repo root. Expected file: `backend/opportunities/migrations/0001_initial.py`. Review it for:

- Correct `CreateModel` with all fields.
- Composite index on `(workspace, stage)`.
- No stray default migration noise.

**Commit:** `feat(backend): initial migration for opportunities app`

## Task 3 — Model tests (TDD-style: written alongside, kept in one commit for brevity)

**File:** `backend/tests/test_opportunity_model.py` — six tests per the spec:

1. `test_create_with_minimum_fields_uses_defaults`
2. `test_str_format`
3. `test_stage_choice_validated_by_full_clean`
4. `test_workspace_delete_cascades_to_opportunity`
5. `test_creator_delete_nullifies_created_by_and_preserves_row`
6. `test_default_ordering_is_newest_first`

Each creates its own workspace + user inline. Reuse the standard `pytest.mark.django_db` marker applied at module level (same pattern as `test_api_test_reset.py`).

`make -C backend test` must show +6 tests (57 → 63).

**Commit:** `test(backend): cover Opportunity model defaults, cascades, and ordering`

## Task 4 — Admin registration

**File:** `backend/opportunities/admin.py` — register `Opportunity` with `list_display`, `list_filter`, `search_fields`, and readonly timestamps per the spec. Tiny file. No test — admin wiring is low-value to unit-test; the gate is "import without error," which the test suite exercises via Django's app loading.

**Commit:** `feat(backend): register Opportunity in Django admin`

## Task 5 — Final checks + PR

1. `make -C backend lint` — ruff clean on touched files.
2. `make -C backend test` — 63/63 green.
3. `make -C frontend test` — untouched; sanity only.
4. **Rebase on latest main.** `git fetch origin --prune && git rebase origin/main`. The release workflow pushes version/changelog commits onto `main` after every merge, so the last-known `main` this branch was cut from is almost certainly stale. Re-run `make -C backend test` after the rebase to be safe.
5. Push branch, open PR against `main`. Fill `.github/WORKFLOW_TEMPLATES/pull_request.md`. Conventional Commits title: `feat(backend): add Opportunity model`.
6. Halt for Copilot review; address any comments per the existing PR #13/#14/#15 pattern.

## Out of plan

- DRF serializer, ViewSet, URL routing, permissions.
- Frontend changes (the stub panel at `/dashboard/opportunities` keeps rendering "Coming soon").
- Any other domain models (Resume, Interview) — separate PRs per Track 03.
- State-machine enforcement on stage transitions.
