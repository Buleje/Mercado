#!/usr/bin/env bash
# smoke-test.sh — validacion post-merge SWARM
# Corre: TSC + lint + tests unit. Si algo falla exit 1 y el orchestrator debe invocar healer.

set -e

cd "$(dirname "$0")/.."

echo "🔍 [smoke-test] TSC gate..."
npx tsc --noEmit

echo "🔍 [smoke-test] Lint..."
npm run lint --silent

echo "🔍 [smoke-test] Unit tests..."
npm run test --silent -- --run

echo "✅ [smoke-test] PASS — merge saludable"
