-- ForestCtpEntry.usadoAt/usadoPor/usadoMotivo (Brandon, 2026-09-01).
--
-- Marca manual de "ya se usó" que saca una corrida de Productos disponibles
-- sin despacharla ni reprocesarla (mermas, ajustes, existencias ya
-- distribuidas por fuera del libro). El saldo real (saldosDeCorridas) no
-- cambia — sólo se deja de ofrecer. Reversible.
--
-- Idempotente.
-- Uso: USE_POOLER=1 node -r dotenv/config scripts/apply-fiados-gestion-migration.mjs dotenv_config_path=.env.local SQL_FILE=prisma/migrations/adr-ctp-entry-usado.sql

ALTER TABLE "ForestCtpEntry" ADD COLUMN IF NOT EXISTS "usadoAt" TIMESTAMP(3);
ALTER TABLE "ForestCtpEntry" ADD COLUMN IF NOT EXISTS "usadoPor" TEXT;
ALTER TABLE "ForestCtpEntry" ADD COLUMN IF NOT EXISTS "usadoMotivo" TEXT;
