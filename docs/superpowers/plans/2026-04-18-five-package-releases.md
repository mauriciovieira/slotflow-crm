# Five-package release automation implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend release automation from two to five independent SemVer lines — add `e2e-v*`, `docs-v*`, and `root-v*` alongside the existing `backend-v*` and `frontend-v*`, consolidate all five lines into a single serial `release.yml` workflow, and reshape the root file layout (rename `CHANGELOG.md` → `RELEASES.md`; new repo-root `CHANGELOG.md` owned by the root line).

**Architecture:** Each new line follows the existing frontend pattern (semantic-release + `semantic-release-commit-filter`) except `root`, which uses a local filter plugin (~30 lines) at `.release/root/filter-commits.cjs` because it needs a *negative* path filter that none of the off-the-shelf plugins provide. Root tooling is isolated under `.release/root/` to avoid polluting repo root with an npm project. One workflow runs all five lines sequentially in a single job — serial execution eliminates the `RELEASES.md` race between parallel per-package workflows.

**Tech Stack:** GitHub Actions, semantic-release v24, `semantic-release-commit-filter`, python-semantic-release v10, Node 24, bash, Python 3 (for the prepend script), `node:test` (for the filter plugin unit tests).

**Spec:** [`docs/superpowers/specs/2026-04-18-five-package-releases-design.md`](../specs/2026-04-18-five-package-releases-design.md)

---

## File map

| File | Role |
|------|------|
| `scripts/prepend-root-changelog.sh` | **Modify** — accepts `backend|frontend|e2e|docs|root`; target becomes `RELEASES.md`. |
| `scripts/test-prepend-root-changelog.sh` | **Create** — self-contained bash test that drives the prepend script in a tmp git repo. |
| `CHANGELOG.md` | **Rename** via `git mv` → `RELEASES.md`; content preserved. |
| `RELEASES.md` | Post-rename target of the prepend script; header updated to list all five packages. |
| `CHANGELOG.md` (new) | Repo-root notes file owned by the root release line. |
| `e2e/release.config.cjs` | **Create** — semantic-release config for e2e; `tagFormat: "e2e-v${version}"`. |
| `e2e/CHANGELOG.md` | **Create** — English stub with `## Unreleased`. |
| `e2e/package.json` | **Modify** — add semantic-release devDeps + `"release"` script; bump no `version` yet. |
| `e2e/package-lock.json` | **Refresh** via `npm install`. |
| `docs/package.json` | **Create** — minimal private npm project anchoring semantic-release; `"version": "0.0.1"`. |
| `docs/package-lock.json` | **Create** via `npm install`. |
| `docs/release.config.cjs` | **Create** — `tagFormat: "docs-v${version}"`. |
| `docs/CHANGELOG.md` | **Create** — English stub. |
| `.release/root/package.json` | **Create** — isolated root-line toolchain; `"version": "0.0.1"`. |
| `.release/root/package-lock.json` | **Create** via `npm install`. |
| `.release/root/release.config.cjs` | **Create** — `tagFormat: "root-v${version}"`; references local filter plugin; `changelogFile` and git assets resolve to `../../CHANGELOG.md`. |
| `.release/root/filter-commits.cjs` | **Create** — local plugin wrapping commit-analyzer + release-notes-generator with a path-based exclusion filter. |
| `.release/root/filter-commits.test.cjs` | **Create** — `node:test` unit tests for the path predicate. |
| `.github/workflows/release.yml` | **Create** — consolidated workflow running all five lines sequentially. |
| `.github/workflows/release-backend.yml` | **Delete**. |
| `.github/workflows/release-frontend.yml` | **Delete**. |
| `AGENTS.md` | **Modify** — any references to the old `CHANGELOG.md` index updated to `RELEASES.md`. |
| `CLAUDE.md` | **Modify** — same audit. |

---

### Task 1: Extend `scripts/prepend-root-changelog.sh` to five packages and `RELEASES.md`

**Files:**
- Modify: `scripts/prepend-root-changelog.sh`
- Create: `scripts/test-prepend-root-changelog.sh`

We start here because every release pipeline calls this script. Extending it first lets later tasks simply use the new arguments.

- [ ] **Step 1: Write the failing integration test at `scripts/test-prepend-root-changelog.sh`**

```bash
#!/usr/bin/env bash
# Integration test for scripts/prepend-root-changelog.sh.
# Creates a throwaway git repo, seeds a RELEASES.md, invokes the script
# once per supported package, and checks the output.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPT="${REPO_ROOT}/scripts/prepend-root-changelog.sh"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

cd "$TMP"
git init -q -b main
git config user.email test@example.com
git config user.name test

cat > RELEASES.md <<'MD'
# Releases

<!-- release-index -->

MD
git add RELEASES.md
git commit -q -m "seed"

run_case() {
  local pkg="$1" ver="$2" expected_label="$3" expected_link="$4"
  "$SCRIPT" "$pkg" "$ver"
  grep -q "## .* — ${expected_label} ${ver}" RELEASES.md \
    || { echo "FAIL: ${pkg} ${ver} label line not found" >&2; exit 1; }
  grep -q "\[Release notes\](${expected_link})" RELEASES.md \
    || { echo "FAIL: ${pkg} ${ver} link not found" >&2; exit 1; }
}

# Existing packages still work after the rename.
run_case backend  0.3.0 Backend  backend/CHANGELOG.md
run_case frontend 2.0.0 Frontend frontend/CHANGELOG.md
# New packages.
run_case e2e  0.1.0 E2E  e2e/CHANGELOG.md
run_case docs 0.1.0 Docs docs/CHANGELOG.md
run_case root 0.1.0 Root CHANGELOG.md

# Invalid arg rejected.
if "$SCRIPT" bogus 1.0.0 2>/dev/null; then
  echo "FAIL: bogus package should have been rejected" >&2
  exit 1
fi

echo "OK"
```

```bash
chmod +x scripts/test-prepend-root-changelog.sh
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
./scripts/test-prepend-root-changelog.sh
```

Expected: FAIL on the first `run_case backend 0.3.0 Backend backend/CHANGELOG.md` because the script still targets `CHANGELOG.md`, not `RELEASES.md`. Output includes `FAIL: backend 0.3.0 label line not found` or the script writes to the wrong file.

- [ ] **Step 3: Replace `scripts/prepend-root-changelog.sh` with this content**

```bash
#!/usr/bin/env bash
set -euo pipefail

# Usage: scripts/prepend-root-changelog.sh <backend|frontend|e2e|docs|root> <x.y.z>
# Example: scripts/prepend-root-changelog.sh backend 0.3.0

PKG="${1:?package: backend|frontend|e2e|docs|root}"
VER="${2:?version x.y.z}"
DATE="$(date -u +%Y-%m-%d)"
ROOT="$(git rev-parse --show-toplevel)"
FILE="${ROOT}/RELEASES.md"
MARKER="<!-- release-index -->"

case "$PKG" in
  backend)  SUB="Backend";  LINK="backend/CHANGELOG.md" ;;
  frontend) SUB="Frontend"; LINK="frontend/CHANGELOG.md" ;;
  e2e)      SUB="E2E";      LINK="e2e/CHANGELOG.md" ;;
  docs)     SUB="Docs";     LINK="docs/CHANGELOG.md" ;;
  root)     SUB="Root";     LINK="CHANGELOG.md" ;;
  *) echo "package must be backend|frontend|e2e|docs|root" >&2; exit 1 ;;
esac

BLOCK=$(cat <<EOF
## ${DATE} — ${SUB} ${VER}

- [Release notes](${LINK})

EOF
)

export BLOCK
export MARKER
python3 - "$FILE" <<'PY'
import os
import sys

path = sys.argv[1]
marker = os.environ["MARKER"]
block = os.environ["BLOCK"]
with open(path, encoding="utf-8") as f:
    text = f.read()
if marker in text:
    text = text.replace(marker, marker + "\n\n" + block, 1)
else:
    text = block + text
with open(path, "w", encoding="utf-8") as f:
    f.write(text)
PY
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
./scripts/test-prepend-root-changelog.sh
```

Expected: `OK`.

- [ ] **Step 5: Commit**

```bash
git add scripts/prepend-root-changelog.sh scripts/test-prepend-root-changelog.sh
git commit -m "feat(root): extend release-index prepend script to five packages"
```

---

### Task 2: Rename `CHANGELOG.md` → `RELEASES.md`; update backend + frontend workflows

**Files:**
- Rename: `CHANGELOG.md` → `RELEASES.md`
- Modify: `RELEASES.md` (header rewrite)
- Modify: `.github/workflows/release-backend.yml`
- Modify: `.github/workflows/release-frontend.yml`

Task 2 is a single atomic rename. The two existing workflows get a one-line swap now; they will be deleted in Task 7 once `release.yml` is in place.

- [ ] **Step 1: Rename the file preserving git history**

```bash
git mv CHANGELOG.md RELEASES.md
```

- [ ] **Step 2: Rewrite the header of `RELEASES.md`**

Replace the top of `RELEASES.md` (everything above `<!-- release-index -->`) with:

```markdown
# Releases

Chronological index of package releases (newest first). Detailed notes live in:

- [Root](CHANGELOG.md)
- [Backend](backend/CHANGELOG.md)
- [Frontend](frontend/CHANGELOG.md)
- [E2E](e2e/CHANGELOG.md)
- [Docs](docs/CHANGELOG.md)

<!-- release-index -->
```

Leave everything below `<!-- release-index -->` untouched so the existing Frontend 1.0.0 / 1.1.0 / 1.2.0 entries are preserved verbatim.

- [ ] **Step 3: Update `.github/workflows/release-backend.yml`**

In the "Prepend root changelog index" step, change the two `CHANGELOG.md` references to `RELEASES.md`:

```yaml
          ./scripts/prepend-root-changelog.sh backend "$VER"
          git add RELEASES.md
          git diff --staged --quiet || git commit -m "docs: update root changelog index for backend ${VER} [skip ci]"
```

- [ ] **Step 4: Update `.github/workflows/release-frontend.yml`**

Same swap in its "Prepend root changelog index" step:

```yaml
          ./scripts/prepend-root-changelog.sh frontend "$VER_AFTER"
          git add RELEASES.md
          git diff --staged --quiet || git commit -m "docs: update root changelog index for frontend ${VER_AFTER} [skip ci]"
```

- [ ] **Step 5: Commit**

```bash
git add RELEASES.md .github/workflows/release-backend.yml .github/workflows/release-frontend.yml
git commit -m "refactor(root): rename changelog index to RELEASES.md"
```

---

### Task 3: Create new repo-root `CHANGELOG.md` (root-line stub)

**Files:**
- Create: `CHANGELOG.md`

- [ ] **Step 1: Create `CHANGELOG.md`**

```markdown
# Changelog

All notable changes to repository-level files (CI, tooling, docs at the repo root, Makefile, Procfile, scripts, `.github/`, `.claude/`, and anything else outside `backend/`, `frontend/`, `e2e/`, and `docs/`) are documented here.

Releases are automated from [Conventional Commits](https://www.conventionalcommits.org/) on the default branch and tagged `root-v{version}`.

## Unreleased

- Initial changelog; upcoming releases will appear below.
```

- [ ] **Step 2: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs(root): add root-line changelog stub"
```

---

### Task 4: Add e2e release config and changelog

**Files:**
- Modify: `e2e/package.json`
- Create: `e2e/release.config.cjs`
- Create: `e2e/CHANGELOG.md`
- Refresh: `e2e/package-lock.json`

- [ ] **Step 1: Edit `e2e/package.json`** — **merge** into existing contents; do **not** remove `@playwright/test` or other existing fields.

Add to `scripts`:

```json
    "release": "semantic-release"
```

Merge into `devDependencies`:

```json
    "@semantic-release/changelog": "^6.0.0",
    "@semantic-release/commit-analyzer": "^13.0.0",
    "@semantic-release/git": "^10.0.0",
    "@semantic-release/github": "^11.0.0",
    "@semantic-release/npm": "^12.0.0",
    "@semantic-release/release-notes-generator": "^14.0.0",
    "semantic-release": "^24.0.0",
    "semantic-release-commit-filter": "^1.0.2"
```

Final shape (for reference, with existing content kept intact):

```json
{
  "name": "slotflow-e2e",
  "private": true,
  "type": "module",
  "version": "0.0.1",
  "engines": { "node": ">=24" },
  "scripts": {
    "test": "playwright test",
    "release": "semantic-release"
  },
  "devDependencies": {
    "@playwright/test": "1.57.0",
    "@semantic-release/changelog": "^6.0.0",
    "@semantic-release/commit-analyzer": "^13.0.0",
    "@semantic-release/git": "^10.0.0",
    "@semantic-release/github": "^11.0.0",
    "@semantic-release/npm": "^12.0.0",
    "@semantic-release/release-notes-generator": "^14.0.0",
    "semantic-release": "^24.0.0",
    "semantic-release-commit-filter": "^1.0.2"
  }
}
```

Add a `"version": "0.0.1"` field if the file has no `version` key yet. This is the source of truth semantic-release reads and writes.

- [ ] **Step 2: Create `e2e/release.config.cjs`**

```javascript
/**
 * Run from repository root: cd e2e && npx semantic-release
 * semantic-release-commit-filter restricts commits to this directory.
 */
module.exports = {
  branches: ["main"],
  extends: ["semantic-release-commit-filter"],
  tagFormat: "e2e-v${version}",
  plugins: [
    "@semantic-release/commit-analyzer",
    "@semantic-release/release-notes-generator",
    "@semantic-release/changelog",
    ["@semantic-release/npm", { npmPublish: false }],
    "@semantic-release/git",
    "@semantic-release/github",
  ],
};
```

- [ ] **Step 3: Create `e2e/CHANGELOG.md`**

```markdown
# Changelog

All notable changes to the Slotflow CRM end-to-end test harness are documented here.

Releases are automated from [Conventional Commits](https://www.conventionalcommits.org/) on the default branch and tagged `e2e-v{version}`.

## Unreleased

- Initial changelog; upcoming releases will appear below.
```

- [ ] **Step 4: Refresh the lockfile**

```bash
cd e2e && npm install && cd ..
```

Expected: `e2e/package-lock.json` updated with the semantic-release deps.

- [ ] **Step 5: Commit**

```bash
git add e2e/package.json e2e/package-lock.json e2e/release.config.cjs e2e/CHANGELOG.md
git commit -m "feat(e2e): add semantic-release configuration and changelog stub"
```

---

### Task 5: Add docs release tooling

**Files:**
- Create: `docs/package.json`
- Create: `docs/release.config.cjs`
- Create: `docs/CHANGELOG.md`
- Create: `docs/package-lock.json` (via `npm install`)

- [ ] **Step 1: Create `docs/package.json`**

```json
{
  "name": "slotflow-docs",
  "private": true,
  "version": "0.0.1",
  "description": "Documentation release tooling — not an npm package.",
  "engines": { "node": ">=24" },
  "scripts": {
    "release": "semantic-release"
  },
  "devDependencies": {
    "@semantic-release/changelog": "^6.0.0",
    "@semantic-release/commit-analyzer": "^13.0.0",
    "@semantic-release/git": "^10.0.0",
    "@semantic-release/github": "^11.0.0",
    "@semantic-release/npm": "^12.0.0",
    "@semantic-release/release-notes-generator": "^14.0.0",
    "semantic-release": "^24.0.0",
    "semantic-release-commit-filter": "^1.0.2"
  }
}
```

- [ ] **Step 2: Create `docs/release.config.cjs`**

```javascript
/**
 * Run from repository root: cd docs && npx semantic-release
 * semantic-release-commit-filter restricts commits to this directory.
 */
module.exports = {
  branches: ["main"],
  extends: ["semantic-release-commit-filter"],
  tagFormat: "docs-v${version}",
  plugins: [
    "@semantic-release/commit-analyzer",
    "@semantic-release/release-notes-generator",
    "@semantic-release/changelog",
    ["@semantic-release/npm", { npmPublish: false }],
    "@semantic-release/git",
    "@semantic-release/github",
  ],
};
```

- [ ] **Step 3: Create `docs/CHANGELOG.md`**

```markdown
# Changelog

All notable changes to Slotflow CRM documentation (specs, plans, design handoffs, and anything else under `docs/`) are documented here.

Releases are automated from [Conventional Commits](https://www.conventionalcommits.org/) on the default branch and tagged `docs-v{version}`.

## Unreleased

- Initial changelog; upcoming releases will appear below.
```

- [ ] **Step 4: Generate the lockfile**

```bash
cd docs && npm install && cd ..
```

Expected: `docs/package-lock.json` created, `node_modules/` under `docs/` (already git-ignored via repo-root rules — verify `.gitignore` catches `docs/node_modules/`; if not, add an entry).

- [ ] **Step 5: Verify `.gitignore`**

```bash
grep -E "^(docs/|\\*\\*/)?node_modules/?$|^node_modules/?$" .gitignore
```

Expected: at least one match. If `docs/node_modules/` is not ignored, append `docs/node_modules/` to `.gitignore` in this step and include it in the commit below.

- [ ] **Step 6: Commit**

```bash
git add docs/package.json docs/package-lock.json docs/release.config.cjs docs/CHANGELOG.md
# if .gitignore was updated:
git add .gitignore
git commit -m "feat(docs): add semantic-release configuration and changelog stub"
```

---

### Task 6: Create `.release/root/` tooling with TDD on the filter plugin

**Files:**
- Create: `.release/root/package.json`
- Create: `.release/root/filter-commits.cjs`
- Create: `.release/root/filter-commits.test.cjs`
- Create: `.release/root/release.config.cjs`
- Create: `.release/root/package-lock.json` (via `npm install`)

The filter plugin is the one piece of non-trivial new logic. It gets TDD.

- [ ] **Step 1: Create `.release/root/package.json`**

```json
{
  "name": "slotflow-root-release",
  "private": true,
  "version": "0.0.1",
  "description": "Isolated toolchain for the root release line — not an npm package.",
  "engines": { "node": ">=24" },
  "scripts": {
    "release": "semantic-release",
    "test": "node --test"
  },
  "devDependencies": {
    "@semantic-release/changelog": "^6.0.0",
    "@semantic-release/commit-analyzer": "^13.0.0",
    "@semantic-release/git": "^10.0.0",
    "@semantic-release/github": "^11.0.0",
    "@semantic-release/npm": "^12.0.0",
    "@semantic-release/release-notes-generator": "^14.0.0",
    "execa": "^9.0.0",
    "semantic-release": "^24.0.0"
  }
}
```

- [ ] **Step 2: Install dependencies**

```bash
mkdir -p .release/root
cd .release/root && npm install && cd ../..
```

Expected: `.release/root/package-lock.json` created; `.release/root/node_modules/` populated. Ensure `.release/root/node_modules/` is ignored by `.gitignore` (add an entry if not).

- [ ] **Step 3: Write the failing test at `.release/root/filter-commits.test.cjs`**

```javascript
const test = require("node:test");
const assert = require("node:assert/strict");
const { shouldIncludeCommit } = require("./filter-commits.cjs");

test("commits entirely under backend/ are excluded", () => {
  assert.equal(shouldIncludeCommit(["backend/config/settings/base.py"]), false);
  assert.equal(shouldIncludeCommit(["backend/core/tests/views/healthz_test.py", "backend/pyproject.toml"]), false);
});

test("commits entirely under frontend/ are excluded", () => {
  assert.equal(shouldIncludeCommit(["frontend/src/App.tsx"]), false);
});

test("commits entirely under e2e/ are excluded", () => {
  assert.equal(shouldIncludeCommit(["e2e/tests/smoke.spec.ts"]), false);
});

test("commits entirely under docs/ are excluded", () => {
  assert.equal(shouldIncludeCommit(["docs/superpowers/plans/foo.md"]), false);
});

test("commits touching only RELEASES.md are excluded", () => {
  assert.equal(shouldIncludeCommit(["RELEASES.md"]), false);
});

test("commits touching repo-root files are included", () => {
  assert.equal(shouldIncludeCommit(["Makefile"]), true);
  assert.equal(shouldIncludeCommit(["CLAUDE.md"]), true);
  assert.equal(shouldIncludeCommit([".github/workflows/release.yml"]), true);
  assert.equal(shouldIncludeCommit([".claude/settings.local.json"]), true);
});

test("mixed commits with at least one root-side file are included", () => {
  assert.equal(shouldIncludeCommit(["backend/config/base.py", "Makefile"]), true);
  assert.equal(shouldIncludeCommit(["docs/README.md", "AGENTS.md"]), true);
  assert.equal(shouldIncludeCommit(["RELEASES.md", "CHANGELOG.md"]), true);
});

test("empty file list is excluded", () => {
  assert.equal(shouldIncludeCommit([]), false);
});
```

- [ ] **Step 4: Run the test to verify it fails**

```bash
cd .release/root && npm test && cd ../..
```

Expected: FAIL with `Cannot find module './filter-commits.cjs'`.

- [ ] **Step 5: Implement `.release/root/filter-commits.cjs`**

```javascript
/**
 * Local semantic-release plugin for the "root" release line.
 *
 * Wraps @semantic-release/commit-analyzer and @semantic-release/release-notes-generator,
 * filtering out any commit whose changed files all live under an excluded prefix.
 * The root line should only react to changes at the repository root — everything that
 * is NOT backend/, frontend/, e2e/, docs/, or the RELEASES.md index file.
 */
const analyzer = require("@semantic-release/commit-analyzer");
const notes = require("@semantic-release/release-notes-generator");

const EXCLUDED_PREFIXES = ["backend/", "frontend/", "e2e/", "docs/"];
const EXCLUDED_EXACT = new Set(["RELEASES.md"]);

function shouldIncludeCommit(files) {
  for (const f of files) {
    if (EXCLUDED_EXACT.has(f)) continue;
    if (EXCLUDED_PREFIXES.some((p) => f.startsWith(p))) continue;
    return true;
  }
  return false;
}

async function filesForCommit(cwd, hash) {
  const { execa } = await import("execa");
  const { stdout } = await execa(
    "git",
    ["diff-tree", "--no-commit-id", "--name-only", "-r", hash],
    { cwd },
  );
  return stdout.split("\n").filter(Boolean);
}

async function filterCommits(context) {
  const { cwd, commits } = context;
  const keep = [];
  for (const commit of commits) {
    const files = await filesForCommit(cwd, commit.hash);
    if (shouldIncludeCommit(files)) keep.push(commit);
  }
  return keep;
}

async function analyzeCommits(pluginConfig, context) {
  const filtered = await filterCommits(context);
  return analyzer.analyzeCommits(pluginConfig, { ...context, commits: filtered });
}

async function generateNotes(pluginConfig, context) {
  const filtered = await filterCommits(context);
  return notes.generateNotes(pluginConfig, { ...context, commits: filtered });
}

module.exports = {
  analyzeCommits,
  generateNotes,
  shouldIncludeCommit,
  filterCommits,
  filesForCommit,
};
```

- [ ] **Step 6: Run the test to verify it passes**

```bash
cd .release/root && npm test && cd ../..
```

Expected: PASS (8 subtests ok).

- [ ] **Step 7: Create `.release/root/release.config.cjs`**

Paths resolve from this file's directory (`.release/root/`). The repo-root `CHANGELOG.md` is at `../../CHANGELOG.md`.

```javascript
/**
 * Run from repo root: cd .release/root && npx semantic-release
 *
 * Writes the root-line notes to the repo-root CHANGELOG.md and commits it along with
 * the local package.json version bump. The filter plugin excludes commits whose files
 * are all under backend/, frontend/, e2e/, docs/, or equal to RELEASES.md.
 */
const filter = require("./filter-commits.cjs");

module.exports = {
  branches: ["main"],
  tagFormat: "root-v${version}",
  plugins: [
    [filter, {}],
    ["@semantic-release/changelog", { changelogFile: "../../CHANGELOG.md" }],
    ["@semantic-release/npm", { npmPublish: false }],
    [
      "@semantic-release/git",
      {
        assets: ["../../CHANGELOG.md", "package.json", "package-lock.json"],
        message:
          "chore(release): root ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}",
      },
    ],
    "@semantic-release/github",
  ],
};
```

**Why the filter plugin is the first entry:** semantic-release treats the first plugin that exports `analyzeCommits` as the analyzer, and the first that exports `generateNotes` as the notes generator. The local filter module exports both, so it replaces the stock plugins entirely — internally it still calls them, but with a pre-filtered commit list.

- [ ] **Step 8: Commit**

```bash
git add .release/root/package.json .release/root/package-lock.json \
        .release/root/filter-commits.cjs .release/root/filter-commits.test.cjs \
        .release/root/release.config.cjs
# if .gitignore was updated:
git add .gitignore
git commit -m "feat(root): add isolated root-line release tooling with path-filter plugin"
```

---

### Task 7: Create consolidated `.github/workflows/release.yml`; delete old release workflows

**Files:**
- Create: `.github/workflows/release.yml`
- Delete: `.github/workflows/release-backend.yml`
- Delete: `.github/workflows/release-frontend.yml`

This task is one commit because the new workflow must exist and the old ones must be gone **at the same commit on `main`** — otherwise the first push after merge would race `release.yml` against the two old workflows.

- [ ] **Step 1: Create `.github/workflows/release.yml`**

```yaml
name: Release

on:
  push:
    branches: [main]
  workflow_dispatch:

concurrency:
  group: release-${{ github.ref }}
  cancel-in-progress: false

permissions:
  contents: write
  issues: write
  pull-requests: write

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
        with:
          fetch-depth: 0
          persist-credentials: true

      - name: Configure git identity
        run: |
          git config user.name github-actions
          git config user.email github-actions@users.noreply.github.com

      - uses: actions/setup-node@v6
        with:
          node-version-file: ".nvmrc"
          cache: npm

      # --- Backend ---
      - name: Python Semantic Release (backend)
        id: backend
        uses: python-semantic-release/python-semantic-release@v10.5.3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          directory: backend
          git_committer_name: github-actions
          git_committer_email: github-actions@users.noreply.github.com

      - name: Prepend RELEASES.md for backend
        if: success() && steps.backend.outputs.released == 'true'
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          git fetch origin main
          git checkout main
          git pull --rebase origin main
          VER="${{ steps.backend.outputs.version }}"
          ./scripts/prepend-root-changelog.sh backend "$VER"
          git add RELEASES.md
          git diff --staged --quiet || git commit -m "docs: update root changelog index for backend ${VER} [skip ci]"
          git push origin main

      # --- Frontend ---
      - name: Record frontend version on main
        id: frontend_before
        run: |
          git fetch origin main
          echo "ver=$(git show origin/main:frontend/package.json | node -p 'JSON.parse(require("fs").readFileSync(0,"utf8")).version')" >> "$GITHUB_OUTPUT"

      - name: Install frontend deps
        working-directory: frontend
        run: npm ci

      - name: Run semantic-release (frontend)
        working-directory: frontend
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: npx semantic-release

      - name: Prepend RELEASES.md for frontend
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          git fetch origin main
          git checkout main
          git pull --rebase origin main
          VER_AFTER=$(node -p "require('./frontend/package.json').version")
          if [ "${{ steps.frontend_before.outputs.ver }}" = "$VER_AFTER" ]; then
            echo "No frontend version bump; skipping root index update"
            exit 0
          fi
          ./scripts/prepend-root-changelog.sh frontend "$VER_AFTER"
          git add RELEASES.md
          git diff --staged --quiet || git commit -m "docs: update root changelog index for frontend ${VER_AFTER} [skip ci]"
          git push origin main

      # --- E2E ---
      - name: Record e2e version on main
        id: e2e_before
        run: |
          git fetch origin main
          echo "ver=$(git show origin/main:e2e/package.json | node -p 'JSON.parse(require("fs").readFileSync(0,"utf8")).version')" >> "$GITHUB_OUTPUT"

      - name: Install e2e deps
        working-directory: e2e
        run: npm ci

      - name: Run semantic-release (e2e)
        working-directory: e2e
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: npx semantic-release

      - name: Prepend RELEASES.md for e2e
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          git fetch origin main
          git checkout main
          git pull --rebase origin main
          VER_AFTER=$(node -p "require('./e2e/package.json').version")
          if [ "${{ steps.e2e_before.outputs.ver }}" = "$VER_AFTER" ]; then
            echo "No e2e version bump; skipping root index update"
            exit 0
          fi
          ./scripts/prepend-root-changelog.sh e2e "$VER_AFTER"
          git add RELEASES.md
          git diff --staged --quiet || git commit -m "docs: update root changelog index for e2e ${VER_AFTER} [skip ci]"
          git push origin main

      # --- Docs ---
      - name: Record docs version on main
        id: docs_before
        run: |
          git fetch origin main
          echo "ver=$(git show origin/main:docs/package.json | node -p 'JSON.parse(require("fs").readFileSync(0,"utf8")).version')" >> "$GITHUB_OUTPUT"

      - name: Install docs deps
        working-directory: docs
        run: npm ci

      - name: Run semantic-release (docs)
        working-directory: docs
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: npx semantic-release

      - name: Prepend RELEASES.md for docs
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          git fetch origin main
          git checkout main
          git pull --rebase origin main
          VER_AFTER=$(node -p "require('./docs/package.json').version")
          if [ "${{ steps.docs_before.outputs.ver }}" = "$VER_AFTER" ]; then
            echo "No docs version bump; skipping root index update"
            exit 0
          fi
          ./scripts/prepend-root-changelog.sh docs "$VER_AFTER"
          git add RELEASES.md
          git diff --staged --quiet || git commit -m "docs: update root changelog index for docs ${VER_AFTER} [skip ci]"
          git push origin main

      # --- Root ---
      - name: Record root version on main
        id: root_before
        run: |
          git fetch origin main
          echo "ver=$(git show origin/main:.release/root/package.json | node -p 'JSON.parse(require("fs").readFileSync(0,"utf8")).version')" >> "$GITHUB_OUTPUT"

      - name: Install root deps
        working-directory: .release/root
        run: npm ci

      - name: Run semantic-release (root)
        working-directory: .release/root
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: npx semantic-release

      - name: Prepend RELEASES.md for root
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          git fetch origin main
          git checkout main
          git pull --rebase origin main
          VER_AFTER=$(node -p "require('./.release/root/package.json').version")
          if [ "${{ steps.root_before.outputs.ver }}" = "$VER_AFTER" ]; then
            echo "No root version bump; skipping root index update"
            exit 0
          fi
          ./scripts/prepend-root-changelog.sh root "$VER_AFTER"
          git add RELEASES.md
          git diff --staged --quiet || git commit -m "docs: update root changelog index for root ${VER_AFTER} [skip ci]"
          git push origin main
```

- [ ] **Step 2: Delete the two old workflow files**

```bash
git rm .github/workflows/release-backend.yml
git rm .github/workflows/release-frontend.yml
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci(root): consolidate five release lines into a single serial workflow"
```

---

### Task 8: Audit and update references in root docs

**Files:**
- Modify: `AGENTS.md` (only if it mentions `CHANGELOG.md` as the index)
- Modify: `CLAUDE.md` (same)
- Modify: any other root-level doc that references the index location

- [ ] **Step 1: Search for references**

```bash
grep -rln "CHANGELOG\.md" AGENTS.md CLAUDE.md DESIGN.md README.md 2>/dev/null || true
```

- [ ] **Step 2: For each match**, decide whether the reference means "the index" (update to `RELEASES.md`) or "a package changelog" (leave as-is, specifying which package's file). The project CLAUDE.md mentions release automation; verify its wording is still accurate post-consolidation (it talks about `python-semantic-release` and `semantic-release` driven by scopes — all still true; no edits needed unless the wording references specific workflow filenames).

- [ ] **Step 3: Apply edits only where needed.** If no edits, skip commit and move on.

- [ ] **Step 4: Commit (if edits were made)**

```bash
git add AGENTS.md CLAUDE.md
git commit -m "docs(root): update index references for RELEASES.md rename"
```

---

### Task 9: Post-merge seed tags (documented operator action)

**Files:**
- None (Git operations only, executed by a human after the PR merges)

The first CI run after merge **must not** find an empty tag history for the three new lines, or semantic-release will ingest the entire repo history into the first changelog. Seed tags solve this, but they can only be applied at or after the merge commit — so this task is an instruction block for whoever merges the PR, not an automated step.

- [ ] **Step 1: Document these commands in the PR body** so the merger runs them immediately after clicking "Merge":

```bash
git fetch origin --tags
git checkout main
git pull --ff-only origin main

# Seed at the merge commit (HEAD of main right after the merge)
git tag -a e2e-v0.0.1  -m "chore(release): seed e2e release line"
git tag -a docs-v0.0.1 -m "chore(release): seed docs release line"
git tag -a root-v0.0.1 -m "chore(release): seed root release line"
git push origin e2e-v0.0.1 docs-v0.0.1 root-v0.0.1
```

- [ ] **Step 2: No repo commit.** This task tracks a *push* of tags, not a code change.

---

### Task 10: Verification after seed tags land

**Files:**
- None

Run through the spec's verification checklist. Each check is a smoke test — if any fails, open a follow-up issue with the exact failure.

- [ ] **Step 1: Confirm seed tags exist**

```bash
git fetch origin --tags
git tag -l "e2e-v*" "docs-v*" "root-v*"
```

Expected: exactly `e2e-v0.0.1`, `docs-v0.0.1`, `root-v0.0.1`.

- [ ] **Step 2: `feat` touching only `e2e/`**

Open a trivial PR adding a comment to any file under `e2e/` with a `feat(e2e):` commit message. After merge, confirm:
- `e2e-v0.1.0` tag exists.
- `e2e/CHANGELOG.md` gained a section at the top.
- `RELEASES.md` gained a new entry linking to `e2e/CHANGELOG.md`.
- Backend / frontend / docs / root version numbers unchanged.

- [ ] **Step 3: `feat` touching only `docs/`**

Same exercise, with a `feat(docs):` commit under `docs/`. Expect `docs-v0.1.0`.

- [ ] **Step 4: `feat` touching only `Makefile`**

Commit a trivial change to `Makefile` as `feat(root):` (or any scope; path decides). Expect `root-v0.1.0`; the entry lands in **repo-root `CHANGELOG.md`**; `RELEASES.md` gains a matching line.

- [ ] **Step 5: Multi-package commit**

Single commit touching `backend/foo.py` and `Makefile`. Expect **both** `backend-v*` and `root-v*` to bump; `RELEASES.md` gets two new entries for the same date.

- [ ] **Step 6: Index anchors resolve**

Click through the links in `RELEASES.md` on GitHub's rendered view and confirm each lands on the expected section of the target changelog. (Anchor fragments are not computed today; links go to the file root, which is fine — this step just confirms the link itself isn't broken.)

- [ ] **Step 7: GitHub Releases page shows all five prefixes**

Visit `https://github.com/<owner>/<repo>/releases` and confirm releases are listed with `backend-v*`, `frontend-v*`, `e2e-v*`, `docs-v*`, and `root-v*` tags.

---

## Plan self-review

**Spec coverage:**

| Spec section | Task |
|--------------|------|
| Goal 1 (three new release lines) | Tasks 4, 5, 6 |
| Goal 2 (path-based routing) | Task 4 (commit-filter), Task 5 (commit-filter), Task 6 (filter plugin) |
| Goal 3 (single serial workflow) | Task 7 |
| Goal 4 (`CHANGELOG.md` → `RELEASES.md` rename) | Task 2 |
| Goal 5 (preserve backend/frontend) | Task 2 (workflow swap limited to one line each), Task 7 (keeps PSR action + frontend BEFORE/AFTER pattern verbatim) |
| §5 version seeds | Task 9 |
| §6 file layout | Tasks 2, 3, 4, 5, 6, 7 |
| §7 commit routing incl. `RELEASES.md` exclusion | Task 6 (filter plugin test covers `RELEASES.md`) |
| §8 workflow shape | Task 7 |
| §10 edge cases | All covered by the routing logic tests (Task 6) and the verification steps (Task 10) |
| §11 verification | Task 10 |

**Placeholder scan:** Task 8 contains conditional edits ("if no edits, skip commit"). That is acceptable — the condition is observable (`grep` output) and the skip path is explicit, not a TBD.

**Type consistency:**
- `shouldIncludeCommit(files: string[]): boolean` — used with the same signature in tests and in `filterCommits`.
- Prepend script argument order `<package> <version>` — consistent across Task 1 test cases, Task 7 workflow steps, and Task 10 verification.
- Tag format strings (`e2e-v{version}` etc.) — consistent across package configs (Tasks 4, 5, 6), seed tags (Task 9), and verification (Task 10).

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-18-five-package-releases.md`. Two execution options:

**1. Subagent-driven (recommended)** — Dispatch a fresh subagent per task, review between tasks, fast iteration. **REQUIRED SUB-SKILL:** superpowers:subagent-driven-development.

**2. Inline execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints. **REQUIRED SUB-SKILL:** superpowers:executing-plans.

Which approach do you want?
