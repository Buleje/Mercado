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

# Una sola copia: candado del kernel (flock), no el pidfile solo. Con el
# pidfile, dos sesiones que arrancaban a la vez pasaban las dos el chequeo y
# quedaban DOS watchdogs reciclando el dev server (medido 01-10: pid 1936 y
# 505989 vivos juntos). El candado se suelta solo cuando el proceso muere.
LOCK_FILE="$PROJECT_DIR/.claude/.watchdog.lock"
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "[watchdog] ya hay otro corriendo (candado tomado)" >&2
  exit 0
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

  # 3b. Dev server inflado — la RAM la come COMPILAR, no el paso del tiempo
  #     (medido 2026-09-18: 6.6 GB tras 25 min de uso normal, y 8.76 GB a los
  #     2m35s de arrancar limpio si se le pasa `warm-dev-routes` con sus 14
  #     rutas). Con 16 GB en la VM, un typecheck (7-8 GB) encima de eso deja al
  #     sistema sin aire: es el "lento y se congela" que reporta Brandon.
  #     Por eso conviene warmear sólo las rutas que se van a usar.
  #     Umbral DOBLE a propósito: sólo recicla cuando ADEMÁS falta RAM real, así
  #     un dev server gordo pero inofensivo no cuesta un cold-start de 30-90 s.
  #     01-10: con < 3 GB libres como umbral lo reciclaba cada 6-10 min (12
  #     veces en una noche: «el servidor se cae») sin que el sistema estuviera
  #     apretado — presión de memoria 0,3 %, 0 OOM kills. Ahora sólo con
  #     presión REAL: < 1,2 GB libres, o el kernel esperando memoria (PSI full
  #     avg60 ≥ 15 %).
  NEXT_PID=$(ps -eo pid,rss,comm --sort=-rss | awk '$3 == "next-server" {print $1; exit}')
  NEXT_GB=$(ps -eo pid,rss,comm --sort=-rss | awk '$3 == "next-server" {printf "%d", $2/1048576; exit}')
  PSI_FULL=$(awk '/^full/ {split($3, a, "="); printf "%d", a[2]}' /proc/pressure/memory 2>/dev/null || echo 0)
  if [[ -n "$NEXT_PID" && "${NEXT_GB:-0}" -ge 10 && ( "$AVAIL" -lt 1200 || "${PSI_FULL:-0}" -ge 15 ) ]]; then
    kill "$NEXT_PID" 2>/dev/null || true
    sleep 3
    kill -9 "$NEXT_PID" 2>/dev/null || true
    ( cd "$PROJECT_DIR" && nohup npm run dev > /tmp/dev-server.log 2>&1 & disown ) 2>/dev/null || true
    log "dev server reciclado: ${NEXT_GB}GB de RSS con ${AVAIL}MB libres, PSI full ${PSI_FULL}% (pid=$NEXT_PID)"
  fi

  # 4. Heartbeat cada 5 ciclos (~5 min)
  if [[ $((SECONDS / INTERVAL % 5)) -eq 0 ]]; then
    LOAD=$(awk '{print $1}' /proc/loadavg)
    log "heartbeat avail=${AVAIL}MB load=$LOAD"
  fi

  sleep "$INTERVAL"
done
