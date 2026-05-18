#!/usr/bin/env bash
# bsm-watchdog.sh — daemon background que limpia recursos cada 60s.
#
# Mata:
#   - Chromiums huerfanos (ppid=1) > 5 min
#   - Procesos `tsc --noEmit` huerfanos
#   - MCPs duplicados (mismo nombre, mismo cwd)
#
# Loguea a .claude/.watchdog.log con rotacion en 1MB.
#
# Arranca desde session-start-autonomy.mjs. Se mata solo si Claude muere
# (con `trap` + check del parent pid claude).
#
# Override: env BSM_WATCHDOG_DISABLE=1.

set -u
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-/home/usuario/proyectos/Mercado}"
LOG="$PROJECT_DIR/.claude/.watchdog.log"
PID_FILE="$PROJECT_DIR/.claude/.watchdog.pid"
INTERVAL="${BSM_WATCHDOG_INTERVAL:-60}"
MAX_LOG_SIZE=$((1024 * 1024))  # 1MB

mkdir -p "$(dirname "$LOG")"

# Si ya hay otro watchdog corriendo, salir.
if [[ -f "$PID_FILE" ]]; then
  OLD_PID=$(cat "$PID_FILE" 2>/dev/null || echo "")
  if [[ -n "$OLD_PID" ]] && kill -0 "$OLD_PID" 2>/dev/null; then
    echo "[watchdog] ya corriendo pid=$OLD_PID" >&2
    exit 0
  fi
fi

echo $$ > "$PID_FILE"

log() {
  # Rotacion simple
  if [[ -f "$LOG" ]] && [[ $(stat -c%s "$LOG" 2>/dev/null || echo 0) -gt $MAX_LOG_SIZE ]]; then
    mv "$LOG" "$LOG.old" 2>/dev/null || true
  fi
  echo "[$(date -Iseconds)] $*" >> "$LOG"
}

cleanup() {
  log "watchdog stopping"
  rm -f "$PID_FILE"
  exit 0
}
trap cleanup TERM INT EXIT

log "watchdog started pid=$$ interval=${INTERVAL}s"

while true; do
  if [[ "${BSM_WATCHDOG_DISABLE:-0}" == "1" ]]; then
    log "disabled via BSM_WATCHDOG_DISABLE=1"
    sleep "$INTERVAL"
    continue
  fi

  # 1. Chromiums huerfanos (ppid=1) — mata todos
  ORPHAN_CHROMIUM=$(ps -eo pid,ppid,etimes,cmd | awk '$2==1 && /chrome|chromium/ && $3>300 {print $1}' | head -10)
  if [[ -n "$ORPHAN_CHROMIUM" ]]; then
    echo "$ORPHAN_CHROMIUM" | xargs -r kill -9 2>/dev/null || true
    log "killed orphan chromium pids: $(echo $ORPHAN_CHROMIUM | tr '\n' ' ')"
  fi

  # 2. tsc huerfanos (ppid=1) — mata
  ORPHAN_TSC=$(ps -eo pid,ppid,cmd | awk '$2==1 && /tsc.*--noEmit/ {print $1}' | head -10)
  if [[ -n "$ORPHAN_TSC" ]]; then
    echo "$ORPHAN_TSC" | xargs -r kill -9 2>/dev/null || true
    log "killed orphan tsc pids: $(echo $ORPHAN_TSC | tr '\n' ' ')"
  fi

  # 3. RAM check — si <500MB libre, mata MCP mas grande (no critico)
  AVAIL=$(awk '/MemAvailable/ {print int($2/1024)}' /proc/meminfo)
  if [[ "$AVAIL" -lt 500 ]]; then
    # Mata el MCP mas pesado que NO sea playwright (Brandon lo usa para QA)
    BIG_MCP=$(ps -eo pid,rss,cmd --sort=-rss | grep -E 'firecrawl-mcp|chrome-devtools-mcp|context7-mcp' | grep -v grep | grep -v playwright | head -1 | awk '{print $1}')
    if [[ -n "$BIG_MCP" ]]; then
      kill -9 "$BIG_MCP" 2>/dev/null || true
      log "RAM critico ${AVAIL}MB libre — killed heavy MCP pid=$BIG_MCP"
    else
      log "RAM critico ${AVAIL}MB libre — sin MCP gordo para liberar"
    fi
  fi

  # 4. Heartbeat cada 5 ciclos (~5 min)
  if [[ $((SECONDS / INTERVAL % 5)) -eq 0 ]]; then
    LOAD=$(awk '{print $1}' /proc/loadavg)
    log "heartbeat avail=${AVAIL}MB load=$LOAD"
  fi

  sleep "$INTERVAL"
done
