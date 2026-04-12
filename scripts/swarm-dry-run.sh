#!/usr/bin/env bash
# ============================================================================
# swarm-dry-run.sh — Simula los 10 pasos del flujo SWARM sin tocar codigo
#
# Valida que:
# 1. Todos los archivos de coordinacion existen
# 2. Todos los agentes SWARM core existen
# 3. Los worktrees estan activos
# 4. Los scripts son ejecutables
# 5. TSC compila sin errores
# 6. El flujo de archivos funciona (crear/leer/borrar temp)
#
# Uso: bash scripts/swarm-dry-run.sh
# Output: REPORTS/dry-run-swarm-v2.md
# ============================================================================

set -euo pipefail

PASS=0
FAIL=0
WARNINGS=0
RESULTS=""

check() {
  local name="$1"
  local condition="$2"
  if eval "$condition" > /dev/null 2>&1; then
    RESULTS="$RESULTS\n| $name | PASS |"
    PASS=$((PASS + 1))
  else
    RESULTS="$RESULTS\n| $name | **FAIL** |"
    FAIL=$((FAIL + 1))
  fi
}

warn() {
  local name="$1"
  RESULTS="$RESULTS\n| $name | WARN |"
  WARNINGS=$((WARNINGS + 1))
}

echo ""
echo "================================================================"
echo " SWARM DRY RUN — $(date '+%Y-%m-%d %H:%M:%S')"
echo "================================================================"
echo ""

# ── Paso 1: Archivos de coordinacion ──
echo "[1/6] Verificando archivos de coordinacion..."
check "COORDINATION.md" "test -f .claude/COORDINATION.md"
check "LOCKS.md" "test -f .claude/LOCKS.md"
check "BIDDING.md" "test -f .claude/BIDDING.md"
check "LESSONS.md" "test -f .claude/LESSONS.md"
check "HISTORY.md" "test -f .claude/HISTORY.md"
check "SWARM-README.md" "test -f .claude/SWARM-README.md"
check "CONTRACTS/ dir" "test -d .claude/CONTRACTS"
check "REVIEWS/ dir" "test -d .claude/REVIEWS"
check "REPORTS/ dir" "test -d .claude/REPORTS"

# ── Paso 2: Agentes SWARM core ──
echo "[2/6] Verificando agentes SWARM..."
for agent in orchestrator architect frente-back frente-front frente-qa reviewer scribe optimizer; do
  check "agent: $agent" "test -f .claude/agents/$agent.md"
done

# ── Paso 3: Worktrees ──
echo "[3/6] Verificando worktrees..."
WT_COUNT=$(git worktree list | grep -c "worktree-")
check "3 worktrees activos ($WT_COUNT encontrados)" "test $WT_COUNT -ge 3"

# ── Paso 4: Scripts ejecutables ──
echo "[4/6] Verificando scripts..."
check "pre-commit-lock-check.sh ejecutable" "test -x .claude/hooks/pre-commit-lock-check.sh"
check "pre-merge-tag.sh ejecutable" "test -x scripts/pre-merge-tag.sh"
check "smoke-test.sh ejecutable" "test -x scripts/smoke-test.sh"

# ── Paso 5: TSC ──
echo "[5/6] Verificando TypeScript..."
TSC_ERRORS=$(npx tsc --noEmit 2>&1 | grep -v "\.next" | grep -c "error TS" || true)
check "TSC 0 errores ($TSC_ERRORS encontrados)" "test $TSC_ERRORS -eq 0"

# ── Paso 6: Flujo de archivos ──
echo "[6/6] Verificando flujo de archivos..."
TEMP_CONTRACT=".claude/CONTRACTS/_dry-run-test.md"
echo "# Test contract" > "$TEMP_CONTRACT"
check "Escribir contrato temp" "test -f $TEMP_CONTRACT"
rm -f "$TEMP_CONTRACT"
check "Borrar contrato temp" "test ! -f $TEMP_CONTRACT"

echo ""
echo "================================================================"
echo " RESULTADOS"
echo "================================================================"
echo ""
echo -e "| Check | Status |\n|-------|--------|$RESULTS"
echo ""
echo "  Total: $PASS passed, $FAIL failed, $WARNINGS warnings"
echo "================================================================"

# ── Generar reporte ──
REPORT_FILE=".claude/REPORTS/dry-run-swarm-v2.md"
cat > "$REPORT_FILE" << REPORT
# Dry Run SWARM v2 — $(date '+%Y-%m-%d %H:%M:%S')

## Resultado: $([ $FAIL -eq 0 ] && echo "PASS" || echo "FAIL")

| Metrica | Valor |
|---------|-------|
| Checks passed | $PASS |
| Checks failed | $FAIL |
| Warnings | $WARNINGS |
| TSC errores | $TSC_ERRORS |
| Worktrees | $WT_COUNT |

## Detalle

$(echo -e "| Check | Status |\n|-------|--------|$RESULTS")

## Veredicto

$([ $FAIL -eq 0 ] && echo "Sistema SWARM v2 listo para operar. Todos los componentes verificados." || echo "HAY FALLOS. Resolver antes de lanzar ola.")
REPORT

echo ""
echo "  Reporte guardado en: $REPORT_FILE"
echo ""

exit $FAIL
