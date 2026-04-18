# Five-package release automation

**Status:** Designed
**Date:** 2026-04-18
**Scope:** Extends release automation to cover three previously-untagged change sets — `e2e/`, `docs/`, and everything else at the repo root — so the repository has five independent SemVer lines instead of two. No application feature behavior.

**Supersedes, in part:** [`2026-04-17-multi-package-changelog-design.md`](2026-04-17-multi-package-changelog-design.md) — that design remains the source of truth for the backend and frontend lines; this one adds three more and reshapes the root file layout.

## 1. Problem

The current automation tags only `backend-v*` and `frontend-v*`. Commits that touch `e2e/`, `docs/`, or repo-root files (CI, Make targets, `AGENTS.md`, `CLAUDE.md`, `DESIGN.md`, scripts, `.claude/`, etc.) never produce a tag or changelog entry. The three non-code sibling surfaces are invisible in release history.

We want five independent SemVer lines so every change set in the repository is traceable, with the same Conventional-Commits → auto-release contract already in place for backend and frontend.

## 2. Goals

1. **Three new release lines** — `e2e/`, `docs/`, and `root/` (everything outside `backend/`, `frontend/`, `e2e/`, `docs/`).
2. **Path-based routing** — no new scope conventions for contributors; paths determine which line a commit releases.
3. **One release workflow** — `.github/workflows/release.yml` runs all five lines sequentially in a single job, eliminating the `RELEASES.md` race between parallel workflows.
4. **Reclaim `CHANGELOG.md`** for the root line by renaming the current index file to `RELEASES.md`.
5. **Preserve the existing backend and frontend behavior** — their tag format, changelog location, and commit routing do not change; only the index filename they append to moves from `CHANGELOG.md` to `RELEASES.md`.

## 3. Non-goals

- Changing how backend or frontend releases are produced (tool, tag format, scope rules all unchanged).
- Introducing a unified monorepo version.
- Publishing any package to npm/PyPI.
- Requiring scopes on contributor commits.

## 4. Scope split and tag prefixes

| Line | Path scope | Tag format | Tool | Config location |
|------|-----------|-----------|------|-----------------|
| backend | `backend/**` (plus `scope_prefix=^backend` for shared files) | `backend-v{version}` | `python-semantic-release` | `backend/pyproject.toml` (unchanged) |
| frontend | `frontend/**` | `frontend-v{version}` | `semantic-release` + `semantic-release-commit-filter` | `frontend/release.config.cjs` (unchanged) |
| **e2e** | `e2e/**` | `e2e-v{version}` | `semantic-release` + `semantic-release-commit-filter` | `e2e/release.config.cjs` (new) |
| **docs** | `docs/**` | `docs-v{version}` | `semantic-release` + `semantic-release-commit-filter` | `docs/release.config.cjs` (new) |
| **root** | everything except `backend/**`, `frontend/**`, `e2e/**`, `docs/**`, `RELEASES.md` | `root-v{version}` | `semantic-release` + local filter plugin | `.release/root/release.config.cjs` (new) |

## 5. Versioning and seed tags

- All three new lines start at `0.0.1`.
- Version source of truth is the `version` field in each line's `package.json`:
  - e2e: existing `e2e/package.json`.
  - docs: new `docs/package.json` (created solely to anchor semantic-release).
  - root: new `.release/root/package.json` (isolated from the repo root to avoid creating a confusing root-level npm project).
- **Seed at rollout.** Without a baseline tag, semantic-release would ingest the entire git history on first run. Immediately after the PR that lands this design merges to `main`, create three seed tags at the merge commit:

  ```bash
  git tag -a e2e-v0.0.1  -m "chore(release): seed e2e release line"
  git tag -a docs-v0.0.1 -m "chore(release): seed docs release line"
  git tag -a root-v0.0.1 -m "chore(release): seed root release line"
  git push origin e2e-v0.0.1 docs-v0.0.1 root-v0.0.1
  ```

  Everything before the seed is pre-history for these lines. The first real release in each line bumps from `0.0.1` based only on commits after the seed.

## 6. File layout

### 6.1 Changelog files

| File | Role | State |
|------|------|-------|
| `RELEASES.md` (repo root) | Chronological index across all five lines, newest first | **renamed from `CHANGELOG.md` via `git mv`**, contents preserved |
| `CHANGELOG.md` (repo root) | Root-line release notes | **new**, owned by the root release pipeline |
| `backend/CHANGELOG.md` | Backend-line notes | unchanged |
| `frontend/CHANGELOG.md` | Frontend-line notes | unchanged |
| `e2e/CHANGELOG.md` | E2E-line notes | new |
| `docs/CHANGELOG.md` | Docs-line notes | new |

### 6.2 `RELEASES.md` header

```markdown
# Releases

Chronological index of package releases (newest first). Detailed notes live in:

- [Root](CHANGELOG.md)
- [Backend](backend/CHANGELOG.md)
- [Frontend](frontend/CHANGELOG.md)
- [E2E](e2e/CHANGELOG.md)
- [Docs](docs/CHANGELOG.md)

<!-- release-index -->

## 2026-04-18 — Frontend 1.2.0
…
```

Existing frontend 1.0.0 / 1.1.0 / 1.2.0 entries are preserved verbatim by the `git mv`.

### 6.3 New release-tooling files

| File | Purpose |
|------|---------|
| `e2e/release.config.cjs` | semantic-release config, `tagFormat: "e2e-v${version}"`, extends `semantic-release-commit-filter`. |
| `e2e/CHANGELOG.md` | English stub + `## Unreleased`. |
| `docs/package.json` | `"private": true`, `"name": "docs"`, `"version": "0.0.1"`, devDependencies for semantic-release + plugins + filter. |
| `docs/release.config.cjs` | Same shape as `e2e/release.config.cjs`; `tagFormat: "docs-v${version}"`. |
| `docs/CHANGELOG.md` | English stub. |
| `.release/root/package.json` | Isolated toolchain for the root line; tracks the root version. |
| `.release/root/release.config.cjs` | semantic-release config; `tagFormat: "root-v${version}"`; references the local filter plugin; `changelogFile` and `@semantic-release/git` `assets` paths resolve to repo-root `CHANGELOG.md` via `../../`. |
| `.release/root/filter-commits.cjs` | ~30-line local plugin wrapping `@semantic-release/commit-analyzer` and `@semantic-release/release-notes-generator` — filters out commits whose changed files are all under `backend/`, `frontend/`, `e2e/`, `docs/`, or equal to `RELEASES.md`. |
| `.release/root/package-lock.json` | Committed lockfile for reproducibility. |

### 6.4 Shared script

`scripts/prepend-root-changelog.sh` is extended:
- First argument now accepts `backend | frontend | e2e | docs | root`.
- Target file changes from `CHANGELOG.md` to `RELEASES.md`.
- Package label map adds `E2E`, `Docs`, `Root`.
- Link target for the `root` argument points at repo-root `CHANGELOG.md`; other links keep their existing `<pkg>/CHANGELOG.md` shape.
- Anchor-fragment computation (dots → dashes from the version) is unchanged.

### 6.5 Workflow files

| File | State |
|------|-------|
| `.github/workflows/release.yml` | **new** — single workflow containing all five release lines in order. |
| `.github/workflows/release-backend.yml` | **deleted** |
| `.github/workflows/release-frontend.yml` | **deleted** |

## 7. Commit routing

Paths, not scopes, decide which line a commit releases. Scopes remain advisory (same as today).

- **e2e, docs** — `semantic-release-commit-filter` with the package directory acting as the positive path filter. A commit counts if it touches any file under the directory.
- **root** — local filter plugin (`filter-commits.cjs`). For each candidate commit since the last `root-v*` tag, run `git diff-tree --no-commit-id --name-only -r <hash>`; keep the commit only if **at least one** changed file is not under `backend/`, `frontend/`, `e2e/`, `docs/`, and not equal to `RELEASES.md`. Pass filtered commits through to the stock `@semantic-release/commit-analyzer` and `@semantic-release/release-notes-generator`.

**Multi-package commits.** A single commit can release multiple lines — e.g. `feat` touching `backend/` + `Makefile` fires backend (path match) and root (path not fully excluded). Each line's release commit and tag are independent; `RELEASES.md` gets one index entry per line per release.

**Release-automation commits (`[skip ci]`).** These touch only files inside their owning package (backend: `backend/CHANGELOG.md` + version files; frontend: same for frontend; likewise for e2e/docs/root) plus the `RELEASES.md` index update. `RELEASES.md` is in every line's exclusion list, so automation commits never leak into another line's notes.

## 8. Single release workflow

`.github/workflows/release.yml`:

- Triggers: `push: { branches: [main] }`, `workflow_dispatch`. **No `paths` filter** — every push enters the workflow; each individual line no-ops quickly when there are no qualifying commits since its last tag.
- Concurrency: `group: release-${{ github.ref }}`, `cancel-in-progress: false`.
- Permissions: `contents: write`, `issues: write`, `pull-requests: write`.
- One `release` job. `actions/checkout@v6` with `fetch-depth: 0` and `persist-credentials: true`. `setup-python` + `setup-node` once each, reading `backend/.python-version` / repo-root `.nvmrc`.

### 8.1 Step order

Sequential, fail-fast (default). If any line errors, later lines do not run; the next push picks up where it left off.

1. **backend** — `python-semantic-release` action with `directory: backend`; capture `released` and `version` outputs.
2. **Prepend `RELEASES.md` for backend** if `released == 'true'`; `git pull --rebase`; commit `docs: update root changelog index for backend ${VER} [skip ci]`; push.
3. **frontend** — `cd frontend && npm ci && npx semantic-release`; detect release via the same HEAD/tag check the current `release-frontend.yml` uses.
4. **Prepend `RELEASES.md` for frontend** if released; pull-rebase-commit-push.
5. **e2e** — `cd e2e && npm ci && npx semantic-release`; prepend + push if released.
6. **docs** — `cd docs && npm ci && npx semantic-release`; prepend + push if released.
7. **root** — `cd .release/root && npm ci && npx semantic-release`; prepend + push if released.

Serial execution inside one job guarantees no parallel writers to `RELEASES.md` or `main`.

### 8.2 "Did a release happen?" detection

Reuse the exact detection pattern in today's `release-frontend.yml` (which has shipped three releases successfully). During implementation, verify the pattern translates unchanged to the e2e, docs, and root steps — the only environmental difference is cwd (`.release/root/` for root; `@semantic-release/git` commits at repo root regardless).

### 8.3 Ordering choice

Backend → frontend → e2e → docs → root is aesthetic; it determines the visual top-to-bottom order within `RELEASES.md` when multiple lines release on the same date. "Heaviest code → lightest meta" reads naturally. Changing it is a one-line edit.

## 9. Changelog language and format

English prose across all five changelogs and the index. Package changelogs use `## X.Y.Z` section headings so GitHub anchor slugs (`#x-y-z`) match the prepend script's computation — unchanged from the existing multi-package design.

## 10. Edge cases

1. **Commit touches `backend/` + root file** — backend + root both release; two entries in `RELEASES.md`.
2. **Commit touches `e2e/` + `docs/`** — e2e + docs both release; two entries.
3. **Release automation commits (`[skip ci]`)** — contained to their own package plus `RELEASES.md`; excluded from every other line.
4. **The rollout PR itself** — touches `CHANGELOG.md` (mv to `RELEASES.md`), new files under `docs/`, `e2e/`, `.release/`, and `.github/workflows/`. Seed tags (Section 5) sit at the merge commit so the three new lines treat this as pre-history.
5. **Commits to `.github/workflows/release.yml`** — fall into root's scope (expected; workflow edits are meta-repo changes).
6. **New top-level directory added later** — flows into root's scope until explicitly excluded. Maintenance item: when a new first-class package lands (e.g. hypothetical `mobile/`), add it to the exclusion list in `.release/root/filter-commits.cjs`. `release.yml` itself has no path filter, so no change is needed there.
7. **Commits not following Conventional Commits** — no release, same as today.

## 11. Verification

After rollout, confirm in order:

1. `git tag -l "e2e-v*" "docs-v*" "root-v*"` each return exactly `0.0.1` (seed tags pushed).
2. Merge a `feat:` touching only `e2e/` → `e2e-v0.1.0`; `e2e/CHANGELOG.md` gains an entry; `RELEASES.md` gains one line.
3. Merge a `feat:` touching only `docs/` → `docs-v0.1.0`; same pattern.
4. Merge a `feat:` touching only `Makefile` → `root-v0.1.0`; entry in **repo-root `CHANGELOG.md`**; one line in `RELEASES.md`.
5. Merge a `feat:` touching `backend/foo.py` + `Makefile` → backend and root **both** release; two entries in `RELEASES.md`.
6. Confirm `RELEASES.md` anchors resolve correctly on GitHub's rendered view.
7. Confirm the GitHub Releases page shows prefixed tags for all five lines.

## 12. Known limitations

- **Parallel pushes from outside the workflow.** The design eliminates races *inside* the release automation. Humans force-pushing `main` or merging additional PRs mid-run still need the existing `git pull --rebase` safety net, retained in each prepend step.
- **Negative filter maintenance.** Adding a new top-level package requires a one-line update to `.release/root/filter-commits.cjs`. Undocumented new directories will be absorbed into the root line until excluded.
- **Detection pattern reuse.** The "did a release happen?" check is copied from `release-frontend.yml`. If that pattern turns out to be fragile in one of the new contexts (notably root's isolated cwd), the implementation plan must tighten it — no workaround is scheduled in advance.

## 13. References

- [`2026-04-17-multi-package-changelog-design.md`](2026-04-17-multi-package-changelog-design.md) — prior two-line design.
- Current workflows: [`.github/workflows/release-backend.yml`](../../../.github/workflows/release-backend.yml), [`.github/workflows/release-frontend.yml`](../../../.github/workflows/release-frontend.yml) — deleted by this design.
- Current index: [`CHANGELOG.md`](../../../CHANGELOG.md) — renamed to `RELEASES.md` by this design.
- Shared script: [`scripts/prepend-root-changelog.sh`](../../../scripts/prepend-root-changelog.sh) — extended by this design.
