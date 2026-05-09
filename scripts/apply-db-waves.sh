#!/usr/bin/env bash
# scripts/apply-db-waves.sh
#
# Round 25 (2026-05-09) — wrapper Brandon-ready para aplicar las migraciones
# de índices wave-1 y wave-2 cuando tengas DIRECT_URL accesible.
#
# Estado actual:
#   - Ambos archivos SQL existen en prisma/migrations/proposed-*.sql
#   - Total 24 índices CREATE CONCURRENTLY IF NOT EXISTS (zero downtime)
#   - Bloqueados desde round 7 por DNS WSL → Supabase pooler
#
# Esperado: subir score DB de 14→17 al cubrir 23 queries de hot paths
# (LoyaltyTransaction, Sale, Review, CustomerNotification, Coupon, Promotion,
# StripeWebhookQueue, Order tenant+source+deletedAt+createdAt, etc.).
#
# Uso:
#   1. Desde una red con acceso a Supabase directo (no WSL):
#      export DIRECT_URL='postgresql://postgres:PASSWORD@db.<ref>.supabase.co:5432/postgres'
#   2. ./scripts/apply-db-waves.sh
#   3. Verificar en Supabase Dashboard → SQL Editor:
#      SELECT COUNT(*) FROM pg_indexes WHERE indexname LIKE 'idx_%' AND schemaname = 'public';
#
# Idempotente: usa CREATE INDEX CONCURRENTLY IF NOT EXISTS — re-ejecutar es seguro.
#
set -euo pipefail

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}═══ Apply DB waves (Round 7+25 backlog) ═══${NC}"

if [[ -z "${DIRECT_URL:-}" ]]; then
  echo -e "${RED}ERROR:${NC} DIRECT_URL no está exportada."
  echo ""
  echo "Setup:"
  echo "  1. Supabase Dashboard → Settings → Database → Connection string"
  echo "  2. Copiar 'Direct connection' (NO el pooler)"
  echo "  3. export DIRECT_URL='postgresql://...'"
  echo ""
  echo "Importante: la password con \$ debe ir URL-encoded (%24)."
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo -e "${RED}ERROR:${NC} psql no instalado. brew install postgresql / apt install postgresql-client"
  exit 1
fi

cd "$(dirname "$0")/.."

WAVE1="prisma/migrations/proposed-db-indexes-wave-1.sql"
WAVE2="prisma/migrations/proposed-db-indexes-wave-2.sql"

if [[ ! -f "$WAVE1" ]] || [[ ! -f "$WAVE2" ]]; then
  echo -e "${RED}ERROR:${NC} archivos SQL no encontrados en prisma/migrations/"
  exit 1
fi

echo "Wave-1: $(grep -c 'CREATE INDEX' "$WAVE1") índices propuestos"
echo "Wave-2: $(grep -c 'CREATE INDEX' "$WAVE2") índices propuestos"
echo ""

echo "→ Sanity check: SELECT 1"
if ! psql "$DIRECT_URL" -c "SELECT 1;" >/dev/null 2>&1; then
  echo -e "${RED}ERROR:${NC} no se pudo conectar a la DB. Verifica DIRECT_URL + firewall."
  exit 1
fi
echo -e "${GREEN}✓${NC} DB accesible"
echo ""

BEFORE=$(psql "$DIRECT_URL" -tAc "SELECT COUNT(*) FROM pg_indexes WHERE schemaname = 'public';")
echo "Índices actuales en public: $BEFORE"
echo ""

echo -e "${YELLOW}→ Aplicando WAVE-1${NC}"
psql "$DIRECT_URL" -f "$WAVE1" 2>&1 | tail -10
echo -e "${GREEN}✓${NC} Wave-1 ok"
echo ""

echo -e "${YELLOW}→ Aplicando WAVE-2${NC}"
psql "$DIRECT_URL" -f "$WAVE2" 2>&1 | tail -10
echo -e "${GREEN}✓${NC} Wave-2 ok"
echo ""

AFTER=$(psql "$DIRECT_URL" -tAc "SELECT COUNT(*) FROM pg_indexes WHERE schemaname = 'public';")
ADDED=$((AFTER - BEFORE))

echo -e "${GREEN}═══ Resumen ═══${NC}"
echo "Índices antes:    $BEFORE"
echo "Índices después:  $AFTER"
echo "Nuevos creados:   $ADDED"
echo ""
echo "Verificación post-deploy en Supabase SQL Editor:"
echo "  SELECT indexname FROM pg_indexes WHERE schemaname='public' AND indexname LIKE 'idx_%' ORDER BY indexname;"
echo ""
echo "Recordatorio: actualizar MEMORIA-PROYECTO.md TD-042 a 'aplicado' tras éxito."
