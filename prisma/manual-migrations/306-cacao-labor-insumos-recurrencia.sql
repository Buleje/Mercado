-- Migración 306 — Cacao campo: insumos/costos por labor + recurrencia.
-- Aditiva e idempotente. Conecta el campo con Finanzas (costo por labor) y
-- habilita labores recurrentes (recurrenteDias) que alimentan pendiente/vencido.
ALTER TABLE "CacaoParcelaLabor" ADD COLUMN IF NOT EXISTS "insumo" TEXT;
ALTER TABLE "CacaoParcelaLabor" ADD COLUMN IF NOT EXISTS "dosis" TEXT;
ALTER TABLE "CacaoParcelaLabor" ADD COLUMN IF NOT EXISTS "costo" DECIMAL(12, 2);
ALTER TABLE "CacaoParcelaLabor" ADD COLUMN IF NOT EXISTS "recurrenteDias" INTEGER;
