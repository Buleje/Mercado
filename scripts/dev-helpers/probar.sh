#!/bin/sh
# probar.sh <archivos…> — corre los MISMOS tests que correrá el commit para esos
# archivos y deja el sello: si el código no cambia, el commit no los repite.
# Usar en vez de `npx vitest related <archivos> --run`.
cd "$(git rev-parse --show-toplevel)" || exit 1
[ $# -gt 0 ] || { echo "uso: probar.sh <archivos…>" >&2; exit 2; }
CLAVE=$(sh scripts/dev-helpers/sello.sh clave)
EXTRA=$(sh scripts/dev-helpers/vitest-extra.sh "$@")
set -f
# shellcheck disable=SC2086
npx vitest related "$@" $EXTRA --project unit --run --passWithNoTests
rc=$?
set +f
if [ "$rc" = "0" ]; then
  sh scripts/dev-helpers/sello.sh poner vitest "$CLAVE" "$@" && echo "🔖 sello puesto: el commit no repetirá estos tests si el código no cambia"
fi
exit $rc
