#!/usr/bin/env bash
# Integration test for scripts/prepend-root-changelog.sh.
# Creates a throwaway git repo, seeds a RELEASES.md, invokes the script
# once per supported package, and checks the output.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPT="${REPO_ROOT}/scripts/prepend-root-changelog.sh"

TMP="$(mktemp -d)"
TMP2="$(mktemp -d)"
trap 'rm -rf "$TMP" "$TMP2"' EXIT

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

# Test the no-marker fallback path.
cd "$TMP2"
git init -q -b main
git config user.email test@example.com
git config user.name test
printf '# Releases\n\nPre-existing content.\n' > RELEASES.md
git add RELEASES.md
git commit -q -m "seed"
"$SCRIPT" root 9.9.9
grep -q "^## .* — Root 9.9.9$" RELEASES.md \
  || { echo "FAIL: no-marker fallback heading missing" >&2; exit 1; }
# Confirm pre-existing content still appears on its own line, not glued to the injected block.
grep -q "^# Releases$" RELEASES.md \
  || { echo "FAIL: pre-existing heading got corrupted by fallback" >&2; exit 1; }

echo "OK"
