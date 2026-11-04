#!/bin/sh
# Sello de revisiones ya pasadas (Brandon 03-11: «guardar sin repetir»).
# La clave resume el código del árbol de trabajo: HEAD + cambios sin guardar +
# archivos nuevos. Si la clave no cambió desde un typecheck o vitest verde, el
# commit no tiene nada nuevo que revisar y salta ese gate. Cualquier cambio de
# código (o de HEAD) cambia la clave y el gate vuelve a correr.
#   sello.sh clave [vitest]              → imprime la clave («vitest» = sin .claude/autonomo)
#   sello.sh ok <nombre> <clave> [arch…] → 0 si hay sello válido (y cubre esos archivos)
#   sello.sh poner <nombre> <clave> [arch…]
set -f
# La clave se calcula siempre contra el índice REAL (04-11): `git commit -- <archivos>`
# corre el pre-commit con un índice temporal (HEAD + esos archivos) en
# GIT_INDEX_FILE; ahí los archivos nuevos ya agregados (`A`) salen como sueltos,
# la clave no coincidía con la del typecheck/probar.sh y el commit repetía tsc +
# vitest (~66 s) aunque nada hubiera cambiado. `git diff HEAD` compara el árbol
# de trabajo con HEAD: el índice solo decide qué archivos nuevos se ven.
unset GIT_INDEX_FILE
RAIZ=$(git rev-parse --show-toplevel) || exit 1
cd "$RAIZ" || exit 1
DIR="$(git rev-parse --git-dir)/buleje-sellos"
CODIGO="*.ts *.tsx *.mts *.cts *.js *.jsx *.mjs *.cjs *.json *.prisma *.css"
# Recetas y estado de tareas sueltas (folleto, noches): los tipos las revisan,
# pero ninguna prueba las importa (03-11: copiar la receta del folleto tiró el
# sello de vitest y el commit repitió 90 s de tests ya pasados).
FUERA_VITEST=".claude/autonomo/"

clave() {
  if [ "$1" = "vitest" ]; then FUERA=":(exclude)$FUERA_VITEST"; else FUERA=""; fi
  {
    git rev-parse HEAD
    # shellcheck disable=SC2086
    git diff HEAD --binary -- $CODIGO $FUERA
    # shellcheck disable=SC2086
    git ls-files --others --exclude-standard -- $CODIGO $FUERA | sort | while IFS= read -r f; do
      printf '\n== %s\n' "$f"; cat -- "$f" 2>/dev/null
    done
  } | sha256sum | cut -c1-64
}

accion=$1; shift
case "$accion" in
  clave) clave "$1" ;;
  ok)
    nombre=$1; k=$2; shift 2
    f="$DIR/$nombre"
    [ -n "$k" ] && [ -f "$f" ] && [ "$(head -1 "$f")" = "$k" ] || exit 1
    for a in "$@"; do
      case "$nombre:$a" in vitest:"$FUERA_VITEST"*) continue ;; esac
      grep -qxF -- "$a" "$f" || exit 1
    done
    exit 0 ;;
  poner)
    nombre=$1; k=$2; shift 2
    [ -n "$k" ] || exit 1
    mkdir -p "$DIR" && { printf '%s\n' "$k"; for a in "$@"; do printf '%s\n' "$a"; done; } >"$DIR/$nombre" ;;
  *) echo "uso: sello.sh clave | ok <nombre> <clave> [arch…] | poner <nombre> <clave> [arch…]" >&2; exit 2 ;;
esac
