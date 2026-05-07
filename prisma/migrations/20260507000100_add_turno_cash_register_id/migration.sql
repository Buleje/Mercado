-- Migration: add_turno_cash_register_id
--
-- Asocia Turno a un CashRegister especifico para multi-caja real.
-- Nullable hasta migrar turnos legados; sin foreign key (CashRegister
-- vive en JSONDB, no en una tabla Prisma actualmente).
--
-- T5 audit ventas-caja 2026-05-07. Expand-only, sin DROP/NOT NULL.
-- Idempotente con IF NOT EXISTS guards.

ALTER TABLE "Turno"
  ADD COLUMN IF NOT EXISTS "cashRegisterId" TEXT;

CREATE INDEX IF NOT EXISTS "Turno_cashRegisterId_idx"
  ON "Turno"("cashRegisterId");
