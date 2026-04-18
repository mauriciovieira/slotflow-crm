/**
 * Run from repo root: cd .release/root && npx semantic-release
 *
 * Writes the root-line notes to the repo-root CHANGELOG.md and commits it along with
 * the local package.json version bump. The filter plugin excludes commits whose files
 * are all under backend/, frontend/, e2e/, docs/, or equal to RELEASES.md.
 *
 * Paths are absolute because @semantic-release/git passes assets through globby, which
 * does not resolve `..` above the semantic-release cwd — a relative "../../CHANGELOG.md"
 * from .release/root/ produces zero matches and the file never lands in the release
 * commit. Using path.resolve(__dirname, ...) makes the resolution explicit and deterministic.
 */
const path = require("path");
const filter = require("./filter-commits.cjs");

const rootChangelog = path.resolve(__dirname, "..", "..", "CHANGELOG.md");

module.exports = {
  branches: ["main"],
  tagFormat: "root-v${version}",
  plugins: [
    [filter, {}],
    ["@semantic-release/changelog", { changelogFile: rootChangelog }],
    ["@semantic-release/npm", { npmPublish: false }],
    [
      "@semantic-release/git",
      {
        assets: [rootChangelog, "package.json", "package-lock.json"],
        message:
          "chore(release): root ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}",
      },
    ],
    "@semantic-release/github",
  ],
};
