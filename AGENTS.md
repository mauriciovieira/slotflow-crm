# Agent Instructions

These instructions apply to all AI coding agents working in this repository (including Cursor agents and Claude-based agents).

## Global Rules

1. For all new Superpowers brainstorming sessions, always use Git worktrees located under `.worktrees/` in this repository.
2. Always use semantic commit messages (Conventional Commits style), for example: `feat: ...`, `fix: ...`, `docs: ...`, `chore: ...`.

## Pull requests from worktrees (`gh`)

When a branch in a worktree is **ready for review**, open a PR with the GitHub CLI using the shared body template. **Ready for review** means: tests pass for that worktree, the change is complete enough for feedback (not a draft unless explicitly a draft PR), and the branch is pushed to `origin`.

### Template

- PR body template (fill in before or after `gh pr create`): `.github/WORKFLOW_TEMPLATES/pull_request.md`
- Prefer `--body-file` so the same structure is used every time; edit the file in the worktree copy of the repo before running `gh`.

### One-shot: create a PR from the current worktree

Run inside the worktree (not necessarily from the main checkout):

```bash
# Optional: confirm GitHub CLI is usable
gh auth status

BRANCH=$(git branch --show-current)
BASE="${BASE_BRANCH:-main}"   # override if the default branch is not main

git push -u origin "$BRANCH"

BODY="$(git rev-parse --show-toplevel)/.github/WORKFLOW_TEMPLATES/pull_request.md"

gh pr create \
  --base "$BASE" \
  --head "$BRANCH" \
  --title "feat: <short imperative title>" \
  --body-file "$BODY"
```

Replace the title prefix (`feat`, `fix`, `docs`, …) and edit `$BODY` so sections are accurate before running the command.

### Automate: open PRs for each review-ready worktree

From the **main repository root** (any checkout is fine), this loops over linked worktrees (skips detached HEADs), skips the base branch, pushes the branch if needed, and creates a PR only when one does not already exist for that branch:

```bash
BASE="${BASE_BRANCH:-main}"

wt_path=""
while IFS= read -r line; do
  case "$line" in
    worktree\ *) wt_path="${line#worktree }" ;;
    branch\ refs/heads/*)
      branch="${line#branch refs/heads/}"
      printf '%s\t%s\n' "$wt_path" "$branch"
      ;;
  esac
done < <(git worktree list --porcelain) | while IFS=$'\t' read -r wt_path branch; do
  [ "$branch" = "$BASE" ] && continue
  cd "$wt_path" || continue
  git rev-parse --git-dir >/dev/null 2>&1 || continue

  if ! git merge-base --is-ancestor "origin/$BASE" HEAD 2>/dev/null; then
    echo "skip $branch ($wt_path): not based on origin/$BASE (git fetch origin \"$BASE\" or rebase first)"
    continue
  fi

  existing=$(gh pr list --head "$branch" --json number --jq 'length')
  if [ "${existing:-0}" -ne 0 ]; then
    echo "skip $branch: PR already exists"
    continue
  fi

  if ! git push -u origin "$branch" 2>/dev/null; then
    echo "skip $branch: push failed (resolve errors, then re-run)"
    continue
  fi

  BODY="$(git rev-parse --show-toplevel)/.github/WORKFLOW_TEMPLATES/pull_request.md"
  echo "Creating PR for $branch from $wt_path — edit $BODY first if still generic."
  gh pr create --base "$BASE" --head "$branch" --title "feat: <title for $branch>" --body-file "$BODY"
done
```

**Before relying on the loop:** edit the template file for each branch (or run the loop only for worktrees you have already filled in), set an accurate `--title`, and run the project test suite per worktree. The loop does not run tests; it only automates push + `gh pr create` for branches that track work you have already verified.

### Notes

- If `origin/$BASE` is missing locally, run `git fetch origin "$BASE"` first.
- For draft PRs, add `--draft` to `gh pr create`.
- To open the PR in the browser: add `--web` or run `gh pr view --web` after creation.