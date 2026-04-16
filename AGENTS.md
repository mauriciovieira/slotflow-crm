# Agent Instructions

These instructions apply to all AI coding agents working in this repository (including Cursor agents and Claude-based agents).

## Global Rules

1. For all new Superpowers brainstorming sessions, always use Git worktrees located under `.worktrees/` in this repository.
2. Always use semantic commit messages (Conventional Commits style), for example: `feat: ...`, `fix: ...`, `docs: ...`, `chore: ...`.
3. Keep local Git state aligned with GitHub: fetch from `origin` with pruning, and delete local branches whose copies were merged and removed on the remote.

### Sync and prune

After a PR is merged and the remote branch is deleted on GitHub, drop stale remote-tracking refs and remove the corresponding local branch when it is safe.

**Fetch (use whenever you need latest refs or before branching from `main`):**

```bash
git fetch origin --prune
```

`--prune` removes `origin/<branch>` entries when that branch no longer exists on GitHub. To make this the default for all remotes: `git config fetch.prune true` (repo or global).

**Delete merged local branches whose upstream is gone** (typical after “delete branch” on merge):

```bash
git fetch origin --prune
git branch -vv | awk '/: gone]/{print ($1 == "*" ? $2 : $1)}' | while read -r b; do
  git branch -d "$b" || echo "skip $b (not fully merged locally — inspect before git branch -D)"
done
```

`git branch -d` refuses if the commit is not merged into the current HEAD; that protects against deleting work that still exists only on the local branch. If you removed a worktree for that branch already, delete the branch only after you are sure the work landed on `main` (or cherry-pick / recover commits first).

**Optional:** remove a linked worktree before deleting its branch: `git worktree remove <path>` (see Git docs), then delete the branch as above.

## Pull requests from worktrees (`gh`)

When a branch in a worktree is **ready for review**, open a PR with the GitHub CLI using the shared body template. **Ready for review** means: tests pass for that worktree, the change is complete enough for feedback (not a draft unless explicitly a draft PR), and the branch is pushed to `origin`.

**Always ship a real PR description—never boilerplate.** Before you run `gh pr create`, the body must be fully written for *this* change: every section filled with specifics, placeholders and instructional comments removed, lone `-` bullets replaced, and the test plan checked or explained. Using the template file as `--body-file` is not done until that file reads like a finished review note, not an outline. If a PR was opened with empty or generic text, fix it immediately with `gh pr edit <number> --body-file <path>` (or edit in the GitHub UI)—do not leave default template text on the PR.

### Template

- Start from `.github/WORKFLOW_TEMPLATES/pull_request.md` and complete it in your worktree before invoking `gh`.
- Use `--body-file` with that path (or a copy) so structure stays consistent; the file on disk must already contain the final prose for reviewers.

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

Replace the title prefix (`feat`, `fix`, `docs`, …). Do not run `gh pr create` until `$BODY` is fully filled (see **Always ship a real PR description** above).

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
    echo "skip $branch ($wt_path): not based on origin/$BASE (git fetch origin --prune, then merge or rebase)"
    continue
  fi

  existing=$(gh pr list --head "$branch" --json number --jq 'length')
  if [ "${existing:-0}" -ne 0 ]; then
    echo "skip $branch: PR already exists"
    continue
  fi

  if ! git push -u origin "$branch"; then
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

- If `origin/$BASE` is missing locally, run `git fetch origin --prune` first (see **Sync and prune** above).
- For draft PRs, add `--draft` to `gh pr create`.
- To open the PR in the browser: add `--web` or run `gh pr view --web` after creation.
- To replace an underfilled body after the fact: `gh pr edit <number> --body-file path/to/completed.md`.

