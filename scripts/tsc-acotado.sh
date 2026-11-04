#!/usr/bin/env bash
# scripts/tsc-acotado.sh — revisa tipos SOLO de los archivos dados (y lo que importan),
# con la MISMA configuración del repo (extends de tsconfig.json: alias, paquetes del DS).
#
# Para carriles en paralelo, donde el typecheck completo no conviene
# (.claude/docs/carriles-en-paralelo.md). Nació 02-11-2026: un tsconfig recortado
# hecho a mano por un ayudante (sin `extends`) dio «0 errores» con 5 íconos que
# `@buleje/design-system/icons` no exportaba; este los ve.
#
# Uso: scripts/tsc-acotado.sh <archivo.ts|tsx> [más…]
set -euo pipefail
cd "$(dirname "$0")/.."
raiz=$(pwd)
[ $# -gt 0 ] || { echo "uso: $0 <archivo.ts|tsx> [más…]" >&2; exit 2; }

dir=$(mktemp -d /tmp/tsc-acotado.XXXXXX)
trap 'rm -rf "$dir"' EXIT

archivos=()
for a in "$@"; do
  [ -f "$a" ] || { echo "no existe: $a" >&2; exit 2; }
  archivos+=("$raiz/$a")
done
# Declaraciones globales del repo (next-env, tipos propios): sin ellas salen falsos rojos.
while IFS= read -r d; do archivos+=("$raiz/$d"); done < <(git ls-files 'next-env.d.ts' 'types/*.d.ts' '*.d.ts' ':!:node_modules' ':!:lib/generated/**' | sort -u)
# Con el tsconfig en /tmp, el `/// <reference types="next" />` de next-env.d.ts no
# llega a node_modules/next/types/global.d.ts, que declara 'server-only' y
# 'client-only': sin esto salían 7 falsos TS2882 por archivo de servidor (04-11).
[ -f "$raiz/node_modules/next/types/global.d.ts" ] && archivos+=("$raiz/node_modules/next/types/global.d.ts")

python3 - "$dir/tsconfig.json" "$raiz/tsconfig.json" "${archivos[@]}" <<'PY'
import json, sys
destino, base, *files = sys.argv[1:]
json.dump({"extends": base, "compilerOptions": {"noEmit": True, "incremental": False},
           "files": sorted(set(files)), "include": []}, open(destino, "w"))
PY

TSC7_SIN_FILA=1 node scripts/tsc7.mjs -p "$dir/tsconfig.json"
