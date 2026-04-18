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
