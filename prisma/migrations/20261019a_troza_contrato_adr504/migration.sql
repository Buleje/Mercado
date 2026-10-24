-- ADR-504 · paso 1 (EXPAND) — la troza conoce su permiso.
--
-- La troza = código de planta + permiso: «permiso 1 código 12» y «permiso 2
-- código 12» son dos piezas distintas (Brandon 19-10). Hasta hoy la troza sólo
-- sabía su ingreso; el permiso vivía en `WoodEntry.contratoId`. Se copia a la
-- troza para que el índice único lo pueda usar (un índice no ve otra tabla).
--
-- Mismo molde que las otras columnas `contratoId` (ADR-421): nullable, FK a
-- `ForestContrato` con ON DELETE SET NULL, índice (tenantId, contratoId).
-- NULL = «sin permiso»: el índice nuevo lo trata como '' y vuelve a la regla de
-- hoy (un código por centro) → falla segura, nunca mezcla.
--
-- Producción corre código viejo: la columna nueva no la lee ni la escribe, y
-- las trozas que ese código cree quedan en NULL hasta el próximo backfill
-- (`scripts/backfill-troza-contrato-adr504.mjs`, idempotente).
--
-- Aplicar (FK NOT VALID + VALIDATE y CONCURRENTLY: fuera de una sola tx):
--   node -r dotenv/config scripts/aplicar-migracion-sesion.mjs prisma/migrations/20261019a_troza_contrato_adr504/migration.sql --sin-tx --ensayo dotenv_config_path=.env.local
--   (sin --ensayo para aplicar; la 2.ª corrida da «0 nuevas»)
-- Revertir (contract, sólo si se abandona ADR-504): soltar el índice, la FK y la columna.

ALTER TABLE "WoodEntryTroza" ADD COLUMN IF NOT EXISTS "contratoId" TEXT;

ALTER TABLE "WoodEntryTroza" ADD CONSTRAINT "WoodEntryTroza_contratoId_fkey"
  FOREIGN KEY ("contratoId") REFERENCES "ForestContrato"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;

ALTER TABLE "WoodEntryTroza" VALIDATE CONSTRAINT "WoodEntryTroza_contratoId_fkey";

CREATE INDEX CONCURRENTLY IF NOT EXISTS "WoodEntryTroza_tenantId_contratoId_idx"
  ON "WoodEntryTroza" ("tenantId", "contratoId");
