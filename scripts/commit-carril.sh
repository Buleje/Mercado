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
# 01-11: un `git status` cortado por su tope con la PC cargada dejaba .git/index.lock huérfano y el commit caía
# (01:26). Con el turno tomado: si ningún git vive y el candado tiene más de 60 s, es basura y se quita.
gd=$(git rev-parse --absolute-git-dir 2>/dev/null)
if [ -n "$gd" ] && [ -e "$gd/index.lock" ] && ! pgrep -x git >/dev/null \
  && [ $(( $(date +%s) - $(stat -c %Y "$gd/index.lock") )) -gt 60 ]; then
  echo "commit-carril: quito un .git/index.lock huérfano del $(stat -c %y "$gd/index.lock" | cut -c1-19)" >&2
  rm -f "$gd/index.lock"
fi
# 28-10: con `2>/dev/null || true` un .git/index.lock viejo de otro agente hacía fallar el add en
# silencio y el commit caía con «pathspec … did not match» sobre los archivos nuevos.
# 29-10: un archivo borrado tumbaba el `add -N` entero; el commit con su ruta ya registra el borrado.
existen=(); for r in "${rutas[@]}"; do [ -e "$r" ] && existen+=("$r"); done
if [ "${#existen[@]}" -gt 0 ]; then
  git add -N -- "${existen[@]}" || { echo "commit-carril: git add -N falló. ¿.git/index.lock viejo? (pgrep -a git vacío → borrarlo)" >&2; exit 1; }
fi
git commit "$@"
