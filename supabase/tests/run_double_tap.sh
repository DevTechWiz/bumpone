#!/bin/sh
# run_double_tap.sh <start_at>
#
# Scenario D: two distinct purchases against the SAME project racing each other.
#   worker 1: quote 0x312 (786), amount 2000
#   worker 2: quote 0x313 (787), amount 3000
# Expected: both succeed (legitimate payments are never rejected by the race),
# final project value exactly 5000, two payment rows, both quotes paid.
set -u

START_AT="$1"

uuid_for() { printf '00000000-0000-4000-8000-%012x' "$1"; }
USER_ID=$(uuid_for 1)
PROJECT_ID=$(uuid_for 400)

mkdir -p /tmp/tests/logs
pids=""
fails=0
w=1

for spec in "786 2000" "787 3000"; do
  set -- $spec
  qn=$1
  amt=$2

  psql -U postgres -d bumpone -v ON_ERROR_STOP=1 -q \
    -v scenario=double_tap -v wid="$w" -v start_at="$START_AT" \
    -v event_id="evt_double_tap_${w}" -v pay_id="pay_double_tap_${w}" \
    -v amount="$amt" \
    -v quote_id="$(uuid_for "$qn")" \
    -v project_id="$PROJECT_ID" \
    -v user_id="$USER_ID" \
    -f /tmp/tests/workers/worker.sql > "/tmp/tests/logs/double_tap_${w}.log" 2>&1 &
  pids="$pids $!"
  w=$((w + 1))
done

for p in $pids; do
  if ! wait "$p"; then
    fails=$((fails + 1))
  fi
done

echo "workers_failed=$fails scenario=double_tap n=2"
[ "$fails" -eq 0 ]
