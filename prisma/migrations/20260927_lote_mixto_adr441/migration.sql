-- Lote MIXTO (ADR-441): la pila escaneada vive en el servidor, se reparte por
-- especie+permiso en lotes de aserrío hijos.
--
-- Fase EXPAND pura (skill migration-planner): nada existente cambia de forma.
--  · ForestLoteMixto: tabla nueva.
--  · WoodEntryTroza: "loteMixtoId" TEXT NULL + "reservadaMixtoEn" TIMESTAMP NULL.
--  · ForestLoteAserrio: "loteMixtoId" TEXT NULL (de qué mixto salió cada hijo).
--  Columnas NULL sin default: cambio de catálogo, no reescriben la tabla. La
--  versión de producción no las nombra: un INSERT viejo recibe NULL.
--
-- El código del mixto es único SÓLO entre mixtos vivos: índice único PARCIAL
-- "ForestLoteMixto_tenantId_code_vivo_key" (mismo criterio que ADR-396 para
-- los lotes de aserrío). Prisma no sabe declararlo: vive sólo en este archivo.
--
-- Idempotente sin bloques DO: todo lleva IF NOT EXISTS salvo las dos FK
-- (Postgres no tiene ADD CONSTRAINT IF NOT EXISTS). En la segunda corrida la FK
-- responde «already exists» y el aplicador la salta dentro de un SAVEPOINT.
--
-- Aplicar por el pooler :5432 (session), nunca por 6543 ni con SET SESSION:
--   node -r dotenv/config scripts/aplicar-migracion-sesion.mjs prisma/migrations/20260927_lote_mixto_adr441/migration.sql dotenv_config_path=.env.local
--   node scripts/prisma-session.mjs migrate resolve --applied 20260927_lote_mixto_adr441
--
-- Para revertir (contar primero qué se perdería):
--   SELECT count(*) FROM "ForestLoteMixto";
--   SELECT count(*) FROM "WoodEntryTroza" WHERE "loteMixtoId" IS NOT NULL;
--   SELECT count(*) FROM "ForestLoteAserrio" WHERE "loteMixtoId" IS NOT NULL;
-- y quitar a mano, con autorización, las dos FK, las tres columnas y la tabla.

CREATE TABLE IF NOT EXISTS "ForestLoteMixto" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'abierto',
  "notes" TEXT,
  "contratoId" TEXT,
  "abiertoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "repartidoEn" TIMESTAMP(3),
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "ForestLoteMixto_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ForestLoteMixto_tenantId_status_idx" ON "ForestLoteMixto"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "ForestLoteMixto_tenantId_code_idx" ON "ForestLoteMixto"("tenantId", "code");
CREATE UNIQUE INDEX IF NOT EXISTS "ForestLoteMixto_tenantId_code_vivo_key" ON "ForestLoteMixto"("tenantId", "code") WHERE "deletedAt" IS NULL;

ALTER TABLE "WoodEntryTroza" ADD COLUMN IF NOT EXISTS "loteMixtoId" TEXT;
ALTER TABLE "WoodEntryTroza" ADD COLUMN IF NOT EXISTS "reservadaMixtoEn" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "WoodEntryTroza_tenantId_loteMixtoId_idx" ON "WoodEntryTroza"("tenantId", "loteMixtoId");

ALTER TABLE "ForestLoteAserrio" ADD COLUMN IF NOT EXISTS "loteMixtoId" TEXT;
CREATE INDEX IF NOT EXISTS "ForestLoteAserrio_tenantId_loteMixtoId_idx" ON "ForestLoteAserrio"("tenantId", "loteMixtoId");

ALTER TABLE "WoodEntryTroza" ADD CONSTRAINT "WoodEntryTroza_loteMixtoId_fkey" FOREIGN KEY ("loteMixtoId") REFERENCES "ForestLoteMixto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ForestLoteAserrio" ADD CONSTRAINT "ForestLoteAserrio_loteMixtoId_fkey" FOREIGN KEY ("loteMixtoId") REFERENCES "ForestLoteMixto"("id") ON DELETE SET NULL ON UPDATE CASCADE;
