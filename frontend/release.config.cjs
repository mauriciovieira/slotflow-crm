/**
 * Run from repository root: cd frontend && npx semantic-release
 * semantic-release-commit-filter restricts commits to this directory when used via "extends".
 */
module.exports = {
  branches: ["main"],
  extends: ["semantic-release-commit-filter"],
  tagFormat: "frontend-v${version}",
  plugins: [
    "@semantic-release/commit-analyzer",
    "@semantic-release/release-notes-generator",
    "@semantic-release/changelog",
    ["@semantic-release/npm", { npmPublish: false }],
    "@semantic-release/git",
    "@semantic-release/github",
  ],
};
