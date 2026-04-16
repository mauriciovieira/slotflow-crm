# Slotflow CRM Implementation Tracks

Date: 2026-04-16  
Source spec: `docs/superpowers/specs/2026-04-16-slotflow-crm-design.md`  
Execution model: one track per isolated git worktree

## Track List

1. `track-01-ci-cd`
  - Scope: local dev parity, lint/unit/e2e CI, staging auto deploy, production manual deploy
  - Status: Approved
  - Plan doc: `docs/superpowers/plans/track-01-ci-cd.md`
2. `track-02-platform-foundation`
  - Scope: Django latest stable + Python latest stable baseline, project scaffold, tenancy/auth foundations
  - Status: Approved
3. `track-03-domain-model-and-migrations`
  - Scope: DDD entities, repositories, migrations, constraints, audit primitives
  - Status: Approved
4. `track-04-mcp-and-authn-authz`
  - Scope: MCP server contract, token issuance after 2FA, role/workspace enforcement
  - Status: Approved
  - Plan doc: `docs/superpowers/plans/track-04-mcp-and-authn-authz.md`
5. `track-05-resume-import-render-pipeline`
  - Scope: JSON Resume editor/storage, import jobs, render jobs, state machines, Celery execution
  - Status: Approved
  - Plan doc: `docs/superpowers/plans/track-05-resume-import-render-pipeline.md`
6. `track-06-interview-learning-and-retrospective`
  - Scope: recording links, transcript ingestion, coaching insights, historical lost-process imports
  - Status: Pending draft
7. `track-07-frontend-react-dashboard`
  - Scope: React app implementation from `DESIGN.md`, dashboard workflows, currency comparison UX
  - Status: Pending draft
8. `track-08-observability-and-ops`
  - Scope: audit events, metrics/logging/tracing, runbooks, health checks
  - Status: Pending draft

## Approval Workflow

- Plans are submitted sequentially for review.
- Implementation starts only after explicit approval of each track plan.
- Each approved track executes in its own worktree under `.worktrees/`.

