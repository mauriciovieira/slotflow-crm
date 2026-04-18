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
