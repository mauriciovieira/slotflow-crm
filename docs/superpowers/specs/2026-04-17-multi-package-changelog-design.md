# Multi-package changelog and release automation

**Status:** Implemented  
**Date:** 2026-04-17  
**Scope:** Release automation, versioning, and changelog layout for the backend (Python) and frontend (Node) packages in this monorepo. No application feature behavior.

## 1. Problem

The repository root `CHANGELOG.md` does not reliably track package changes: `python-semantic-release` runs with `directory: backend`, so release commits only include files under `backend/`, while `changelog_file` pointed outside that directory and was not committed.

We want **independent SemVer lines** for backend and frontend, **English** changelogs per package, and a **root index** that links to those changelogs in **chronological order** (newest first).

## 2. Goals

1. **`backend/CHANGELOG.md`** — Auto-generated from conventional commits scoped to backend changes; English prose for release sections.
2. **`frontend/CHANGELOG.md`** — Same for the frontend package, using the Node **semantic-release** toolchain (Approach A).
3. **Root `CHANGELOG.md`** — Chronological index (model B): each entry states date, which package(s) released, version(s), and links to the corresponding section anchors in the package changelogs.
4. **Independent versions** — Backend and frontend versions may differ; no single “monorepo version.”
5. **Non-colliding Git tags** — Use explicit prefixes: `backend-v{version}` and `frontend-v{version}`.

## 3. Non-goals

- Unifying backend and frontend into one shared SemVer.
- Replacing Conventional Commits as the primary release trigger vocabulary.
- Publishing packages to npm/PyPI (private app; versioning is for traceability and GitHub Releases).

## 4. Alternatives (recap)

| Approach | Description | Outcome |
|----------|-------------|---------|
| **A** | `python-semantic-release` in `backend/` + `semantic-release` (npm) in `frontend/` | **Chosen** — idiomatic per stack, full control of tags and assets. |
| **B** | PSR + Release Please on frontend | Rejected — mixed conventions and tooling. |
| **C** | PSR only for both | Rejected — awkward for a JS-only tree. |

## 5. Versioning rules

### 5.1 Backend

- Source of truth remains `backend/pyproject.toml` (`project.version`) and `backend/config/version.py` (`__version__`), updated by `python-semantic-release`.
- Initial line in this design: current repo state (already at `0.2.0` or later at implementation time); no forced reset.

### 5.2 Frontend

- Add `"version"` to `frontend/package.json`.
- **Initial version:** `0.0.1` (per product decision). The first automated frontend release may bump from this baseline according to commit types.

### 5.3 Git tags

- **Backend:** `backend-vMAJOR.MINOR.PATCH` (example: `backend-v0.3.0`).
- **Frontend:** `frontend-vMAJOR.MINOR.PATCH` (example: `frontend-v0.0.2`).

## 6. Changelog language and format

- All generated and hand-maintained changelog **body text** for these three files is **English** (titles, section bodies, and root index blurbs).
- Use stable, predictable section headings in package changelogs so root links can target GitHub-generated anchors (validate anchor slugs against a real release once during implementation).

## 7. CI / GitHub Actions

### 7.1 Triggers and scope

- Run backend release logic only when relevant paths change (e.g. `backend/**` and shared release config if applicable).
- Run frontend release logic only when relevant paths change (e.g. `frontend/**`).
- Each analyzer must **ignore or exclude** commits that do not touch its path where the tool supports it, so unrelated merges do not false-trigger a release.

### 7.2 Root index updates

- After a successful release for a package, update the **root** `CHANGELOG.md` by **prepending** a new dated entry with a link to that package’s section.
- Use `git pull --rebase` (or equivalent) before pushing to reduce conflicts when both packages release close together.
- If concurrent updates become frequent, a follow-up improvement may serialize root updates (out of scope unless needed).

### 7.3 Permissions

- Workflows need `contents: write` (and whatever each action documents) for tagging, committing release notes, and pushing.

## 8. Root `CHANGELOG.md` shape (model B)

Illustrative structure (exact anchor fragments are verified during implementation):

```markdown
# Changelog

Package-specific notes: [backend](backend/CHANGELOG.md) · [frontend](frontend/CHANGELOG.md).

## 2026-04-17 — frontend 0.0.2

- [Notes](frontend/CHANGELOG.md#…)

## 2026-04-16 — backend 0.3.0

- [Notes](backend/CHANGELOG.md#…)
```

- Newest entry at the **top**.
- A line may document **only backend**, **only frontend**, or, if both release in the same automation window, **two entries** on the same date or one entry listing both—implementation chooses the simplest consistent rule; preference is **one entry per package release** to keep history linear.

## 9. Edge cases

- Commits that do not follow Conventional Commits may not produce a release (expected).
- Merge commits: follow each tool’s recommended exclusion settings for merge noise.
- Release commits often include `[skip ci]`; ensure this does not block required follow-up workflows (tune in implementation).

## 10. Verification (after implementation)

- Merge a `feat:` (or equivalent) change under `backend/` only → backend tag and `backend/CHANGELOG.md` update; root index gains a backend line; frontend unchanged.
- Merge a `feat:` under `frontend/` only → frontend tag and `frontend/CHANGELOG.md` update; root index gains a frontend line.
- Confirm GitHub Release (if enabled) matches prefixed tags and English notes.

## 11. References

- Backend automation: [`backend/pyproject.toml`](../../../backend/pyproject.toml) (`[tool.semantic_release]`).
- Workflows: [`.github/workflows/release.yml`](../../../.github/workflows/release.yml) (to be split/extended during implementation).
