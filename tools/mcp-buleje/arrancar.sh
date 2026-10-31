#!/usr/bin/env bash
# Arranca el MCP «buleje» con el Node de nvm aunque Claude Code se abra sin nvm en el PATH (ADR-523).
# 29-10 (Brandon: «a veces se desactiva»): con un PATH sin nvm, `node` era /usr/bin/node v18, que rechaza
# --no-network-family-autoselection del NODE_OPTIONS de ~/.bashrc; el MCP moría en 127 ms (CONNECTION_CLOSED)
# y esa sesión de Claude quedaba sin conexión. Uso: arrancar.sh (servidor) · arrancar.sh --vigilar (vigilar.mjs).
set -u
aqui="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"
base="$HOME/.nvm/versions/node"
v="$(cat "$HOME/.nvm/alias/default" 2>/dev/null || true)"; v="${v#v}"
nodo=""
[ -n "$v" ] && [ -x "$base/v$v/bin/node" ] && nodo="$base/v$v/bin/node"
# shellcheck disable=SC2012  # las versiones de nvm son vX.Y.Z, sin espacios
[ -n "$nodo" ] || nodo="$(ls -d "$base"/v*/bin/node 2>/dev/null | sort -V | tail -1)"
[ -n "$nodo" ] || nodo="$(command -v node || true)"
if [ -z "$nodo" ]; then echo "[buleje-mcp] no encuentro Node (ni nvm ni el del sistema)" >&2; exit 1; fi
mayor="$("$nodo" -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
if [ "$mayor" -lt 20 ]; then echo "[buleje-mcp] Node $mayor es muy viejo (hace falta 20 o más): $nodo" >&2; exit 1; fi
# Las opciones del panel (8 GB de heap, red de WSL) no le sirven al MCP y alguna rompe en otras versiones.
# Solo se deja ipv4first: en WSL mirrored «localhost» por ::1 puede colgarse.
export NODE_OPTIONS="--dns-result-order=ipv4first"
if [ "${1:-}" = "--vigilar" ]; then shift; exec "$nodo" "$aqui/vigilar.mjs" "$@"; fi
exec "$nodo" "$aqui/servidor.mjs" "$@"
