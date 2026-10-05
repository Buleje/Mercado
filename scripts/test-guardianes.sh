#!/usr/bin/env bash
# test-guardianes.sh — los tests que recorren TODO el repo (ⓘ anidados, tenant «main»
# hardcodeado, XSS en JSON-LD…), los mismos que suma el pre-commit (~5 s).
# Correrlo ANTES de commitear el lote de varios agentes: uno rojo tumba CUALQUIER commit,
# aunque no toque ese archivo (05-10: un ⓘ dentro de un título costó 3 vueltas de 100 s).
# Misma búsqueda que scripts/pre-commit-gates.sh («GUARDIAS»).
cd "$(dirname "$0")/.." || exit 1
G=$(grep -lE "readdirSync|globSync|fast-glob|from \"glob\"|git ls-files|walk\(|recorrer\(" __tests__/*.ts __tests__/*.tsx 2>/dev/null | tr '\n' ' ')
set -f
# shellcheck disable=SC2086
exec npx vitest run $G --passWithNoTests
