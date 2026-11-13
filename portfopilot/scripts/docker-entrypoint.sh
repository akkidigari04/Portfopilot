#!/usr/bin/env bash
set -e
MODE="${PORTFOPILOT_MODE:-starter}"
SEED="${PORTFOPILOT_SEED:-20261022}"
if [ ! -f data/generated/portfopilot.db ]; then
  echo "No database found - generating $MODE dataset (seed $SEED)..."
  python -m backend.data.generate --mode "$MODE" --seed "$SEED"
fi
exec uvicorn backend.app.main:app --host 0.0.0.0 --port 8000
