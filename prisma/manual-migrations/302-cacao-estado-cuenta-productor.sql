-- ADR-302 — Cacao: estado de cuenta al productor (deuda / anticipos / saldo).
-- Aditivo e idempotente. totalPagado ya existe = monto DEBIDO; acá se agrega el
-- seguimiento de lo efectivamente PAGADO al productor.
ALTER TABLE "CacaoLote" ADD COLUMN IF NOT EXISTS "montoPagado" DECIMAL(14, 2);
ALTER TABLE "CacaoLote" ADD COLUMN IF NOT EXISTS "estadoPago" TEXT NOT NULL DEFAULT 'pendiente';
