-- Migración 308 — Cacao campo: link labor → gasto en Finanzas.
-- Aditiva e idempotente. Cuando una labor con costo se marca hecha, se postea
-- un Expense (category 'campo') y se guarda su id acá para mantener el sync
-- (reabrir/borrar la labor elimina el gasto).
ALTER TABLE "CacaoParcelaLabor" ADD COLUMN IF NOT EXISTS "gastoId" TEXT;
