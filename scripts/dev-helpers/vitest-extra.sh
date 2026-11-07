#!/bin/sh
# Tests que el commit suma a `vitest related` para los archivos dados (mismo
# criterio que scripts/pre-commit-gates.sh; lo usan el commit y probar.sh).
# Imprime la lista separada por espacios.
cd "$(git rev-parse --show-toplevel)" || exit 1
# Tests que leen el FUENTE con readFileSync (no lo importan): `related` no los ve.
LEEN_FUENTE=$(grep -l "readFileSync" __tests__/*.ts __tests__/*.tsx 2>/dev/null || true)
EXTRA_TESTS=""
if [ -n "$LEEN_FUENTE" ]; then
  EXTRA_TESTS=$(for f in "$@"; do
    [ -n "$f" ] && printf '%s\n' "$LEEN_FUENTE" | xargs grep -lF -- "$f" 2>/dev/null
  done | sort -u | tr '\n' ' ')
fi
# Guardianes de TODO el repo (recorren carpetas): `related` nunca los elige.
GUARDIAS=$(grep -lE "readdirSync|globSync|fast-glob|from \"glob\"|git ls-files|walk\(|recorrer\(" __tests__/*.ts __tests__/*.tsx 2>/dev/null | tr '\n' ' ' || true)
printf '%s %s\n' "$EXTRA_TESTS" "$GUARDIAS"
