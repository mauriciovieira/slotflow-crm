# Slotflow CRM Copilot Review Instructions

Use these instructions when reviewing pull requests in this repository. Path-specific rules in `.github/instructions/*.instructions.md` add backend, frontend, and e2e details.

## Review Priorities

- Prioritize correctness, security, authorization, data integrity, and missing tests over style-only comments.
- Flag changes that bypass established auth/authz paths, especially 2FA, session auth, workspace membership checks, and MCP fresh-OTP checks.
- Flag audit-worthy actions that do not call `audit.write_audit_event(...)`.
- Check that new behavior has focused tests in the package that owns it. Backend tests use pytest, frontend tests use Vitest, and e2e tests use Playwright.
- Check that local developer guidance uses `make` targets when possible. CI workflows may invoke package tools directly.

## Repository Shape

- This is a Django + DRF + Celery, Vite + React + TypeScript, and Playwright monorepo.
- There is no top-level `package.json` or `pyproject.toml`; package toolchains live under `backend/`, `frontend/`, and `e2e/`.
- Backend apps live directly under `backend/` as siblings of `config/`.
- Tests should stay close to the owning package and app, not in unrelated top-level locations.

## Review Style

- Leave specific, actionable comments tied to changed code.
- Avoid comments that only restate existing CI checks unless the diff shows a likely failure.
- Do not ask authors to follow external docs; quote the relevant rule directly in the review comment.
