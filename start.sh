#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [[ -f ".env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source ".env"
  set +a
fi

PORT="${PORT:-8780}"
HOST="${HOST:-0.0.0.0}"

exec python3 server/app.py --host "$HOST" --port "$PORT"
