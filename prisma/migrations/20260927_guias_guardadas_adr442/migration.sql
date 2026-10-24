-- Guías guardadas antes del ingreso (ADR-442).
--
-- Fase EXPAND pura (skill migration-planner): una tabla nueva, nada existente
-- cambia de forma. La versión de producción no la nombra.
--
-- Únicos SÓLO entre guías vivas: índices únicos PARCIALES (mismo criterio que
-- ADR-396 y ADR-441). Prisma no sabe declararlos: viven sólo en este archivo.
--  · una GTF no se guarda dos veces en el mismo negocio
--  · un N° de registro SNIFFS tampoco
--
-- Idempotente: todo lleva IF NOT EXISTS.
--
-- Aplicar por el pooler :5432 (session), nunca por 6543 ni con SET SESSION:
--   node -r dotenv/config scripts/aplicar-migracion-sesion.mjs prisma/migrations/20260927_guias_guardadas_adr442/migration.sql dotenv_config_path=.env.local
--   node scripts/prisma-session.mjs migrate resolve --applied 20260927_guias_guardadas_adr442
--
-- Para revertir (contar primero qué se perdería; los papeles viven en el
-- Drive y NO se pierden al quitar la tabla):
--   SELECT count(*) FROM "ForestGuiaGuardada";
-- y quitar a mano, con autorización, la tabla.

CREATE TABLE IF NOT EXISTS "ForestGuiaGuardada" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "numeroRegistro" TEXT,
  "gtfNumber" TEXT NOT NULL,
  "gtfDate" TIMESTAMP(3),
  "titularNombre" TEXT,
  "titularDoc" TEXT,
  "permisoCodigo" TEXT,
  "contratoId" TEXT,
  "serforGtf" JSONB,
  "serforConsultadaEn" TIMESTAMP(3),
  "notas" TEXT,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "ForestGuiaGuardada_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ForestGuiaGuardada_tenantId_deletedAt_idx" ON "ForestGuiaGuardada"("tenantId", "deletedAt");
CREATE INDEX IF NOT EXISTS "ForestGuiaGuardada_tenantId_gtfNumber_idx" ON "ForestGuiaGuardada"("tenantId", "gtfNumber");
CREATE INDEX IF NOT EXISTS "ForestGuiaGuardada_tenantId_numeroRegistro_idx" ON "ForestGuiaGuardada"("tenantId", "numeroRegistro");
CREATE UNIQUE INDEX IF NOT EXISTS "ForestGuiaGuardada_tenantId_gtf_vivo_key" ON "ForestGuiaGuardada"("tenantId", "gtfNumber") WHERE "deletedAt" IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "ForestGuiaGuardada_tenantId_registro_vivo_key" ON "ForestGuiaGuardada"("tenantId", "numeroRegistro") WHERE "deletedAt" IS NULL AND "numeroRegistro" IS NOT NULL;
