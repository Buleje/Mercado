-- ADR-141 — P&L del CTP: valor de venta del despacho (para margen = venta − COGS).
-- Idempotente. Aplicar vía scripts/apply-sql.mjs (pooler); luego `prisma generate`
-- + reiniciar el dev server (el cliente Prisma viejo no conoce la columna).
ALTER TABLE "ForestCtpEntry" ADD COLUMN IF NOT EXISTS "valorVenta" DECIMAL(14,2);
