#!/bin/sh
# run_workers.sh <scenario> <fixed|range> <n> <amount> <share_event 0|1> <share_pay 0|1> <quote_n> <project_n> <start_at>
#
# Launches <n> concurrent webhook workers against process_dodo_purchase.
#   fixed: every worker uses quote uuid_for(quote_n) / project uuid_for(project_n)
#   range: worker w uses uuid_for(quote_n + w - 1) / uuid_for(project_n + w - 1)
# share_event/share_pay control whether all workers share one event/payment id
# (replay attack) or use distinct per-worker ids.
# All workers wait on the shared start_at barrier, then call the RPC together.
set -u

SCENARIO="$1"
MODE="$2"
N="$3"
AMOUNT="$4"
SHARE_EVENT="$5"
SHARE_PAY="$6"
Q="$7"
P="$8"
shift 8
START_AT="$1"

uuid_for() { printf '00000000-0000-4000-8000-%012x' "$1"; }
USER_ID=$(uuid_for 1)

mkdir -p /tmp/tests/logs
pids=""
fails=0
w=1

while [ "$w" -le "$N" ]; do
  if [ "$MODE" = "fixed" ]; then
    qn=$Q
    pn=$P
  else
    qn=$((Q + w - 1))
    pn=$((P + w - 1))
  fi
  if [ "$SHARE_EVENT" = "1" ]; then ev="evt_${SCENARIO}"; else ev="evt_${SCENARIO}_${w}"; fi
  if [ "$SHARE_PAY" = "1" ]; then pid_="pay_${SCENARIO}"; else pid_="pay_${SCENARIO}_${w}"; fi

  psql -U postgres -d bumpone -v ON_ERROR_STOP=1 -q \
    -v scenario="$SCENARIO" -v wid="$w" -v start_at="$START_AT" \
    -v event_id="$ev" -v pay_id="$pid_" -v amount="$AMOUNT" \
    -v quote_id="$(uuid_for "$qn")" \
    -v project_id="$(uuid_for "$pn")" \
    -v user_id="$USER_ID" \
    -f /tmp/tests/workers/worker.sql > "/tmp/tests/logs/${SCENARIO}_${w}.log" 2>&1 &
  pids="$pids $!"
  w=$((w + 1))
done

for p in $pids; do
  if ! wait "$p"; then
    fails=$((fails + 1))
  fi
done

echo "workers_failed=$fails scenario=$SCENARIO n=$N"
[ "$fails" -eq 0 ]
