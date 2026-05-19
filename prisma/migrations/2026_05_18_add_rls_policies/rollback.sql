-- ============================================================
-- ROLLBACK: ADR-114 RLS Postgres — revertir politicas
-- Fecha: 2026-05-18
-- Cuándo usar: si después de aplicar migration.sql hay errores en producción
--
-- Síntomas que indican que necesitas este rollback:
--   - Sentry: errores "row violates row-level security policy" inesperados
--   - Crons que dejan de procesar (silencioso — no hay error visible, solo
--     los jobs no corren porque RLS bloquea y retorna 0 filas)
--   - Admin de tenant A ve sus datos en blanco (SET LOCAL no está seteando)
--   - Errores 500 en checkout o POS
--
-- PROCEDIMIENTO:
--   1. Copiar este SQL completo
--   2. Pegar en Supabase SQL Editor (producción o staging según el caso)
--   3. Ejecutar — es idempotente, seguro correr varias veces
--   4. Verificar con query de chequeo al final
--   5. Monitorear Sentry por 15min
--   6. Crear issue post-mortem antes de re-intentar
--
-- NOTA: withRlsTenant() callers seguirán funcionando después del rollback
-- porque SET LOCAL con RLS disabled es simplemente ignorado por Postgres.
-- El app-level guard (tenantId en WHERE) continúa activo.
-- ============================================================


-- ─────────────────────────────────────────────────────────────
-- 1. Revertir: Order
-- ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "tenant_isolation_order" ON "Order";
ALTER TABLE "Order" DISABLE ROW LEVEL SECURITY;


-- ─────────────────────────────────────────────────────────────
-- 2. Revertir: Customer
-- ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "tenant_isolation_customer" ON "Customer";
ALTER TABLE "Customer" DISABLE ROW LEVEL SECURITY;


-- ─────────────────────────────────────────────────────────────
-- 3. Revertir: Sale
-- ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "tenant_isolation_sale" ON "Sale";
ALTER TABLE "Sale" DISABLE ROW LEVEL SECURITY;


-- ─────────────────────────────────────────────────────────────
-- 4. Revertir: Payment
-- ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "tenant_isolation_payment" ON "Payment";
ALTER TABLE "Payment" DISABLE ROW LEVEL SECURITY;


-- ─────────────────────────────────────────────────────────────
-- 5. Revertir: AuditLog
-- ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "tenant_isolation_auditlog" ON "AuditLog";
ALTER TABLE "AuditLog" DISABLE ROW LEVEL SECURITY;


-- ─────────────────────────────────────────────────────────────
-- Verificación post-rollback (ejecutar para confirmar):
--
--   SELECT schemaname, tablename, rowsecurity, forcerowsecurity
--   FROM pg_tables
--   WHERE tablename IN ('Order','Customer','Sale','Payment','AuditLog');
--
-- Resultado esperado: rowsecurity=f (false) en todas las tablas.
-- Si alguna sigue en true, correr el DROP POLICY + DISABLE de esa tabla.
-- ─────────────────────────────────────────────────────────────
