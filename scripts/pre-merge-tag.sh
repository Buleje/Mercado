#!/usr/bin/env bash
# pre-merge-tag.sh — tag de rollback antes de mergear una ola
# Uso: bash scripts/pre-merge-tag.sh ola2

set -e

TAG_NAME="pre-${1:-unknown}-$(date +%Y%m%d-%H%M)"

cd "$(dirname "$0")/.."

git tag -a "$TAG_NAME" -m "Pre-merge snapshot $TAG_NAME"
echo "📌 [pre-merge-tag] Tag creado: $TAG_NAME"
echo "   Rollback con: git reset --hard $TAG_NAME"
