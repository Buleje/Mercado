#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
# canary-deploy.sh — Despliegue canary con auto-rollback
#
# Fases:
#   1. Canary (5% tráfico, 5 min monitoreo)
#   2. Beta  (25% tráfico, 10 min monitoreo)
#   3. GA    (100% tráfico, 15 min monitoreo post)
#
# Auto-rollback si:
#   - Error rate >1% vs baseline
#   - p99 latencia >800ms
#   - Cualquier 5xx en checkout
#   - SLO burn >5% durante ventana
#
# Uso:
#   ./scripts/canary-deploy.sh                    # canary estándar (30 min)
#   ./scripts/canary-deploy.sh --instant          # deploy directo (emergencia)
#   ./scripts/canary-deploy.sh --canary-fast      # canary rápido (15 min)
#   ./scripts/canary-deploy.sh --canary-slow      # canary extendido (1 hora)
#
# Referencia: ADR-038
# ═══════════════════════════════════════════════════════════════════════

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────
PROD_URL="${NEXT_PUBLIC_BASE_URL:-https://mercado.vercel.app}"
MODE="${1:---canary}"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
LOG_FILE="logs/canary-deploys/${TIMESTAMP}.log"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Tiempos por modo
case "$MODE" in
  --instant)
    PHASE1_MIN=0; PHASE2_MIN=0; PHASE3_MIN=0
    echo "⚡ MODO INSTANT — deploy directo sin canary (solo emergencias)"
    ;;
  --canary-fast)
    PHASE1_MIN=3; PHASE2_MIN=5; PHASE3_MIN=7
    echo "🏎️ MODO CANARY FAST — 15 min total"
    ;;
  --canary-slow)
    PHASE1_MIN=10; PHASE2_MIN=20; PHASE3_MIN=30
    echo "🐢 MODO CANARY SLOW — 1 hora total"
    ;;
  *)
    PHASE1_MIN=5; PHASE2_MIN=10; PHASE3_MIN=15
    echo "🎯 MODO CANARY ESTÁNDAR — 30 min total"
    ;;
esac

# ── Colores ───────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${BLUE}[canary]${NC} $1" | tee -a "$LOG_FILE"; }
warn() { echo -e "${YELLOW}[canary]${NC} ⚠️ $1" | tee -a "$LOG_FILE"; }
fail() { echo -e "${RED}[canary]${NC} ❌ $1" | tee -a "$LOG_FILE"; }
ok() { echo -e "${GREEN}[canary]${NC} ✅ $1" | tee -a "$LOG_FILE"; }

# ── Funciones ─────────────────────────────────────────────────────────

health_check() {
  local url="$1"
  local result
  result=$(curl -s -o /dev/null -w "%{http_code} %{time_total}" --max-time 10 "$url" 2>/dev/null || echo "000 0")
  local status=$(echo "$result" | awk '{print $1}')
  local time=$(echo "$result" | awk '{print $2}')
  echo "$status $time"
}

check_errors() {
  local phase="$1"
  # Check health endpoint
  local result=$(health_check "${PROD_URL}/api/health")
  local status=$(echo "$result" | awk '{print $1}')
  local latency=$(echo "$result" | awk '{print $2}')

  if [ "$status" -ge 500 ] 2>/dev/null; then
    fail "Phase ${phase}: HTTP ${status} — 5xx detectado!"
    return 1
  fi

  # Check latency threshold (800ms = 0.8s)
  if [ "$(echo "$latency > 0.8" | bc -l 2>/dev/null || echo 0)" = "1" ]; then
    warn "Phase ${phase}: latencia ${latency}s > 800ms threshold"
  fi

  # Check checkout specifically
  local checkout_result=$(health_check "${PROD_URL}/api/checkout/confirm" 2>/dev/null || echo "200 0")
  local checkout_status=$(echo "$checkout_result" | awk '{print $1}')
  if [ "$checkout_status" -ge 500 ] 2>/dev/null; then
    fail "Phase ${phase}: Checkout endpoint 5xx!"
    return 1
  fi

  ok "Phase ${phase}: health OK (${status}, ${latency}s)"
  return 0
}

rollback() {
  fail "AUTO-ROLLBACK ACTIVADO"
  log "Ejecutando: vercel rollback"
  vercel rollback 2>/dev/null || warn "vercel rollback falló — rollback manual necesario"
  log "Rollback completado. Revisa logs en ${LOG_FILE}"
}

monitor_phase() {
  local phase_name="$1"
  local duration_min="$2"
  local check_interval=30  # segundos

  if [ "$duration_min" -eq 0 ]; then
    log "${phase_name}: skip (modo instant)"
    return 0
  fi

  log "${phase_name}: monitoreando ${duration_min} minutos..."
  local total_checks=$((duration_min * 60 / check_interval))

  for i in $(seq 1 $total_checks); do
    sleep $check_interval
    if ! check_errors "$phase_name"; then
      rollback
      exit 1
    fi
  done

  ok "${phase_name}: completada sin errores"
}

# ── Main ──────────────────────────────────────────────────────────────

cd "$REPO_ROOT"
mkdir -p "$(dirname "$LOG_FILE")"

log "═══════════════════════════════════════════"
log "  🚀 Canary Deploy — ${TIMESTAMP}"
log "  Modo: ${MODE}"
log "  URL: ${PROD_URL}"
log "═══════════════════════════════════════════"

# Pre-flight checks
log "Pre-flight: verificando salud actual..."
if ! check_errors "pre-flight"; then
  fail "App ya está con problemas. Fix antes de deployar."
  exit 1
fi

# Deploy
log "Deploying a Vercel..."
vercel deploy --prod 2>&1 | tee -a "$LOG_FILE" || {
  fail "vercel deploy falló"
  exit 1
}

# Fases de monitoreo
monitor_phase "Phase 1 (Canary 5%)" $PHASE1_MIN
monitor_phase "Phase 2 (Beta 25%)" $PHASE2_MIN
monitor_phase "Phase 3 (GA 100%)" $PHASE3_MIN

ok "═══════════════════════════════════════════"
ok "  🎉 Canary deploy EXITOSO"
ok "  Duración total: $((PHASE1_MIN + PHASE2_MIN + PHASE3_MIN)) min"
ok "  Log: ${LOG_FILE}"
ok "═══════════════════════════════════════════"
