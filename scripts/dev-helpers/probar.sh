#!/bin/sh
# probar.sh <archivos…> — corre los MISMOS tests que correrá el commit para esos
# archivos y deja el sello: si el código no cambia, el commit no los repite.
# Usar en vez de `npx vitest related <archivos> --run`.
cd "$(git rev-parse --show-toplevel)" || exit 1
[ $# -gt 0 ] || { echo "uso: probar.sh <archivos…>" >&2; exit 2; }
CLAVE=$(sh scripts/dev-helpers/sello.sh clave vitest)
EXTRA=$(sh scripts/dev-helpers/vitest-extra.sh "$@")
set -f
# 04-11: misma lista que el commit (pruebas-relacionadas.mjs, 0,4 s) en vez de `vitest related` (30 s
# fijos). Código 3 = no pudo decidir → `vitest related`. Lista vacía no llega a `vitest run` (correría todo).
REL=$(node scripts/dev-helpers/pruebas-relacionadas.mjs "$@" 2>/dev/null); REL_RC=$?
# shellcheck disable=SC2086
LISTA=$(printf '%s\n' $REL $EXTRA | grep . | sort -u | tr '\n' ' ')
if [ "$REL_RC" != "0" ]; then
  # shellcheck disable=SC2086
  npx vitest related "$@" $EXTRA --project unit --run --passWithNoTests
elif [ -n "$LISTA" ]; then
  # shellcheck disable=SC2086
  npx vitest run $LISTA --project unit --passWithNoTests
else
  echo "Test Files  0 (ningún test depende de estos archivos)"
fi
rc=$?
set +f
if [ "$rc" = "0" ]; then
  sh scripts/dev-helpers/sello.sh poner vitest "$CLAVE" "$@" && echo "🔖 sello puesto: el commit no repetirá estos tests si el código no cambia"
fi
exit $rc
