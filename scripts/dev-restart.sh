#!/usr/bin/env bash
# dev-restart.sh — reinicia el árbol completo del dev (npm → dev-with-canary →
# next dev → next-server) y espera a que :3000 escuche. `npm run dev:restart`.
#
# Por qué un script (2026-10-05): a mano se repitió 3 veces en una sesión y una
# vez `pkill -f` mató la propia terminal porque el comando escrito contenía el
# texto que buscaba. Acá los patrones viven en este archivo y el argv del
# proceso es «bash scripts/dev-restart.sh»: nunca se matchea a sí mismo.
# Lo usa también .claude/hooks/bsm-watchdog.sh (single source).
#
# Matar sólo next-server no sirve: `next dev` queda vivo sin hijo y no reintenta
# si murió por señal (next-dev.js:302).
# Variables: BSM_DEV_SIN_TECHO=1 (sin techo de RAM) · BSM_DEV_TECHO=8G.
set -u
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
PATRONES=('[d]ev-with-canary' 'node_modules/.bin/[n]ext' '^next-server')

for p in "${PATRONES[@]}"; do pkill -TERM -f "$p" || true; done
sleep 3
for p in "${PATRONES[@]}"; do pkill -KILL -f "$p" || true; done
sleep 1

# --parar: sólo apaga el dev (lo usaba el modo juego, retirado el 2026-10-07 junto con el juego).
if [[ "${1:-}" == "--parar" ]]; then echo "[dev:restart] dev apagado"; exit 0; fi

cd "$PROJECT_DIR" || exit 1
setsid nohup npm run dev > /tmp/dev-server.log 2>&1 < /dev/null &
disown

for i in $(seq 1 120); do
  if ss -ltnH 'sport = :3000' | grep -q .; then
    echo "[dev:restart] escuchando en :3000 a los ${i}s (log: /tmp/dev-server.log)"
    exit 0
  fi
  sleep 1
done
echo "[dev:restart] :3000 no escucha tras 120 s — mirá /tmp/dev-server.log" >&2
exit 1
