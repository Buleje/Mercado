#!/bin/bash
# Vigía del dev server durante las olas del panel: si /login no contesta 4 veces seguidas
# (≈7 min), mata por PID la cadena next-server → next dev → dev-with-canary y lo vuelve a
# levantar. Nunca pkill -f. Log de cada evento en $1.
cd /home/usuario/proyectos/Mercado || exit 1
LOG=${1:-/dev/null}; DEVLOG=${2:-/dev/null}
fallas=0
echo "$(date +%T) vigía arranca" >> "$LOG"
while true; do
  c=$(curl -s -o /dev/null -w "%{http_code}" --max-time 45 http://localhost:3000/login)
  case "$c" in 200|302|307) fallas=0 ;; *) fallas=$((fallas+1)); echo "$(date +%T) login=$c falla $fallas" >> "$LOG" ;; esac
  if [ "$fallas" -ge 4 ]; then
    pid=$(ss -ltnp 2>/dev/null | grep ':3000 ' | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2)
    cadena=""
    for p in $pid $(ps -o ppid= -p "$pid" 2>/dev/null) ; do cadena="$cadena $p"; done
    gp=$(ps -o ppid= -p "$(ps -o ppid= -p "$pid" 2>/dev/null | tr -d ' ')" 2>/dev/null | tr -d ' ')
    ps -o args= -p "$gp" 2>/dev/null | grep -q dev-with-canary && cadena="$cadena $gp"
    echo "$(date +%T) reinicio: matando$cadena" >> "$LOG"
    [ -n "$cadena" ] && kill -9 $cadena 2>/dev/null
    sleep 5
    nohup npm run dev >> "$DEVLOG" 2>&1 &
    echo "$(date +%T) dev relanzado (pid $!)" >> "$LOG"
    fallas=0; sleep 150
  fi
  sleep 60
done
