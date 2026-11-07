#!/usr/bin/env bash
# Llama al reloj de los recordatorios de la agenda (Telegram mañana/noche y aviso al
# celular a la hora de cada actividad) en el panel de esta PC. Lo corre el timer
# de systemd `agenda-recordatorios.timer` cada 5 min (scripts/systemd/).
# Sin dev server levantado no hace nada (curl falla en silencio y se anota).
set -u
cd "$(dirname "$0")/.." || exit 0
SECRETO=$(grep -E '^CRON_SECRET=' .env.local | head -1 | cut -d= -f2- | tr -d '"')
[ -z "$SECRETO" ] && { echo "$(date -Is) sin CRON_SECRET en .env.local"; exit 0; }
for PUERTO in 3000 3001; do
  R=$(curl -s --max-time 120 -H "Authorization: Bearer $SECRETO" "http://localhost:$PUERTO/api/cron/agenda-recordatorios") && { echo "$(date -Is) :$PUERTO $R"; exit 0; }
done
echo "$(date -Is) panel apagado"
