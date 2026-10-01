-- ─────────────────────────────────────────────────────────────────────────────
-- RLS FIX · store-page tables — GUC name mismatch (2026-06-24)
--
-- Feynman: el resto del schema (Order/Sale/Customer…) usa la credencial
-- `app.tenant_id` con política FAIL-OPEN (sin credencial → puerta abierta,
-- ADR-114 / TD-116). Pero las 4 tablas del sistema store-page nacieron en la
-- migration 20260411_store_page_system con OTRA credencial `app.current_tenant_id`
-- (que NADIE setea — la app setea `app.tenant_id` en prisma-rls.ts) y SIN
-- fail-open → bajo el rol `buleje_app` TODO acceso queda bloqueado:
--   • lecturas devuelven 0 filas (el editor cae a defaults)
--   • escrituras → "new row violates row-level security policy"
-- (TenantPageVisit además solo tenía policy de READ → el INSERT de visitas
--  fallaba siempre).
--
-- Este fix re-crea las 4 políticas con el patrón canónico fail-open + el GUC
-- correcto `app.tenant_id` + bypass system/superadmin. Idempotente.
-- NO toca las políticas `*_service_role_all`.
--
-- APLICAR:  psql "$DIRECT_URL" -f prisma/manual-scripts/MANUAL-rls-fix-store-page-guc-2026-06-24.sql
-- ROLLBACK: re-aplicar prisma/migrations/20260411000000_store_page_system/migration.sql
-- ─────────────────────────────────────────────────────────────────────────────
BEGIN;

-- TenantStorePage ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "TenantStorePage_tenant_isolation" ON "TenantStorePage";
CREATE POLICY "TenantStorePage_tenant_isolation" ON "TenantStorePage"
  FOR ALL
  USING (
    NULLIF(current_setting('app.tenant_id', true), '') IS NULL
    OR "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.tenant_id', true) = ANY (ARRAY['__system__', '__superadmin__'])
  )
  WITH CHECK (
    NULLIF(current_setting('app.tenant_id', true), '') IS NULL
    OR "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.tenant_id', true) = ANY (ARRAY['__system__', '__superadmin__'])
  );

-- TenantPageProductOverride ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "TenantPageProductOverride_tenant_isolation" ON "TenantPageProductOverride";
CREATE POLICY "TenantPageProductOverride_tenant_isolation" ON "TenantPageProductOverride"
  FOR ALL
  USING (
    NULLIF(current_setting('app.tenant_id', true), '') IS NULL
    OR "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.tenant_id', true) = ANY (ARRAY['__system__', '__superadmin__'])
  )
  WITH CHECK (
    NULLIF(current_setting('app.tenant_id', true), '') IS NULL
    OR "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.tenant_id', true) = ANY (ARRAY['__system__', '__superadmin__'])
  );

-- TenantPagePromotion ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "TenantPagePromotion_tenant_isolation" ON "TenantPagePromotion";
CREATE POLICY "TenantPagePromotion_tenant_isolation" ON "TenantPagePromotion"
  FOR ALL
  USING (
    NULLIF(current_setting('app.tenant_id', true), '') IS NULL
    OR "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.tenant_id', true) = ANY (ARRAY['__system__', '__superadmin__'])
  )
  WITH CHECK (
    NULLIF(current_setting('app.tenant_id', true), '') IS NULL
    OR "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.tenant_id', true) = ANY (ARRAY['__system__', '__superadmin__'])
  );

-- TenantPageVisit (antes solo READ → ahora ALL, para permitir el INSERT) ───────
DROP POLICY IF EXISTS "TenantPageVisit_tenant_isolation_read" ON "TenantPageVisit";
DROP POLICY IF EXISTS "TenantPageVisit_tenant_isolation" ON "TenantPageVisit";
CREATE POLICY "TenantPageVisit_tenant_isolation" ON "TenantPageVisit"
  FOR ALL
  USING (
    NULLIF(current_setting('app.tenant_id', true), '') IS NULL
    OR "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.tenant_id', true) = ANY (ARRAY['__system__', '__superadmin__'])
  )
  WITH CHECK (
    NULLIF(current_setting('app.tenant_id', true), '') IS NULL
    OR "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.tenant_id', true) = ANY (ARRAY['__system__', '__superadmin__'])
  );

COMMIT;
