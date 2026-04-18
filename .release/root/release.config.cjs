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
