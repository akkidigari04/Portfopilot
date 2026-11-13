#!/usr/bin/env bash
# Stops any running API on :8000, optionally regenerates data, starts API in background.
cd "$(dirname "$0")/.."
for p in /proc/[0-9]*; do
  if tr '\0' ' ' < "$p/cmdline" 2>/dev/null | grep -q "uvicorn backend.app.main"; then kill "${p#/proc/}" 2>/dev/null; fi
done
sleep 1
[ "$1" = "--regen" ] && python -W ignore -m backend.data.generate --mode starter --seed 20261022 >/dev/null 2>&1
setsid nohup uvicorn backend.app.main:app --port 8000 > /tmp/api.log 2>&1 &
sleep 4; curl -s localhost:8000/health
