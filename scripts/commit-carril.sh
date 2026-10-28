#!/usr/bin/env bash
# commit-carril.sh (26-10) — `git commit` en fila cuando varios carriles commitean a la vez.
# Uso: scripts/commit-carril.sh -F <msg> -- <tus archivos>   (mismos argumentos que git commit)
# Por qué: el 26-10 el carril de asistencia chocó 2 veces con el index.lock de otro carril, y el de
# salidas tuvo que hacer `git add -N` a mano: `git commit -- <ruta>` no ve un archivo que git no conoce.
set -u
rutas=(); tras=0
for a in "$@"; do [ "$tras" = 1 ] && rutas+=("$a"); [ "$a" = "--" ] && tras=1; done
exec 9>/tmp/bsm-git-commit.lock
flock -w 600 9 || { echo "commit-carril: otro commit lleva 10 min sin soltar el turno; reintenta" >&2; exit 1; }
# 28-10: con `2>/dev/null || true` un .git/index.lock viejo de otro agente hacía fallar el add en
# silencio y el commit caía con «pathspec … did not match» sobre los archivos nuevos.
if [ "${#rutas[@]}" -gt 0 ]; then
  git add -N -- "${rutas[@]}" || { echo "commit-carril: git add -N falló. ¿.git/index.lock viejo? (pgrep -a git vacío → borrarlo)" >&2; exit 1; }
fi
git commit "$@"
