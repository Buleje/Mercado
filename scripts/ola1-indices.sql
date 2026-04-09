-- ═══════════════════════════════════════════════════════════════════════════
-- Sprint 2 Ola 1 — Índices faltantes de TD-020
-- Fecha: 2026-04-09
-- ADR: docs/adr/017-ola1-migrations-indices-strategy.md
-- Plan: docs/migration-plan-indices-ola1-2026-04-09.md
--
-- CONTEXTO IMPORTANTE:
-- El PASO 0 (scripts/verify-pg-indexes-ola1.ts) se ejecutó contra producción
-- el 2026-04-09 y confirmó que:
--   ✅ TD-019 ya aplicado (3 índices en WholesaleOrderItem + StoreProduct)
--   ✅ TD-021 ya aplicado (1 índice en StorePermission.userId)
--   ❌ TD-020 faltante (los 4 compound indexes de abajo)
--
-- CÓMO EJECUTAR ESTE SCRIPT:
--
-- Opción A — Supabase Dashboard (RECOMENDADA)
--   1. https://supabase.com/dashboard → proyecto sofkgguriggocouiuamx
--   2. SQL Editor → New query
--   3. Pegar este script completo y ejecutar
--   4. Verificar con los SELECTs del final
--
-- Opción B — psql local (requiere resolver DNS 1.1.1.1 en Windows)
--   psql "$DIRECT_URL" -f scripts/ola1-indices.sql
--
-- NO EJECUTAR VIA `npx prisma migrate` — CREATE INDEX CONCURRENTLY es
-- incompatible con las transacciones implícitas de Prisma Migrate.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── TD-020.1: PurchaseOrder — "órdenes de compra pendientes del tenant X" ──
CREATE INDEX CONCURRENTLY IF NOT EXISTS "PurchaseOrder_tenantId_status_idx"
    ON "PurchaseOrder" ("tenantId", "status");

-- ── TD-020.2: Payable — "cuentas por pagar pendientes/parciales del tenant X" ──
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Payable_tenantId_status_idx"
    ON "Payable" ("tenantId", "status");

-- ── TD-020.3: NotificationLog — "últimas N notificaciones del tenant X" (paginado) ──
CREATE INDEX CONCURRENTLY IF NOT EXISTS "NotificationLog_tenantId_createdAt_idx"
    ON "NotificationLog" ("tenantId", "createdAt" DESC);

-- ── TD-020.4: SupportTicket — "tickets abiertos del tenant X" ──
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SupportTicket_tenantId_status_idx"
    ON "SupportTicket" ("tenantId", "status");

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICACIÓN POST-EJECUCIÓN (correr estos SELECT después de los CREATE)
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Confirmar que los 4 índices nuevos existen
SELECT tablename, indexname
FROM pg_indexes
WHERE indexname IN (
    'PurchaseOrder_tenantId_status_idx',
    'Payable_tenantId_status_idx',
    'NotificationLog_tenantId_createdAt_idx',
    'SupportTicket_tenantId_status_idx'
)
ORDER BY tablename;

-- 2. Confirmar que ninguno quedó INVALID (estado de CONCURRENTLY interrumpido)
SELECT c.relname AS indexname, t.relname AS tablename
FROM pg_index i
JOIN pg_class c ON c.oid = i.indexrelid
JOIN pg_class t ON t.oid = i.indrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE i.indisvalid = false
  AND n.nspname = 'public'
  AND c.relname LIKE '%tenantId%';

-- 3. (Opcional) Medir impacto — comparar contra baseline pre-índice
--    Ejemplo: PurchaseOrder con filtro (tenantId, status)
-- EXPLAIN (ANALYZE, BUFFERS)
-- SELECT id, status, total, "createdAt"
-- FROM "PurchaseOrder"
-- WHERE "tenantId" = 'REEMPLAZAR_CON_TENANT_ID_REAL'
--   AND "status" = 'pendiente'
-- ORDER BY "createdAt" DESC
-- LIMIT 50;
