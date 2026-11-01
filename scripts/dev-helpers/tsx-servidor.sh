#!/usr/bin/env bash
# tsx-servidor.sh (01-11-2026) — corre un programa .mts que importa DB classes del panel fuera de Next.
# Por qué: `lib/db/*.db.ts` hace `import "server-only"`, que Next trae adentro y no está en node_modules;
# tres ayudantes lo redescubrieron por su cuenta (stub + NODE_PATH; `--conditions=react-server` no alcanza).
# Uso: scripts/dev-helpers/tsx-servidor.sh <programa.mts> [args…]   (lee .env.local; la base es la compartida)
set -euo pipefail
stub=/tmp/bsm-server-only-stub/node_modules/server-only
if [ ! -f "$stub/index.js" ]; then
  mkdir -p "$stub"
  printf '{"name":"server-only","version":"0.0.0","main":"index.js"}\n' > "$stub/package.json"
  : > "$stub/index.js"
fi
cd "$(git rev-parse --show-toplevel)"
NODE_PATH=/tmp/bsm-server-only-stub/node_modules exec node --env-file=.env.local --import tsx "$@"
