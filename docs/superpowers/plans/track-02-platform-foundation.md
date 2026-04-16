# Track 02: Platform Foundation

Status: Draft (awaiting approval)  
Spec reference: `docs/superpowers/specs/2026-04-16-slotflow-crm-design.md`  
Execution mode: isolated worktree (`.worktrees/track-02-platform-foundation`)

## 1) Objectives

- Establish the project runtime and framework baseline for all other tracks.
- Bootstrap a production-like Django architecture with tenant-aware foundations.
- Implement authentication baseline with mandatory 2FA support hooks.
- Provide base app/module structure used by domain, MCP, and frontend tracks.

## 2) Constraints and Decisions

- Runtime baseline:
  - Python: latest stable version at execution time.
  - Django: latest stable version at execution time.
- Project must run locally in isolated environment (`uv` or `virtualenv`).
- No domain-deep implementation in this track (entities/business flows stay for later tracks).

## 3) Deliverables

- Backend project scaffold:
  - Django project package and settings modules (`base`, `local`, `staging`, `production`).
  - app module skeletons aligned with spec (`identity`, `opportunities`, `resumes`, etc.).
- Tooling baseline:
  - dependency management files
  - lint/test config stubs aligned with Track 01 CI expectations.
- Infrastructure baseline:
  - Postgres/Redis-backed local config
  - Celery app initialization + worker/beat wiring skeleton.
- Security/auth baseline:
  - user model strategy decision (custom user if needed)
  - 2FA integration foundation (enforcement points, not full product flows yet).

## 4) Execution Phases

### Phase A - Runtime and Project Bootstrap

- Initialize Python environment strategy (`uv` preferred or `virtualenv` fallback).
- Install latest stable Django and lock dependency baseline.
- Create Django project and settings split by environment.
- Add core third-party packages required by architecture (DRF, Celery, Redis client, env config).

Exit criteria:
- `manage.py check` passes locally.
- app starts with local settings and connects to Postgres/Redis.

### Phase B - App Structure and Shared Primitives

- Create app directories and register installed apps.
- Add shared utilities:
  - base model mixins (`timestamps`, optional `soft delete` scaffold),
  - workspace context helper interfaces,
  - common error/response primitives.
- Add audit/event logging scaffold interfaces (implementation depth later).

Exit criteria:
- All app modules import cleanly.
- no circular import or settings boot errors.

### Phase C - Auth and Tenancy Foundation

- Implement foundational `Workspace` and `Membership` models (minimal fields only).
- Add role enum scaffold (`Owner`, `Member`, `Viewer`) and membership checks.
- Integrate auth baseline and define 2FA enforcement policy points:
  - interactive login requires 2FA,
  - MCP token issuance requires 2FA-verified session.
- Keep Django admin restricted to system administrators.

Exit criteria:
- can create workspace + membership in local environment.
- role-aware permission utility functions exist and are test-covered at baseline level.

### Phase D - Celery and Async Platform Baseline

- Configure Celery app with Redis broker/result backend.
- Wire worker and beat entrypoints for local and Render usage.
- Add placeholder tasks and queue routing (`imports`, `render`, `insights`, `fx`).

Exit criteria:
- worker and beat start cleanly locally.
- sample task executes end-to-end.

## 5) Suggested Initial Dependencies (latest stable)

- Django
- djangorestframework
- celery
- redis (python client)
- psycopg (or psycopg2-binary, based on deployment constraints)
- python-dotenv or equivalent env loader
- 2FA package candidate (final selection documented in this track PR)

## 6) Risks and Mitigations

- Dependency/version incompatibilities:
  - Mitigation: pin tested versions after bootstrap and run full CI checks.
- Premature over-modeling:
  - Mitigation: keep this track to platform scaffolding and foundational identity/tenancy only.
- Auth complexity early-on:
  - Mitigation: implement clear extension points and defer advanced flows to dedicated tracks.

## 7) Validation Checklist

- local bootstrap works on fresh clone.
- Django app boots with environment-separated settings.
- Postgres + Redis integration works locally.
- workspace/membership foundation exists with role checks.
- 2FA enforcement points are implemented/documented.
- Celery worker/beat run successfully.

## 8) Out of Scope for Track 02

- full domain entity implementation and migrations for all contexts.
- MCP tool handlers and full API contracts.
- resume import/render pipelines and interview insight logic.
- React UI implementation.

## 9) Approval Gate

Approval of this track authorizes:
- creating dedicated worktree for platform foundation,
- implementing project scaffold + identity/tenancy baseline,
- opening focused PR limited to foundational platform concerns.