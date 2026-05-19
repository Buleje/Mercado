-- ============================================================
-- ADR-114: RLS Postgres híbrido — defensa en profundidad
-- Fecha: 2026-05-18
-- Autor: Brandon Buleje
-- Runbook: docs/security/rls-postgres-runbook.md
--
-- PREREQUISITO CRÍTICO antes de aplicar este script:
--   El usuario de DB que corre las migrations DEBE tener BYPASSRLS.
--   De lo contrario, ALTER TABLE FORCE ROW LEVEL SECURITY bloqueará
--   al propio usuario de migrations.
--
--   Crear en Supabase SQL Editor (como postgres admin):
--     CREATE ROLE prisma_migrator WITH LOGIN PASSWORD '...' BYPASSRLS;
--     GRANT ALL PRIVILEGES ON DATABASE postgres TO prisma_migrator;
--     GRANT ALL ON SCHEMA public TO prisma_migrator;
--   Luego actualizar DIRECT_URL en .env a usar prisma_migrator.
--
-- TABLAS AFECTADAS (5 tablas de mayor riesgo PII + dinero):
--   Order, Customer, Sale, Payment, AuditLog
--
-- TABLAS FUERA DE ALCANCE (Sprint 4+):
--   Product, Category, Settings, Notification, etc. — riesgo menor
--
-- ROLLBACK: ver rollback.sql en este mismo directorio
-- ============================================================


-- ─────────────────────────────────────────────────────────────
-- 0. Función helper para current_setting con fallback seguro
--    current_setting('app.tenant_id', true) retorna NULL si no
--    está seteado (el segundo argumento "true" evita el ERROR).
--    Las policies usan esto para bloqueар silenciosamente queries
--    sin contexto de tenant.
-- ─────────────────────────────────────────────────────────────

-- No se necesita función extra: current_setting con missing_ok=true
-- (segundo argumento = true) ya es NULL-safe en Postgres 9.6+.
-- Supabase corre Postgres 15+ — confirmado compatible.


-- ─────────────────────────────────────────────────────────────
-- 1. Tabla: Order
--    Riesgo: pedidos marketplace + ERP, incluye customerPhone,
--            customerLocation, total, paymentMethod
-- ─────────────────────────────────────────────────────────────

ALTER TABLE "Order" ENABLE ROW LEVEL SECURITY;

-- FORCE aplica RLS también al owner de la tabla (el role postgres/supabase).
-- Sin FORCE, el superuser bypasea RLS silenciosamente — peligroso en Supabase
-- donde el service_role key tiene privilegios de superuser.
ALTER TABLE "Order" FORCE ROW LEVEL SECURITY;

-- Policy: un row solo es visible si el tenantId coincide con la sesión actual,
-- O si la sesión está marcada como sistema/superadmin.
-- Nota: aplica tanto a SELECT como a UPDATE/DELETE (USING sin WITH CHECK
-- aplica solo a reads. Para writes, agregar WITH CHECK en Sprint 4).
CREATE POLICY "tenant_isolation_order" ON "Order"
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.tenant_id', true) IN ('__system__', '__superadmin__')
  );


-- ─────────────────────────────────────────────────────────────
-- 2. Tabla: Customer
--    Riesgo: PII del cliente final (nombre, DNI, email, teléfono,
--            dirección), Ley 29733 PE máxima exposición
-- ─────────────────────────────────────────────────────────────

ALTER TABLE "Customer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Customer" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_customer" ON "Customer"
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.tenant_id', true) IN ('__system__', '__superadmin__')
  );


-- ─────────────────────────────────────────────────────────────
-- 3. Tabla: Sale
--    Riesgo: ventas POS (dinero), incluye cashRegisterId,
--            discount, total, payment refs del vendedor
-- ─────────────────────────────────────────────────────────────

ALTER TABLE "Sale" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Sale" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_sale" ON "Sale"
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.tenant_id', true) IN ('__system__', '__superadmin__')
  );


-- ─────────────────────────────────────────────────────────────
-- 4. Tabla: Payment
--    Riesgo: transacciones Yape/Stripe/Mercado Pago
--            (montos, referencias, teléfono Yape = PII bancaria)
-- ─────────────────────────────────────────────────────────────

ALTER TABLE "Payment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Payment" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_payment" ON "Payment"
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.tenant_id', true) IN ('__system__', '__superadmin__')
  );


-- ─────────────────────────────────────────────────────────────
-- 5. Tabla: AuditLog
--    Riesgo: chain de auditoría Ley 29733, tamper evidence.
--            Un tenant NO debe leer el audit de otro tenant.
--            __system__ necesita acceso para audit-chain-integrity cron.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_auditlog" ON "AuditLog"
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.tenant_id', true) IN ('__system__', '__superadmin__')
  );


-- ─────────────────────────────────────────────────────────────
-- Verificación post-apply (ejecutar manualmente para confirmar):
--
--   SELECT schemaname, tablename, rowsecurity, forcerowsecurity
--   FROM pg_tables
--   WHERE tablename IN ('Order','Customer','Sale','Payment','AuditLog');
--
--   SELECT schemaname, tablename, policyname, cmd, qual
--   FROM pg_policies
--   WHERE tablename IN ('Order','Customer','Sale','Payment','AuditLog');
--
-- Resultado esperado: rowsecurity=t, forcerowsecurity=t, 1 policy por tabla.
-- ─────────────────────────────────────────────────────────────
