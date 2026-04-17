#!/usr/bin/env bash
set -euo pipefail

# Usage: scripts/prepend-root-changelog.sh <backend|frontend> <x.y.z>
# Example: scripts/prepend-root-changelog.sh backend 0.3.0

PKG="${1:?package: backend or frontend}"
VER="${2:?version x.y.z}"
DATE="$(date -u +%Y-%m-%d)"
ROOT="$(git rev-parse --show-toplevel)"
FILE="${ROOT}/CHANGELOG.md"
MARKER="<!-- release-index -->"

case "$PKG" in
  backend) SUB="Backend"; REL="backend" ;;
  frontend) SUB="Frontend"; REL="frontend" ;;
  *) echo "package must be backend or frontend" >&2; exit 1 ;;
esac

# Link to the package changelog (avoid guessing heading fragments; PSR/SR heading formats vary).
BLOCK=$(cat <<EOF
## ${DATE} — ${SUB} ${VER}

- [Release notes](${REL}/CHANGELOG.md)

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
    text = block + text
with open(path, "w", encoding="utf-8") as f:
    f.write(text)
PY
