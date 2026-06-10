-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION P0 · WholesaleOrder.tenantId backfill + NOT NULL
-- Ticket: audit04-database.md — hallazgo #3 (aislamiento multi-tenant ROTO)
--
-- PROBLEMA:
--   WholesaleOrder.tenantId es String? (nullable) → cualquier query sin WHERE
--   tenantId puede retornar órdenes de OTRO tenant. Aislamiento multi-tenant roto.
--
-- PATRÓN: Expand → Migrate (backfill) → Contract (NOT NULL)
--   La columna tenantId ya existe como nullable (EXPAND ya aplicado en schema).
--   Esta migration hace el BACKFILL y luego el CONTRACT (NOT NULL).
--
-- ESTRATEGIA DE BACKFILL:
--   WholesaleOrder tiene buyerTenantId (comprador) y sellerTenantId (vendedor).
--   El tenantId semántico = buyerTenantId (el tenant que "posee" la orden desde
--   perspectiva de aislamiento: el comprador ve sus propias órdenes).
--   Si tenantId IS NULL → rellenar con buyerTenantId.
--
-- APLICAR con DIRECT_URL (no pgBouncer):
--   psql "$DIRECT_URL" -f prisma/migrations/MANUAL-p0-wholesale-order-tenantid-not-null.sql
--
-- ROLLBACK (si NOT NULL falla por filas null post-backfill):
--   -- No hay rollback del backfill (datos ya rellenados son correctos)
--   -- Solo revertir el constraint:
--   ALTER TABLE "WholesaleOrder" ALTER COLUMN "tenantId" DROP NOT NULL;
--
-- RIESGO: MEDIO-BAJO
--   - Si hay filas con buyerTenantId null: el backfill dejará esas filas con
--     tenantId null → el ALTER NOT NULL fallará → SAFE (rollback automático en tx)
--   - Si Tenant referenciado no existe (FK violation): el UPDATE pasará igual
--     porque la FK se verifica en INSERT/UPDATE de la FK en la dirección correcta.
--     El constraint EXISTS en la FK ya existente — no agregamos nueva FK aquí.
--   - Lock: ALTER TABLE NOT NULL en PG 12+ no requiere rewrite si hay CHECK NOT NULL
--     pre-existente. En versiones anteriores puede bloquear la tabla brevemente.
--
-- DIAGNÓSTICO PRE-APPLY (ejecutar antes de aplicar):
--   SELECT COUNT(*) AS rows_will_be_backfilled
--   FROM "WholesaleOrder"
--   WHERE "tenantId" IS NULL;
--
--   SELECT COUNT(*) AS rows_with_buyer_null
--   FROM "WholesaleOrder"
--   WHERE "tenantId" IS NULL AND "buyerTenantId" IS NULL;
--   -- Si esta query retorna > 0: ABORTAR. Esas filas no tienen buyerTenantId
--   -- válido para backfill. Investigar antes de continuar.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── PASO 1: Diagnóstico (NO bloquea, solo informa) ──────────────────────────

-- Contar filas null pre-backfill
DO $$
DECLARE
  null_count  INTEGER;
  buyer_null  INTEGER;
BEGIN
  SELECT COUNT(*) INTO null_count
  FROM "WholesaleOrder"
  WHERE "tenantId" IS NULL;

  SELECT COUNT(*) INTO buyer_null
  FROM "WholesaleOrder"
  WHERE "tenantId" IS NULL AND "buyerTenantId" IS NULL;

  RAISE NOTICE '[P0-backfill] WholesaleOrder rows con tenantId NULL: %', null_count;
  RAISE NOTICE '[P0-backfill] De esas, con buyerTenantId también NULL: %', buyer_null;

  -- ABORTAR si hay filas que no podemos backfill (comprador desconocido)
  IF buyer_null > 0 THEN
    RAISE EXCEPTION
      '[P0-ABORT] % filas tienen tenantId=NULL y buyerTenantId=NULL. '
      'No se puede hacer backfill seguro. Investigar y limpiar datos antes de aplicar.',
      buyer_null;
  END IF;
END $$;

-- ── PASO 2: Backfill — tenantId = buyerTenantId donde es NULL ───────────────

UPDATE "WholesaleOrder"
SET "tenantId" = "buyerTenantId"
WHERE "tenantId" IS NULL;

-- ── PASO 3: Verificación post-backfill ──────────────────────────────────────

DO $$
DECLARE
  remaining_null INTEGER;
BEGIN
  SELECT COUNT(*) INTO remaining_null
  FROM "WholesaleOrder"
  WHERE "tenantId" IS NULL;

  IF remaining_null > 0 THEN
    RAISE EXCEPTION
      '[P0-ABORT] Aún quedan % filas con tenantId=NULL después del backfill. '
      'Investigar antes de aplicar NOT NULL constraint.',
      remaining_null;
  END IF;

  RAISE NOTICE '[P0-backfill] Backfill completado. 0 filas con tenantId=NULL. Procediendo a NOT NULL.';
END $$;

-- ── PASO 4: CONTRACT — hacer NOT NULL (solo si backfill fue 100% exitoso) ───

-- PostgreSQL 12+: si no hay NULLs, este ALTER es instantáneo (metadata-only).
-- PostgreSQL < 12: puede hacer table rewrite breve. Ver pg_version().
ALTER TABLE "WholesaleOrder"
  ALTER COLUMN "tenantId" SET NOT NULL;

-- ── PASO 5: Verificación final ───────────────────────────────────────────────

DO $$
BEGIN
  RAISE NOTICE '[P0-done] WholesaleOrder.tenantId es ahora NOT NULL. Aislamiento multi-tenant restaurado.';
END $$;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- POST-APPLY: actualizar schema.prisma
--
-- Cambiar en prisma/schema.prisma línea ~2929:
--   ANTES:  tenantId  String?
--   DESPUÉS: tenantId  String
--
-- Y también remover el comentario EXPAND-PATTERN ya que el contract está hecho.
--
-- Luego ejecutar:
--   npx prisma generate   (regenera el cliente con el tipo correcto)
--
-- NO ejecutar prisma migrate deploy — la migration ya fue aplicada manualmente.
-- ─────────────────────────────────────────────────────────────────────────────
