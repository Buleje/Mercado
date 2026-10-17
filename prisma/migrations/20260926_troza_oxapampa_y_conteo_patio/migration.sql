-- Cubicación Oxapampa por troza + D1/D2 medidos en planta + acta del conteo
-- del patio (Brandon 2026-09-26).
--
-- Fase EXPAND pura, idempotente (`IF NOT EXISTS`):
--  · WoodEntryTroza: 6 columnas NULL + 1 booleano con DEFAULT constante. En
--    Postgres 11+ ninguna reescribe la tabla (el default vive en el catálogo) y
--    el código viejo no las nombra: un INSERT que no las trae recibe NULL/false.
--  · ForestPatioConteo: tabla nueva, nada existente se toca.
--
-- Aplicar por el pooler :5432 (session), NUNCA por 6543 ni con SET SESSION:
--   node scripts/prisma-session.mjs db execute --file prisma/migrations/20260926_troza_oxapampa_y_conteo_patio/migration.sql
--   node scripts/prisma-session.mjs migrate resolve --applied 20260926_troza_oxapampa_y_conteo_patio
--
-- Para revertir: contar primero qué se perdería
--   SELECT count(*) FROM "WoodEntryTroza" WHERE "oxPt" IS NOT NULL OR "d1d2MedidoEnPlanta";
--   SELECT count(*) FROM "ForestPatioConteo";
-- y quitar las 7 columnas de "WoodEntryTroza" y la tabla "ForestPatioConteo"
-- (ALTER TABLE … DROP COLUMN IF EXISTS / DROP TABLE IF EXISTS), a mano y con
-- autorización: ningún código viejo depende de ellas.

ALTER TABLE "WoodEntryTroza" ADD COLUMN IF NOT EXISTS "oxD1Pulg" DECIMAL(8,2);
ALTER TABLE "WoodEntryTroza" ADD COLUMN IF NOT EXISTS "oxD2Pulg" DECIMAL(8,2);
ALTER TABLE "WoodEntryTroza" ADD COLUMN IF NOT EXISTS "oxLargoPies" DECIMAL(8,2);
ALTER TABLE "WoodEntryTroza" ADD COLUMN IF NOT EXISTS "oxPt" DECIMAL(12,2);
ALTER TABLE "WoodEntryTroza" ADD COLUMN IF NOT EXISTS "oxMedidoEn" TIMESTAMP(3);
ALTER TABLE "WoodEntryTroza" ADD COLUMN IF NOT EXISTS "oxMedidoPor" TEXT;
ALTER TABLE "WoodEntryTroza" ADD COLUMN IF NOT EXISTS "d1d2MedidoEnPlanta" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "ForestPatioConteo" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "fecha" DATE NOT NULL,
  "hechoPor" TEXT NOT NULL,
  "registradoPor" TEXT,
  "iniciadoEn" TIMESTAMP(3) NOT NULL,
  "terminadoEn" TIMESTAMP(3),
  "fotoEn" TIMESTAMP(3),
  "truncado" BOOLEAN NOT NULL DEFAULT false,
  "esperadas" INTEGER NOT NULL,
  "contadas" INTEGER NOT NULL,
  "m3Esperado" DECIMAL(12,4),
  "m3Contado" DECIMAL(12,4),
  "faltantes" JSONB NOT NULL,
  "sobrantes" JSONB NOT NULL,
  "sorpresas" JSONB,
  "detalle" JSONB,
  "notas" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ForestPatioConteo_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ForestPatioConteo_tenantId_iniciadoEn_key" ON "ForestPatioConteo"("tenantId", "iniciadoEn");
CREATE INDEX IF NOT EXISTS "ForestPatioConteo_tenantId_fecha_idx" ON "ForestPatioConteo"("tenantId", "fecha");
