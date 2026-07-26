#!/usr/bin/env bash
# Optional startup hooks for Cursor Cloud agents.
set -euo pipefail

# Start Docker when available so compose-based full-stack tests can run.
if command -v dockerd >/dev/null 2>&1 || [[ -x /usr/bin/dockerd ]]; then
  if ! docker info >/dev/null 2>&1; then
    echo "==> Starting Docker daemon"
    sudo service docker start || sudo dockerd >/tmp/dockerd.log 2>&1 &
    for _ in $(seq 1 30); do
      if docker info >/dev/null 2>&1; then
        echo "==> Docker is ready"
        break
      fi
      sleep 1
    done
  fi
else
  echo "==> Docker not installed; UI work can use npm run dev. Full stack needs Docker."
fi
