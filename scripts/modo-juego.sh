#!/usr/bin/env bash
# modo-juego.sh — lo que hace Ubuntu cuando Brandon abre o cierra LoL (2026-10-05).
# Lo llama la tarea de Windows «Modo juego LoL» (C:\Users\Usuario\.claude-tune\modo-juego\modo-juego.ps1):
#   entrar → apaga el dev si estaba prendido (lo anota) y devuelve la caché de Ubuntu a Windows
#   salir  → relanza el dev sólo si estaba prendido al entrar
# Por qué: con Ubuntu en 20 GB, a LoL le quedaban ~3 GB; el 02-10 la partida terminó 19:46
# y Node se cayó 4 veces entre 19:50 y 20:01 (volcados de 6-9,5 GB).
set -u
DIR="$(cd "$(dirname "$0")/.." && pwd)"
MARCA=/tmp/bsm-modo-juego-dev
# wsl.exe no carga .bashrc: sin esto `npm` es el de Windows (/mnt/c/Program Files/nodejs).
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh" >/dev/null 2>&1

case "${1:-}" in
  entrar)
    if ss -ltnH 'sport = :3000' | grep -q .; then
      touch "$MARCA"
      bash "$DIR/scripts/dev-restart.sh" --parar
    fi
    sync
    sudo -n sh -c 'echo 1 > /proc/sys/vm/drop_caches; echo 1 > /proc/sys/vm/compact_memory' 2>/dev/null || echo "sin sudo: la caché queda"
    echo "dev=$([[ -f $MARCA ]] && echo si || echo no) ubuntu_libre=$(awk '/MemAvailable/ {printf "%.1f", $2/1048576}' /proc/meminfo)GB"
    ;;
  salir)
    if [[ -f "$MARCA" ]]; then
      rm -f "$MARCA"
      cd "$DIR" && bash scripts/dev-restart.sh
    else
      echo "el dev no estaba prendido al entrar: no se toca"
    fi
    ;;
  *) echo "uso: modo-juego.sh entrar|salir" >&2; exit 2 ;;
esac
