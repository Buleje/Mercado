#!/usr/bin/env bash
# Cómo trabajaron los ayudantes en los últimos N días (por defecto 7): cuántos, cuánto tardan,
# qué falla, en qué se va el tiempo y cuánto cuesta cada paso según el largo de su conversación.
# Uso: scripts/dev-helpers/ayudantes/medir.sh [días]   (03-11; lo usa la charla del domingo)
cd "$(dirname "$0")" || exit 1
d="${1:-7}"
echo "== Resumen";            node resumen.mjs "$d"
echo; echo "== Fallos más comunes"; node errores.mjs "$d" | grep -v '^     ' | head -10
echo; echo "== En qué se va el tiempo"; node tiempo.mjs "$d" | head -10
echo; echo "== Segundos por paso según el largo"; node paso.mjs "$d"
