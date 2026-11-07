#!/usr/bin/env bash
# Aviso de las 9:00 «Nadie marcó asistencia» (30-10). Pregunta al panel local si toca avisar
# (GET /api/cron/rrhh-aviso-lista, Bearer CRON_SECRET como reportes-hora-exacta) y, si toca,
# manda UN Telegram a Brandon con `aviso-telegram`. Una vez por día: si el panel estaba apagado
# a las 9:00, el reintento de las 9:30 lo cubre.
# Uso: aviso-asistencia-lista.sh [--seco] [--prueba]
#   --seco    imprime el mensaje (sin esperar a las 9:00, sin Telegram, sin marcar el día)
#   --prueba  manda UN Telegram real que dice «prueba» (no marca el día)
# Timer: ~/.config/systemd/user/aviso-asistencia-lista.timer · Log: ~/.local/state/aviso-asistencia-lista.log
set -u
REPO=/home/usuario/proyectos/Mercado
BLAS_ID=cmpxiv6p4000bohvzwl6bnfpv
ENLACE='https://pc-brandon.tail1f40e7.ts.net:8443/admin?tab=rrhh&vista=asistencia&pasar=hoy'
LOG="$HOME/.local/state/aviso-asistencia-lista.log"
ESTADO="$HOME/.local/state/aviso-asistencia-lista.dia"
mkdir -p "$(dirname "$LOG")"
ahora=$(date '+%F %T')
SECO=0; PRUEBA=0
for a in "$@"; do case "$a" in --seco) SECO=1 ;; --prueba) PRUEBA=1 ;; esac; done
anotar() { echo "$ahora $*" >> "$LOG"; tail -n 300 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"; }

hoy=$(TZ=America/Lima date +%F)
if [ "$SECO" = 0 ] && [ "$PRUEBA" = 0 ] && [ "$(cat "$ESTADO" 2>/dev/null)" = "$hoy" ]; then
  anotar "ya se avisó hoy"; exit 0
fi

SECRET=""
for f in "$REPO/.env.local" "$REPO/.env"; do
  [ -n "$SECRET" ] && break
  SECRET=$(grep -m1 '^CRON_SECRET=' "$f" 2>/dev/null | cut -d= -f2- | tr -d '\r')
done
SECRET=${SECRET%\"}; SECRET=${SECRET#\"}
[ -n "$SECRET" ] || { anotar "sin CRON_SECRET en .env.local ni .env"; exit 0; }

sinhora=0; [ "$SECO" = 1 ] && sinhora=1
tenant=${AVISO_LISTA_TENANT:-$BLAS_ID}; nombre=${AVISO_LISTA_NOMBRE:-Blas}
if ! r=$(curl -s --max-time 60 -G -H "Authorization: Bearer $SECRET" \
  --data-urlencode "tenantId=$tenant" --data-urlencode "nombre=$nombre" \
  --data-urlencode "enlace=$ENLACE" --data-urlencode "sinHora=$sinhora" \
  http://localhost:3000/api/cron/rrhh-aviso-lista 2>&1); then
  anotar "panel apagado: no se avisó"; exit 0
fi
resp=$(printf '%s' "$r" | python3 -c 'import sys,json
try:
  d=json.load(sys.stdin); print(("1" if d.get("avisar") else "0")+"\t"+str(d.get("motivo"))+"\t"+str(d.get("texto") or ""))
except Exception: print("x\tsin respuesta valida\t")')
avisar=${resp%%$'\t'*}; resto=${resp#*$'\t'}; motivo=${resto%%$'\t'*}; texto=${resto#*$'\t'}

if [ "$PRUEBA" = 1 ]; then
  aviso-telegram "prueba: aviso de asistencia ($nombre). No hace falta hacer nada." && anotar "prueba enviada" || anotar "prueba fallo"
  exit 0
fi
if [ "$avisar" = 1 ]; then
  if [ "$SECO" = 1 ]; then echo "$texto"; anotar "seco: $texto"; exit 0; fi
  if aviso-telegram "$texto"; then echo "$hoy" > "$ESTADO"; anotar "avisado: $texto"; else anotar "Telegram fallo"; fi
else
  [ "$SECO" = 1 ] && echo "(no toca avisar: $motivo)"
  anotar "no toca avisar: $motivo"
fi
