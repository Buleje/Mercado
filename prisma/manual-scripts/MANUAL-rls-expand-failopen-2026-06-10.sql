-- ─────────────────────────────────────────────────────────────────────────────
-- RLS TD-116 · FASE EXPAND (audit 2026-06-10) — políticas fail-open
--
-- Feynman: la política original era una puerta que SOLO abre si mostrás
-- credencial (app.tenant_id seteado). Como casi ningún código la muestra aún,
-- cambiar el rol de la app rompería TODO (0 filas en cada query).
-- Esta fase la vuelve "fail-open": sin credencial la puerta queda abierta
-- (protege solo los paths migrados a withRlsTx). La FASE CONTRACT (futura,
-- cuando TD-116 llegue a 100%) la vuelve fail-closed de nuevo.
--
-- NULLIF(...,'') maneja el caso de setting vacío que dejan algunos poolers.
-- APLICAR: psql "$DIRECT_URL" -f prisma/manual-scripts/MANUAL-rls-expand-failopen-2026-06-10.sql
-- ROLLBACK: re-aplicar prisma/migrations/20260520055233_add_rls_policies_adr_114
-- ─────────────────────────────────────────────────────────────────────────────
BEGIN;

ALTER POLICY tenant_isolation_order ON "Order"
  USING (
    NULLIF(current_setting('app.tenant_id', true), '') IS NULL
    OR "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.tenant_id', true) = ANY (ARRAY['__system__', '__superadmin__'])
  );

ALTER POLICY tenant_isolation_sale ON "Sale"
  USING (
    NULLIF(current_setting('app.tenant_id', true), '') IS NULL
    OR "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.tenant_id', true) = ANY (ARRAY['__system__', '__superadmin__'])
  );

ALTER POLICY tenant_isolation_customer ON "Customer"
  USING (
    NULLIF(current_setting('app.tenant_id', true), '') IS NULL
    OR "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.tenant_id', true) = ANY (ARRAY['__system__', '__superadmin__'])
  );

ALTER POLICY tenant_isolation_activitylog ON "ActivityLog"
  USING (
    NULLIF(current_setting('app.tenant_id', true), '') IS NULL
    OR "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.tenant_id', true) = ANY (ARRAY['__system__', '__superadmin__'])
  );

COMMIT;
