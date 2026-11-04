#!/bin/sh
# Sello de revisiones ya pasadas (Brandon 03-11: «guardar sin repetir»).
# La clave resume el código del árbol de trabajo: HEAD + cambios sin guardar +
# archivos nuevos. Si la clave no cambió desde un typecheck o vitest verde, el
# commit no tiene nada nuevo que revisar y salta ese gate. Cualquier cambio de
# código (o de HEAD) cambia la clave y el gate vuelve a correr.
#   sello.sh clave                       → imprime la clave
#   sello.sh ok <nombre> <clave> [arch…] → 0 si hay sello válido (y cubre esos archivos)
#   sello.sh poner <nombre> <clave> [arch…]
set -f
RAIZ=$(git rev-parse --show-toplevel) || exit 1
cd "$RAIZ" || exit 1
DIR="$(git rev-parse --git-dir)/buleje-sellos"
CODIGO="*.ts *.tsx *.mts *.cts *.js *.jsx *.mjs *.cjs *.json *.prisma *.css"

clave() {
  {
    git rev-parse HEAD
    # shellcheck disable=SC2086
    git diff HEAD --binary -- $CODIGO
    # shellcheck disable=SC2086
    git ls-files --others --exclude-standard -- $CODIGO | sort | while IFS= read -r f; do
      printf '\n== %s\n' "$f"; cat -- "$f" 2>/dev/null
    done
  } | sha256sum | cut -c1-64
}

accion=$1; shift
case "$accion" in
  clave) clave ;;
  ok)
    nombre=$1; k=$2; shift 2
    f="$DIR/$nombre"
    [ -n "$k" ] && [ -f "$f" ] && [ "$(head -1 "$f")" = "$k" ] || exit 1
    for a in "$@"; do grep -qxF -- "$a" "$f" || exit 1; done
    exit 0 ;;
  poner)
    nombre=$1; k=$2; shift 2
    [ -n "$k" ] || exit 1
    mkdir -p "$DIR" && { printf '%s\n' "$k"; for a in "$@"; do printf '%s\n' "$a"; done; } >"$DIR/$nombre" ;;
  *) echo "uso: sello.sh clave | ok <nombre> <clave> [arch…] | poner <nombre> <clave> [arch…]" >&2; exit 2 ;;
esac
