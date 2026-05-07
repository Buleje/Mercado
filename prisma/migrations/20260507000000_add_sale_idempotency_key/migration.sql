-- AddColumn: Sale.idempotencyKey — deduplication for POS offline retries
-- SECURITY 2026-05-07 (X2): POS offline puede reintentar el POST de venta
-- si el cajero abre 2 tabs o la red falla tras llegar el request. Sin esta
-- constraint, cada retry creaba una venta duplicada. @unique garantiza que
-- la DB rechace el segundo insert si el idempotencyKey ya existe.
ALTER TABLE "Sale" ADD COLUMN "idempotencyKey" TEXT;
CREATE UNIQUE INDEX "Sale_idempotencyKey_key" ON "Sale"("idempotencyKey");
