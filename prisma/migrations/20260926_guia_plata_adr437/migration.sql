-- ADR-437 · La plata de una guía: madera de servicio, a quién le pagas, precio
-- por especie, la madera en la cuenta del proveedor y el pago con comprobante.
--
-- Fase EXPAND pura (migration-planner): todo nullable o con default, sin DROP,
-- sin cambio de tipo, sin backfill. El código viejo sigue corriendo contra este
-- schema; el nuevo lo lee cuando el dev server se reinicie tras `prisma generate`.
-- Idempotente (`IF NOT EXISTS`): correrlo dos veces no rompe nada.
-- Aplicar por el pooler :5432 (session):
--   node scripts/prisma-session.mjs db execute --file prisma/migrations/20260926_guia_plata_adr437/migration.sql
--   node scripts/prisma-session.mjs migrate resolve --applied 20260926_guia_plata_adr437

-- 1. El asiento: madera de servicio (se escribe por guía, en todos los asientos
--    vivos del mismo gtfNumber), su dueño, a quién se le paga y el acta del precio.
--    Booleano con default y NO enum nullable: con NULL cada `where` necesita un
--    `OR null` y alguno de los ~40 lectores se olvida. En Postgres ≥11 el
--    ADD COLUMN … NOT NULL DEFAULT constante es sólo metadata (no reescribe).
ALTER TABLE "WoodEntry" ADD COLUMN IF NOT EXISTS "maderaDeTercero" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "WoodEntry" ADD COLUMN IF NOT EXISTS "duenoParteId" TEXT;
ALTER TABLE "WoodEntry" ADD COLUMN IF NOT EXISTS "duenoNombre" TEXT;
ALTER TABLE "WoodEntry" ADD COLUMN IF NOT EXISTS "proveedorParteId" TEXT;
ALTER TABLE "WoodEntry" ADD COLUMN IF NOT EXISTS "costoDetalle" JSONB;
CREATE INDEX IF NOT EXISTS "WoodEntry_tenantId_proveedorParteId_idx"
  ON "WoodEntry" ("tenantId", "proveedorParteId");
CREATE INDEX IF NOT EXISTS "WoodEntry_tenantId_duenoParteId_idx"
  ON "WoodEntry" ("tenantId", "duenoParteId");

-- 2. La cuenta forestal sabe de qué guía es cada movimiento.
ALTER TABLE "ForestCuentaMov" ADD COLUMN IF NOT EXISTS "gtfNumber" TEXT;
CREATE INDEX IF NOT EXISTS "ForestCuentaMov_tenantId_gtfNumber_idx"
  ON "ForestCuentaMov" ("tenantId", "gtfNumber");

-- 3. UN abono `madera` vivo por guía. Parcial: los pagos imputados a una guía
--    (concepto `pago`, también con gtfNumber) pueden ser N, y un abono dado de
--    baja no bloquea volver a anotarlo. Prisma no expresa índices parciales:
--    vive SÓLO acá (documentado en el `///` de ForestCuentaMov). La columna es
--    nueva ⇒ todas las filas tienen NULL ⇒ no hay duplicados que lo hagan fallar.
CREATE UNIQUE INDEX IF NOT EXISTS "ForestCuentaMov_tenantId_gtf_madera_vivo_key"
  ON "ForestCuentaMov" ("tenantId", "gtfNumber")
  WHERE "concepto" = 'madera' AND "gtfNumber" IS NOT NULL AND "deletedAt" IS NULL;

-- 4. Gastos de la guía (estiba, descarga, carguío, cubicación, vigilancia…):
--    el costo puesto en patio los junta sin meterlos en `costoTotal`.
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "gtfNumber" TEXT;
CREATE INDEX IF NOT EXISTS "Expense_tenantId_gtfNumber_idx"
  ON "Expense" ("tenantId", "gtfNumber");

-- 5. Un pago es una liquidación: sus comprobantes (FotoCarga[] firmadas).
ALTER TABLE "LiquidacionCuenta" ADD COLUMN IF NOT EXISTS "comprobantes" JSONB;
