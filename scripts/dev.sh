#!/usr/bin/env bash
set -euo pipefail

# One entry point to start the full local workspace. Automatically installs
# workspace dependencies if missing, starts the backend by default, and then
# runs the Vite frontend.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ ! -d node_modules ]]; then
  echo "→ Installing workspace dependencies (npm install)..."
  npm install
fi

BACKEND_CMD="${BACKEND_CMD:-npm run dev:backend}"
FRONTEND_CMD="${FRONTEND_CMD:-npm run dev:frontend -- --host 0.0.0.0 --port ${PORT:-5173}}"

BACKEND_PID=""
cleanup() {
  if [[ -n "${BACKEND_PID}" ]]; then
    echo "→ Stopping backend (pid=${BACKEND_PID})"
    kill "${BACKEND_PID}" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

if [[ -n "${BACKEND_CMD:-}" ]]; then
  echo "→ Starting backend: ${BACKEND_CMD}"
  bash -c "${BACKEND_CMD}" &
  BACKEND_PID=$!
fi

echo "→ Starting frontend workspace"
echo "   - Override port: PORT=5174 scripts/dev.sh"
echo "   - Override backend command: BACKEND_CMD=\"npm run dev:backend\" scripts/dev.sh"
bash -c "${FRONTEND_CMD}"
