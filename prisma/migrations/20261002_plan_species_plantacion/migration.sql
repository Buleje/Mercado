-- ADR-459 · Plantación sin censo: el registro es la base.
--
-- El registro de una plantación declara, por especie, el volumen (ya existía:
-- `volumenAutorizadoM3`), el año en que se instaló y la superficie que ocupa.
-- Con eso se trabaja la plantación sin censo: tala, trozado y salida descuentan
-- del volumen registrado.
--
-- EXPAND puro: dos columnas NULLABLE, sin default. En Postgres es un cambio de
-- catálogo (no reescribe la tabla) y el código viejo no las lee. Las filas que
-- ya existen quedan en NULL, que es exactamente «no se declaró» — nunca 0.
-- Sin CHECK a propósito (`ADD CONSTRAINT` no admite IF NOT EXISTS y este archivo
-- tiene que poder correrse dos veces): año 1900–2100 y superficie ≥ 0 los exige
-- el Zod de `/api/admin/forestal/plan/species` y del alta del plan.
--
-- Para revertir (contar primero qué se perdería):
--   SELECT count(*) FROM "ForestPlanSpecies" WHERE "anioInstalacion" IS NOT NULL OR "superficieHa" IS NOT NULL;
--   ALTER TABLE "ForestPlanSpecies" DROP COLUMN IF EXISTS "anioInstalacion", DROP COLUMN IF EXISTS "superficieHa";
--
-- Aplicar: node scripts/prisma-session.mjs db execute --file prisma/migrations/20261002_plan_species_plantacion/migration.sql
--          node scripts/prisma-session.mjs migrate resolve --applied 20261002_plan_species_plantacion

ALTER TABLE "ForestPlanSpecies"
  ADD COLUMN IF NOT EXISTS "anioInstalacion" INTEGER,
  ADD COLUMN IF NOT EXISTS "superficieHa" DECIMAL(12,4);
