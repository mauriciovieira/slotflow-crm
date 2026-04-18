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
    text = block + "\n" + text
with open(path, "w", encoding="utf-8") as f:
    f.write(text)
PY
