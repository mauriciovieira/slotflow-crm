# Track 01: CI/CD

Status: Draft (awaiting approval)  
Spec reference: `docs/superpowers/specs/2026-04-16-slotflow-crm-design.md`  
Execution mode: isolated worktree (`.worktrees/track-01-ci-cd`)

## 1) Objectives

- Establish a reliable CI baseline for backend and frontend.
- Enforce local/CI parity for lint, unit tests, and Playwright e2e.
- Automate staging deploys on merge.
- Keep production deploy manual via GitHub Actions `workflow_dispatch`.

## 2) Constraints and Decisions

- Runtime baseline uses latest stable:
  - Python: latest stable at implementation time.
  - Django: latest stable at implementation time.
- CI must run with the same major versions as local development.
- No deploy logic inside `ci.yml`; deployment workflows remain separate.

## 3) Deliverables

- `.github/workflows/ci.yml`
- `.github/workflows/deploy-staging.yml`
- `.github/workflows/deploy-production.yml`
- local bootstrap/test command documentation (`README` or `docs/dev-setup.md`)
- Make targets or script commands:
  - `lint`
  - `test-unit`
  - `test-e2e`
  - optional aggregate: `ci`

## 4) Execution Phases

### Phase A - Local/CI Command Parity

- Define deterministic setup commands for local isolated environments (`uv` or `virtualenv`).
- Standardize backend/frontend lint and unit test commands.
- Standardize e2e command with Playwright local run.
- Validate commands run cleanly on a fresh clone.

Exit criteria:

- One command path documented and reproducible locally.
- CI can call the same commands without custom branch-specific hacks.

### Phase B - Pull Request CI Workflow

- Implement `ci.yml` on `pull_request` to `main`.
- Jobs (parallel where possible):
  - backend lint/tests
  - frontend lint/tests
  - Playwright e2e
- Add dependency caches (Python and Node).
- Publish artifacts on failure (Playwright report/screenshots).

Exit criteria:

- Required PR checks configured and enforced.
- Failed checks block merge.

### Phase C - Automatic Staging Deploy

- Implement `deploy-staging.yml` on `push` to `main`.
- Trigger Render staging deploy using deploy hook or Render API token.
- Run post-deploy health check(s) and fail workflow if unhealthy.

Exit criteria:

- Every merge to `main` produces a staging deploy attempt.
- Health-check status visible in workflow run summary.

### Phase D - Manual Production Deploy

- Implement `deploy-production.yml` with `workflow_dispatch`.
- Add GitHub `production` environment with required approvals.
- Deploy to Render production via hook/API.
- Run post-deploy health checks and output deploy summary.

Exit criteria:

- Production deploy only runs on manual dispatch with approval gate.
- Workflow clearly reports success/failure and release ref.

## 5) Secrets and Environments

- GitHub Environment `staging`:
  - `RENDER_STAGING_DEPLOY_HOOK` (or equivalent API secret)
  - `STAGING_HEALTHCHECK_URL`
- GitHub Environment `production`:
  - `RENDER_PROD_DEPLOY_HOOK` (or equivalent API secret)
  - `PRODUCTION_HEALTHCHECK_URL`

Rules:

- Keep staging/prod secrets environment-scoped.
- Do not reuse production secrets in staging workflows.

## 6) Branch Protection Requirements

- Require successful `ci.yml` checks before merge.
- Require branch up-to-date before merge.
- Block direct pushes to `main`.
- Require at least one approved PR review.

## 7) Risks and Mitigations

- Flaky Playwright tests:
  - Mitigation: deterministic test data, retry policy for flaky selectors, artifact capture.
- Slow CI runtime:
  - Mitigation: split jobs, cache dependencies, prune redundant e2e scenarios.
- Deployment race conditions:
  - Mitigation: workflow concurrency groups per environment.

## 8) Validation Checklist

- `ci.yml` passes in PR with all required jobs.
- staging deploy workflow triggers after merge and reaches healthy state.
- production deploy requires manual dispatch and approval.
- failed deploys expose actionable diagnostics.

## 9) Out of Scope for Track 01

- feature/domain implementation.
- MCP tool development.
- data model migrations unrelated to CI needs.

## 10) Approval Gate

Approval of this track authorizes:

- creating a dedicated worktree for CI/CD implementation,
- implementing workflow files and minimal support scripts/docs,
- opening a focused PR for this track only.

