# Backend Test Layout — Implementation Plan

**Date:** 2026-04-25
**Spec:** `docs/superpowers/specs/2026-04-25-test-layout-design.md`
**Branch:** `refactor/test-layout`
**Worktree:** `.worktrees/refactor-test-layout`
**Base:** `main` after PR #16 merge

Mechanical refactor. One commit per logical step. After every step, `make -C backend test` must show 63/63 passing.

## Task 1 — Pytest config + conftest relocation

**Files:**

- `backend/pyproject.toml` — replace the `tool.pytest.ini_options` block with the spec's version (`testpaths = ["."]`, `python_files = ["*_test.py"]`, `norecursedirs` list).
- `backend/tests/conftest.py` → `backend/conftest.py` via `git mv`.

Verify: `make -C backend test` → 63 still pass (the lone existing `*_test.py` file is `opportunity_tests.py` won't match the new pattern yet — we'll rename it next; the historic `test_*.py` files no longer match either, so this step is expected to *temporarily* drop test discovery to zero). Reverse the order: do moves first, then config flip.

**Revised order:** move all files first (Tasks 2–11), then flip pytest config (Task 12). Keep this task description in place for the conftest move only.

This task is now: **move conftest only**. `git mv backend/tests/conftest.py backend/conftest.py`. Pytest's old config still finds `backend/tests/test_*.py`; conftest at root is also auto-loaded. Tests stay green.

**Commit:** `refactor(backend): hoist root conftest to backend/conftest.py`

## Task 2 — `core/tests/` structure + first migration (api/auth_test.py)

**Files:**

- `mkdir -p backend/core/tests/{api,views,services,admin,models}` and add empty `__init__.py` to each.
- `git mv backend/tests/test_api_auth.py backend/core/tests/api/auth_test.py`.

**Why first:** `core/` is the largest source — get the package structure in place, then keep moving siblings into the same skeleton.

Verify: `make -C backend test` → 63 still pass. Pytest's existing `python_files = ["test_*.py"]` does not match `auth_test.py`, so we'd lose 12 tests — to keep this step green, **temporarily widen** `python_files` in this same commit:

```toml
python_files = ["test_*.py", "*_test.py"]
```

This is a transitional state; Task 12 narrows it back.

**Commit:** `refactor(backend): move core api auth tests under core/tests/api/`

## Task 3 — Move remaining `core/` tests

`git mv` each:

- `backend/tests/test_api_test_reset.py` → `backend/core/tests/api/test_reset_test.py`
- `backend/tests/test_auth_bypass.py` → `backend/core/tests/services/auth_bypass_test.py`
- `backend/tests/test_ensure_superuser.py` → `backend/core/tests/services/ensure_superuser_test.py`
- `backend/tests/test_healthz.py` → `backend/core/tests/views/healthz_test.py`
- `backend/tests/test_seed_e2e_user.py` → `backend/core/tests/services/seed_e2e_user_test.py`
- `backend/tests/test_totp_qr.py` → `backend/core/tests/services/totp_qr_test.py`

Verify: 63/63.

**Commit:** `refactor(backend): move remaining core tests into per-category dirs`

## Task 4 — `mcp/tests/` and `tenancy/tests/`

- `mkdir -p backend/mcp/tests/services backend/tenancy/tests/services` + `__init__.py` files.
- `git mv backend/tests/test_mcp_auth.py backend/mcp/tests/services/auth_test.py`.
- `git mv backend/tests/test_tenancy_permissions.py backend/tenancy/tests/services/permissions_test.py`.

Verify: 63/63.

**Commit:** `refactor(backend): move mcp + tenancy tests into per-category dirs`

## Task 5 — `opportunities/tests/` re-shuffle

- `mkdir -p backend/opportunities/tests/models` + `__init__.py`.
- `git mv backend/opportunities/tests/opportunity_tests.py backend/opportunities/tests/models/opportunity_test.py`.

The existing `backend/opportunities/tests/__init__.py` stays.

Verify: 63/63.

**Commit:** `refactor(backend): place Opportunity model tests under opportunities/tests/models/`

## Task 6 — Cross-cutting test rename

`git mv backend/tests/test_mathutils.py backend/tests/mathutils_test.py`. Keep at repo-wide level — `slotflow.mathutils` is tutorial leftover, not app code.

Verify: 63/63.

**Commit:** `refactor(backend): rename math utils suite to project_test convention`

## Task 7 — Final pytest config tightening

Now that every file matches `*_test.py`, drop the legacy pattern:

```toml
python_files = ["*_test.py"]
```

Verify: 63/63 (config narrows discovery to the new convention only).

**Commit:** `refactor(backend): drop legacy test_*.py discovery from pytest config`

## Task 8 — Documentation sweep

**Files:**

- `CLAUDE.md` — rewrite the test-layout paragraph (added in PR #16) to describe `<app>/tests/<category>/<thing>_test.py` and the `*_test.py`-only discovery rule.
- `docs/superpowers/specs/2026-04-24-opportunity-model-design.md` — update test path refs.
- `docs/superpowers/plans/2026-04-24-opportunity-model.md` — update test path refs.
- `docs/superpowers/plans/2026-04-19-frontend-auth-screens.md` — replace each `backend/tests/test_X.py` with the new path.
- `docs/superpowers/plans/2026-04-22-e2e-auth-harness.md` — same.
- `docs/superpowers/plans/2026-04-18-five-package-releases.md` — single grep hit inside a code sample.

No code changes in this task.

**Commit:** `docs: align all plans/specs with the new backend test layout`

## Task 9 — PR

1. Final `make -C backend lint` clean.
2. Final `make -C backend test` → 63/63.
3. Rebase on `origin/main` (release workflow may have advanced after PR #16 merge).
4. Push branch.
5. Open PR with body explaining the migration map + risk note (no production code touched).
6. Title: `refactor(backend): standardize tests on per-app per-category layout`.
7. Halt for Copilot review per the existing PR-#13/#14/#15/#16 pattern.

## Out of plan

- Frontend test layout (`frontend/src/**/*.test.tsx`).
- E2E harness layout.
- Adding new tests.
- Touching production code.
