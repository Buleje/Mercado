-- GoodsReceipt: persistencia real de recepciones de mercadería (2026-07-08).
-- Idempotente. Aplicar vía scripts/apply-goods-receipt-migration.mjs (pg directo;
-- el pooler cuelga `prisma migrate`). Luego `prisma generate` + reiniciar dev.
CREATE TABLE IF NOT EXISTS "GoodsReceipt" (
  "id"              TEXT NOT NULL,
  "ref"             TEXT NOT NULL,
  "purchaseOrderId" TEXT,
  "supplierId"      TEXT,
  "supplierName"    TEXT NOT NULL,
  "status"          TEXT NOT NULL DEFAULT 'en-proceso',
  "inspector"       TEXT,
  "scheduledDate"   TIMESTAMP(3),
  "receivedDate"    TIMESTAMP(3),
  "itemsJson"       JSONB NOT NULL,
  "photos"          INTEGER NOT NULL DEFAULT 0,
  "nonConformities" INTEGER NOT NULL DEFAULT 0,
  "invoiceUrl"      TEXT,
  "notes"           TEXT,
  "tenantId"        TEXT NOT NULL,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GoodsReceipt_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "GoodsReceipt_tenantId_idx" ON "GoodsReceipt"("tenantId");
CREATE INDEX IF NOT EXISTS "GoodsReceipt_tenantId_purchaseOrderId_idx" ON "GoodsReceipt"("tenantId", "purchaseOrderId");
