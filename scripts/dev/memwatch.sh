#!/usr/bin/env bash
# Lightweight memory watcher for local development.
# Logs memory, load and top RSS consumers so a post-crash analysis can
# identify runaway processes. Run: nohup scripts/dev/memwatch.sh &
# Log: logs/memwatch.log (gitignored)
set -u

INTERVAL="${MEMWATCH_INTERVAL:-2}"
LOG="$(dirname "$0")/../../logs/memwatch.log"
mkdir -p "$(dirname "$LOG")"

echo "=== memwatch started $(date -Is) interval=${INTERVAL}s ===" >> "$LOG"

while true; do
    ts="$(date -Is)"
    mem="$(free -m | awk '/^Mem:/ {printf "used=%sMB free=%sMB avail=%sMB", $3, $4, $7}')"
    load="$(cut -d' ' -f1-3 /proc/loadavg)"
    top="$(ps -eo rss=,comm= --sort=-rss | head -5 | awk '{printf "%s(%sMB) ", $2, int($1/1024)}')"
    echo "$ts $mem load=$load top=$top" >> "$LOG"
    sleep "$INTERVAL"
done
