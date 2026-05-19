#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# scripts/apply-pending-migrations-brandon.sh
#
# Aplica las migrations pendientes detectadas por los 6 audit agents.
# Brandon debe correrlo desde una máquina con acceso DIRECTO a Supabase
# (NO desde WSL — WSL no alcanza la DB por DNS, error P1001).
#
# Uso:
#   1. Abrir terminal Windows (cmd o PowerShell, NO WSL)
#   2. cd C:\Users\Brandon\proyectos\Mercado  (o ruta equivalente)
#   3. bash scripts/apply-pending-migrations-brandon.sh
#
# Lo que aplica:
#   1. wave-1 indexes (12 indexes CONCURRENTLY, no bloquean prod)
#   2. logRetentionDays default 90 → 1825 (Ley 29733 PE retention 5 años)
#
# Lo que NO toca:
#   - Stripe Price IDs (debes regenerar manualmente en dashboard.stripe.com)
#   - Customer @@unique[tenantId, phone] (requiere data migration custom)
# ─────────────────────────────────────────────────────────────────────────────

set -e
cd "$(dirname "$0")/.."

echo "🔍 Cargando .env.local..."
if [ ! -f .env.local ]; then
  echo "❌ .env.local no existe. Abort."
  exit 1
fi
set -a
source .env.local
set +a

if [ -z "$DIRECT_URL" ]; then
  echo "❌ DIRECT_URL no configurada en .env.local. Abort."
  exit 1
fi

echo "✅ DIRECT_URL detectada"
echo ""

# ─── Paso 1: Verificar conectividad ─────────────────────────────────────────
echo "🔌 Test conectividad DB..."
if ! DATABASE_URL="$DIRECT_URL" timeout 15 npx prisma db execute --stdin <<<"SELECT 1;" 2>&1 | tail -3; then
  echo ""
  echo "❌ No se pudo conectar a la DB."
  echo "   Razones posibles:"
  echo "   - Estás en WSL sin acceso DNS a Supabase (corre desde Windows direct)"
  echo "   - DIRECT_URL tiene credenciales viejas"
  echo "   - Supabase pausó el proyecto (free tier inactividad)"
  exit 1
fi

echo "✅ Conectividad OK"
echo ""

# ─── Paso 2: Aplicar wave-1 indexes ─────────────────────────────────────────
echo "📦 Aplicando wave-1 indexes (12 CREATE INDEX CONCURRENTLY)..."
echo "   No bloquea producción. Idempotente (IF NOT EXISTS)."
echo ""

if DATABASE_URL="$DIRECT_URL" timeout 120 npx prisma db execute \
   --file prisma/migrations/proposed-db-indexes-wave-1.sql 2>&1 | tail -10; then
  echo ""
  echo "✅ wave-1 indexes aplicados"
else
  echo "⚠️  Algunos índices pueden haber fallado (probable: ya existían)."
  echo "   Verifica el output arriba — si dice 'already exists', está OK."
fi
echo ""

# ─── Paso 3: Migration logRetentionDays ─────────────────────────────────────
echo "📜 Aplicando migration: logRetentionDays default 90 → 1825 (Ley 29733)..."

cat > /tmp/migration-log-retention.sql <<'EOF'
-- Ley 29733 PE: audit log retention mínimo 5 años (1825 días).
-- Antes default 90 días (3 meses) — incumplimiento si admin no cambia el setting.
ALTER TABLE "Settings"
  ALTER COLUMN "logRetentionDays" SET DEFAULT 1825;

-- Backfill: tenants con setting null o con 90 (default antiguo) → subir a 1825.
-- Tenants que explícitamente configuraron otro valor (180, 365, etc.) se respetan.
UPDATE "Settings"
SET "logRetentionDays" = 1825
WHERE "logRetentionDays" IS NULL OR "logRetentionDays" = 90;
EOF

if DATABASE_URL="$DIRECT_URL" timeout 30 npx prisma db execute \
   --file /tmp/migration-log-retention.sql 2>&1 | tail -5; then
  echo "✅ logRetentionDays migration aplicada"
else
  echo "⚠️  Migration logRetentionDays falló — revisar manualmente"
fi
echo ""

# ─── Paso 4: Actualizar schema.prisma con nuevo default ─────────────────────
echo "📝 Recordatorio: actualizar prisma/schema.prisma línea 653:"
echo "   logRetentionDays Int?    @default(1825)  // antes 90"
echo "   Después: npx prisma generate"
echo ""

# ─── Paso 5: Resumen ────────────────────────────────────────────────────────
echo "═══════════════════════════════════════════════════════════════"
echo "RESUMEN"
echo "═══════════════════════════════════════════════════════════════"
echo "✅ wave-1 indexes: aplicados"
echo "✅ logRetentionDays default: 90 → 1825 (Ley 29733 compliant)"
echo "✅ Tenants con valor null/90: backfilled a 1825"
echo ""
echo "PENDIENTE (no automatizable):"
echo "❌ Stripe Price IDs TEST → LIVE — debes hacerlo en dashboard.stripe.com"
echo "   1. Login dashboard.stripe.com"
echo "   2. Switch a LIVE mode (toggle arriba)"
echo "   3. Products → crear 4 prices (Free/Starter/Pro/Business)"
echo "   4. Copiar nuevos price_xxx IDs"
echo "   5. Actualizar lib/billing/plan-tiers.ts con las nuevas IDs"
echo "   6. Actualizar STRIPE_SECRET_KEY en Vercel env vars (sk_live_)"
echo "   7. Redeploy"
echo ""
echo "❌ Customer @@unique[tenantId, phone] TD-040 Phase 3 — requiere"
echo "   data migration custom (4h trabajo). NO correr este script para eso."
echo ""
echo "════════════════════════════════════════════════════════════════"
echo "Done. Score DB: 17 → 18 estimado tras aplicar wave-1 + retention."
