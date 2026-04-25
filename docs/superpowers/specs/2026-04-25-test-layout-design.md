# Backend Test Layout — Design

**Date:** 2026-04-25
**Status:** Approved
**Scope:** Repo-wide refactor of backend tests into a per-app, per-category layout. Mechanical change. No behaviour changes; same test bodies, new locations + new file names.

## Goal

Standardize backend tests on:

```
backend/<app>/tests/<category>/<thing>_test.py
```

Where `<category>` is one of `models`, `admin`, `views`, `api`, `services`. The categorization is intent-based, not framework-based — a "DRF endpoint" goes under `api/`, a Django function-based view under `views/`, a management command or helper under `services/`.

The pre-existing repo-wide `backend/tests/` directory keeps cross-cutting suites that don't belong to any single app (smoke, math utilities, integration tests that span apps).

This is the third (and final) iteration on the layout:

1. Original: everything flat under `backend/tests/test_X.py`.
2. PR #16: introduced per-app `backend/<app>/tests/<topic>_tests.py` for new code, left historicals alone.
3. **This PR**: per-app + per-category; rename suffix `_tests.py` → `_test.py`. Migrate everything currently shipped to the final layout in one move.

## Non-goals

- Test logic changes. Bodies stay verbatim; only paths and module imports drift.
- Adding new tests. Existing test count must be preserved exactly.
- Coverage reporting changes. `make -C backend test` stays the gate.
- Rearranging non-backend tests (`frontend/src/**/*.test.tsx`, `e2e/tests/*.spec.ts` keep their current layout).
- Touching CI workflow YAML — pytest config does the work.

## Architecture

### File migration map

| Current path | New path | Category |
|---|---|---|
| `backend/tests/conftest.py` | `backend/conftest.py` | (root) |
| `backend/tests/test_api_auth.py` | `backend/core/tests/api/auth_test.py` | api |
| `backend/tests/test_api_test_reset.py` | `backend/core/tests/api/test_reset_test.py` | api |
| `backend/tests/test_auth_bypass.py` | `backend/core/tests/services/auth_bypass_test.py` | services |
| `backend/tests/test_ensure_superuser.py` | `backend/core/tests/services/ensure_superuser_test.py` | services |
| `backend/tests/test_healthz.py` | `backend/core/tests/views/healthz_test.py` | views |
| `backend/tests/test_seed_e2e_user.py` | `backend/core/tests/services/seed_e2e_user_test.py` | services |
| `backend/tests/test_totp_qr.py` | `backend/core/tests/services/totp_qr_test.py` | services |
| `backend/tests/test_mcp_auth.py` | `backend/mcp/tests/services/auth_test.py` | services |
| `backend/tests/test_tenancy_permissions.py` | `backend/tenancy/tests/services/permissions_test.py` | services |
| `backend/opportunities/tests/opportunity_tests.py` | `backend/opportunities/tests/models/opportunity_test.py` | models |
| `backend/tests/test_mathutils.py` | `backend/tests/mathutils_test.py` | (cross-cutting; no app) |

### Rationale for ambiguous picks

- `backend/tests/test_api_auth.py` → `core/tests/api/auth_test.py`: the file tests DRF endpoints under `/api/auth/...`.
- `backend/tests/test_api_test_reset.py` → `core/tests/api/test_reset_test.py`: keeps the `test_reset` segment because `/api/test/_reset/` is a real URL path; the doubled `test` in the destination filename comes from "this is the test of the test endpoint" — not a typo.
- `backend/tests/test_healthz.py` → `core/tests/views/healthz_test.py`: `HealthzView` is a Django view (not DRF).
- `backend/tests/test_auth_bypass.py` → `core/tests/services/auth_bypass_test.py`: `is_2fa_bypass_active` is a helper, not a view or model.
- `backend/tests/test_ensure_superuser.py`, `backend/tests/test_seed_e2e_user.py` → `core/tests/services/`: management commands are services in this taxonomy.
- `backend/tests/test_totp_qr.py` → `core/tests/services/totp_qr_test.py`: helper module.
- `backend/tests/test_mcp_auth.py` → `mcp/tests/services/auth_test.py`: `mcp.auth` is a service helper used inside MCP views.
- `backend/tests/test_tenancy_permissions.py` → `tenancy/tests/services/permissions_test.py`: `tenancy.permissions` is a service module used by callers.
- `backend/opportunities/tests/opportunity_tests.py` → `opportunities/tests/models/opportunity_test.py`: the suite covers model invariants only. When PR G adds API tests, they land at `opportunities/tests/api/opportunity_test.py`.
- `backend/tests/test_mathutils.py` → `backend/tests/mathutils_test.py`: tutorial leftover. Stays under repo-wide `backend/tests/` because `slotflow.mathutils` is not part of any app.

### Pytest configuration

`backend/pyproject.toml::tool.pytest.ini_options`:

```toml
testpaths = ["."]
python_files = ["*_test.py"]
norecursedirs = [
    ".venv",
    "migrations",
    "__pycache__",
    ".ruff_cache",
    ".pytest_cache",
    "node_modules",
    "dist",
    "build",
]
addopts = "-q --ds=config.settings.local"
```

Why `testpaths = ["."]` instead of enumerating per-app paths:

- New apps drop in a `tests/` dir and are discovered automatically — no pytest config churn.
- `norecursedirs` keeps virtualenvs and tooling caches off the discovery walk.
- Pytest's default rootdir handling means `backend/conftest.py` (the relocated fixture file) is loaded once for the whole tree.

### Package init files

Every new test directory gets an `__init__.py`:

- `<app>/tests/__init__.py`
- `<app>/tests/<category>/__init__.py`

Reason: pytest's default import mode (`prepend`) requires unique base names. With per-category subdirs, `auth_test.py` exists in both `core/tests/api/` and `mcp/tests/services/`. `__init__.py` files turn each directory into a package, so the resolved module name is e.g. `core.tests.api.auth_test` vs `mcp.tests.services.auth_test`. No collision, no `conftest.py` gymnastics.

The pre-existing `backend/opportunities/tests/__init__.py` is reused.

### Conftest relocation

`backend/tests/conftest.py` → `backend/conftest.py`. Pytest auto-loads conftest from any ancestor of a test file, so moving it to the rootdir keeps the autouse fixtures (DEBUG=True, debug-toolbar suppression, SQLite forcing) live for all suites without re-importing.

## Documentation updates

This refactor changes locations every existing plan and spec mentions. Update to match.

| Doc | What changes |
|---|---|
| `CLAUDE.md` | The "Backend test layout" paragraph (added in PR #16) gets rewritten to describe the per-category structure. Pytest discovery rule updates (single pattern `*_test.py`). |
| `docs/superpowers/specs/2026-04-24-opportunity-model-design.md` | `opportunity_tests.py` references → `opportunity_test.py` under the new path. |
| `docs/superpowers/plans/2026-04-24-opportunity-model.md` | Same. |
| `docs/superpowers/plans/2026-04-19-frontend-auth-screens.md` | All `backend/tests/test_X.py` references rewritten to the new paths. The plan is historical — it documents what shipped — but the *paths* are the only thing changing here, and the PRs they describe are still discoverable via git log. |
| `docs/superpowers/plans/2026-04-22-e2e-auth-harness.md` | Same treatment. |
| `docs/superpowers/plans/2026-04-18-five-package-releases.md` | Single grep hit (`backend/tests/test_healthz.py` inside a code sample) gets rewritten. |

Track-level plans (`track-01..track-08.md`) reference apps and categories, not specific files — no edits.

## Testing strategy

This refactor must not change pass/fail of any existing test:

1. Pre-refactor count: `make -C backend test` → record number passing on `main` (currently 63).
2. Run after each batch of moves; regressions caught immediately.
3. Final count must match pre-count exactly.
4. `make -C backend lint` (ruff check + format) must stay green.

Sanity:

- `git mv` is used everywhere so blame history is preserved.
- Imports inside the moved test files use absolute imports already (e.g. `from core.api_auth import …`); paths don't need rewrites.
- The `pytestmark` and `pytest.mark.django_db` markers are local to each file and travel with the move.

## Risk & rollback

- Pure code-organization change. No production code touched. No models, no migrations, no API.
- If pytest discovery misses a file, the test count drops and the PR fails CI before merge.
- Rollback: revert the merge. The migration is in one PR; one revert undoes everything.

## Open questions

None. Proceeding to plan.
