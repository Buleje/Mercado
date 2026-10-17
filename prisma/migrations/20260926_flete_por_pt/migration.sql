-- Flete cobrado por pie tablar (ADR-440 §6, Brandon 2026-09-26: «la
-- oxapampina es con la que trabajo con dueños, compras, ventas, flete»).
--
-- Fase EXPAND pura, idempotente (`IF NOT EXISTS`): tres columnas NULL en
-- "ForestFlete". Ninguna reescribe la tabla y el código viejo no las nombra:
-- un INSERT que no las trae recibe NULL = «monto a mano», como hasta hoy.
--  · tarifaPorPt — S/ por pt; con ella el servidor pone monto = tarifa × PT.
--  · ptCobrado   — el PT de la guía con que se cobró, CONGELADO al guardar.
--  · ptFuente    — 'oxapampa' | 'estimado'.
--
-- Aplicar por el pooler :5432 (session), NUNCA por 6543 ni con SET SESSION:
--   node scripts/prisma-session.mjs db execute --file prisma/migrations/20260926_flete_por_pt/migration.sql
--   node scripts/prisma-session.mjs migrate resolve --applied 20260926_flete_por_pt
--
-- Para revertir: contar primero qué se perdería
--   SELECT count(*) FROM "ForestFlete" WHERE "tarifaPorPt" IS NOT NULL;
-- y quitar las 3 columnas (ALTER TABLE … DROP COLUMN IF EXISTS), a mano y con
-- autorización: el monto de esos viajes ya quedó escrito en "monto".

ALTER TABLE "ForestFlete" ADD COLUMN IF NOT EXISTS "tarifaPorPt" DECIMAL(12,4);
ALTER TABLE "ForestFlete" ADD COLUMN IF NOT EXISTS "ptCobrado" DECIMAL(12,2);
ALTER TABLE "ForestFlete" ADD COLUMN IF NOT EXISTS "ptFuente" TEXT;
