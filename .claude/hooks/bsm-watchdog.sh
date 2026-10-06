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

# Cierra el árbol completo del dev (npm → dev-with-canary → next dev → next-server)
# y lo relanza. Single source con `npm run dev:restart`.
reiniciar_dev() {
  # `9>&-`: el dev relanzado NO hereda el candado del guardián (05-10: el `npm run dev`
  # que relanzó se quedó con el fd 9 y ningún guardián nuevo podía volver a arrancar).
  bash "$PROJECT_DIR/scripts/dev-restart.sh" 9>&- >/dev/null 2>&1 || true
}

log "watchdog started pid=$$ interval=${INTERVAL}s"

while true; do
  if [[ "${BSM_WATCHDOG_DISABLE:-0}" == "1" ]]; then
    log "disabled via BSM_WATCHDOG_DISABLE=1"
    sleep "$INTERVAL"
    continue
  fi

  # 1. Chromiums huerfanos (ppid=1) — mata todos
  # Por el NOMBRE del proceso, no por la línea entera (05-10): el argv de earlyoom
  # trae «--prefer (…|^chrome|chromium|headless_shell…)» y lo tomaba por huérfano (pid 217).
  ORPHAN_CHROMIUM=$(ps -eo pid,ppid,etimes,comm | awk '$2==1 && $4 ~ /^(chrome|chromium|headless_shell)/ && $3>300 {print $1}' | head -10)
  if [[ -n "$ORPHAN_CHROMIUM" ]]; then
    echo "$ORPHAN_CHROMIUM" | xargs -r kill -9 2>/dev/null || true
    log "killed orphan chromium pids: $(echo $ORPHAN_CHROMIUM | tr '\n' ' ')"
  fi

  # 2b. vitest colgado (05-10: un `vitest run --root /` siguió 87 min con 8,2 GB y tumbó el dev 2 veces).
  VITEST_VIEJO=$(ps -eo pid,etimes,cmd | awk '$2>1800 && /node .*vitest run/ && !/awk/ {print $1}' | head -5)
  if [[ -n "$VITEST_VIEJO" ]]; then
    echo "$VITEST_VIEJO" | xargs -r kill -9 2>/dev/null || true
    log "vitest de más de 30 min cerrado: $(echo $VITEST_VIEJO | tr '\n' ' ')"
  fi

  # 2. tsc huerfanos (ppid=1) — mata
  ORPHAN_TSC=$(ps -eo pid,ppid,cmd | awk '$2==1 && /tsc.*--noEmit/ {print $1}' | head -10)
  if [[ -n "$ORPHAN_TSC" ]]; then
    echo "$ORPHAN_TSC" | xargs -r kill -9 2>/dev/null || true
    log "killed orphan tsc pids: $(echo $ORPHAN_TSC | tr '\n' ' ')"
  fi

  # 3. RAM baja → anotar QUIÉN la come (05-10 07:33: 75 MB libres durante 9 min
  #    y el log sólo decía «sin MCP gordo»; no se supo quién era). Antes acá se
  #    mataba un MCP (context7/firecrawl, ~100 MB: no salvaba nada y dejaba sin
  #    esa herramienta a la sesión). La emergencia ahora la atiende earlyoom
  #    (systemd, mira cada 0,1-1 s, prefiere dev server/tsc/chromium y nunca a
  #    Claude: /etc/default/earlyoom); este bucle de 60 s llega tarde para eso.
  AVAIL=$(awk '/MemAvailable/ {print int($2/1024)}' /proc/meminfo)
  if [[ "$AVAIL" -lt 1500 ]]; then
    TOP=$(ps -eo rss,comm --sort=-rss | awk 'NR>1 && NR<=6 {printf "%s %.1fG, ", $2, $1/1048576}')
    ZRAM=$(awk '$1 ~ /zram/ {printf "%.1fG", $4/1048576}' /proc/swaps)
    log "RAM baja ${AVAIL}MB libres · zram ${ZRAM:-0} · top: ${TOP%, }"
  fi
  # Lo que earlyoom cerró en el último ciclo, al mismo log (el journal no se mira).
  journalctl -u earlyoom --since "-${INTERVAL}s" -o cat 2>/dev/null | grep -E 'sending SIG' | while read -r l; do log "earlyoom: $l"; done

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
  #     05-10: el piso de tamaño era ≥ 10 GB y en una VM de 16 GB nunca se
  #     alcanza (07:33: 75 MB libres 9 min sin reciclar nada) → ≥ 4 GB.
  #     Se recicla el árbol entero: matar sólo
  #     next-server deja a `next dev` vivo y sin hijo (no reintenta si muere por
  #     señal, next-dev.js:302).
  NEXT_PID=$(pgrep -f '^next-server' | head -1)
  NEXT_GB=0
  [[ -n "$NEXT_PID" ]] && NEXT_GB=$(awk '/^VmRSS/ {printf "%d", $2/1048576}' "/proc/$NEXT_PID/status" 2>/dev/null || echo 0)
  PSI_FULL=$(awk '/^full/ {split($3, a, "="); printf "%d", a[2]}' /proc/pressure/memory 2>/dev/null || echo 0)
  if [[ -n "$NEXT_PID" && "${NEXT_GB:-0}" -ge 4 && ( "$AVAIL" -lt 1200 || "${PSI_FULL:-0}" -ge 15 ) ]]; then
    reiniciar_dev
    log "dev server reciclado: ${NEXT_GB}GB de RSS con ${AVAIL}MB libres, PSI full ${PSI_FULL}% (pid=$NEXT_PID)"
  fi

  # 3c. `next dev` vivo sin next-server (lo cerró earlyoom o murió por señal):
  #     el puerto 3000 queda muerto con el padre colgado. Dos ciclos seguidos
  #     (el arranque normal tarda segundos) y RAM para volver a compilar.
  if [[ -z "$NEXT_PID" ]] && pgrep -f '[n]ext dev' >/dev/null; then
    DEV_SIN_HIJO=$((${DEV_SIN_HIJO:-0} + 1))
    if [[ "$DEV_SIN_HIJO" -ge 2 && "$AVAIL" -ge 3000 ]]; then
      reiniciar_dev
      log "dev server rearmado: next dev seguía vivo sin next-server (${AVAIL}MB libres)"
      DEV_SIN_HIJO=0
    fi
  else
    DEV_SIN_HIJO=0
  fi

  # 4. Heartbeat cada 5 ciclos (~5 min)
  if [[ $((SECONDS / INTERVAL % 5)) -eq 0 ]]; then
    LOAD=$(awk '{print $1}' /proc/loadavg)
    log "heartbeat avail=${AVAIL}MB load=$LOAD"
  fi

  sleep "$INTERVAL"
done
