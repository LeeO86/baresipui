#!/usr/bin/env bash
# Idempotent update script for Cursor Cloud agents.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

echo "==> Installing npm dependencies"
if [[ -f package-lock.json ]]; then
  npm ci
else
  npm install
fi

UPSTREAM_ROOT="${UPSTREAM_ROOT:-${HOME}/upstream}"
mkdir -p "$UPSTREAM_ROOT"

clone_or_update() {
  local url="$1"
  local dest="$2"
  if [[ -d "$dest/.git" ]]; then
    echo "==> Updating $dest"
    git -C "$dest" fetch --depth 1 origin
    git -C "$dest" reset --hard origin/HEAD
  else
    echo "==> Cloning $url -> $dest"
    git clone --depth 1 "$url" "$dest"
  fi
}

# Sibling checkouts expand context for upstream feature requests / PRs.
# repositoryDependencies widens the GitHub token; this script performs the clone.
clone_or_update "https://github.com/andyweiss/baresipui.git" \
  "$UPSTREAM_ROOT/andyweiss-baresipui"
clone_or_update "https://github.com/baresip/baresip.git" \
  "$UPSTREAM_ROOT/baresip"
clone_or_update "https://github.com/baresip/re.git" \
  "$UPSTREAM_ROOT/re"

# Convenience symlink next to the primary workspace when the parent is writable.
PARENT="$(dirname "$ROOT")"
if [[ "$PARENT" != "/" && -w "$PARENT" && ! -e "$PARENT/andyweiss-baresipui" ]]; then
  ln -sfn "$UPSTREAM_ROOT/andyweiss-baresipui" "$PARENT/andyweiss-baresipui"
fi

cat <<EOF
==> Upstream checkouts ready
  andyweiss/baresipui: $UPSTREAM_ROOT/andyweiss-baresipui
  baresip/baresip:     $UPSTREAM_ROOT/baresip
  baresip/re:          $UPSTREAM_ROOT/re
EOF
