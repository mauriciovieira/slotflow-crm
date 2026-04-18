const test = require("node:test");
const assert = require("node:assert/strict");
const { shouldIncludeCommit } = require("./filter-commits.cjs");

test("commits entirely under backend/ are excluded", () => {
  assert.equal(shouldIncludeCommit(["backend/config/settings/base.py"]), false);
  assert.equal(shouldIncludeCommit(["backend/tests/test_healthz.py", "backend/pyproject.toml"]), false);
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
