-- ADR-298 — Dropshipping fulfillment automático (expand-only, idempotente)
-- Aplicar con DIRECT_URL (pooler cuelga prisma migrate). Luego: prisma generate + reiniciar dev.

-- Product: campos dropship (aditivos, nullable/default → zero-downtime)
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "isDropship" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "dropshipSupplierId" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "supplierSku" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "supplierUrl" TEXT;
CREATE INDEX IF NOT EXISTS "Product_tenantId_isDropship_idx" ON "Product" ("tenantId", "isDropship");

-- Settings: flag per-tenant
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "dropshipEnabled" BOOLEAN NOT NULL DEFAULT false;

-- Fulfillment dropship: 1 por proveedor por orden
CREATE TABLE IF NOT EXISTS "DropshipFulfillment" (
  "id"               TEXT PRIMARY KEY,
  "tenantId"         TEXT NOT NULL,
  "orderId"          TEXT NOT NULL,
  "supplierId"       TEXT,
  "status"           TEXT NOT NULL DEFAULT 'pending',
  "itemsJson"        TEXT NOT NULL,
  "costTotal"        DECIMAL(12,2),
  "shipName"         TEXT,
  "shipPhone"        TEXT,
  "shipLocation"     TEXT,
  "shipReference"    TEXT,
  "supplierOrderRef" TEXT,
  "carrier"          TEXT,
  "trackingNumber"   TEXT,
  "trackingUrl"      TEXT,
  "notifiedAt"       TIMESTAMP(3),
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "DropshipFulfillment_tenantId_status_idx"     ON "DropshipFulfillment" ("tenantId", "status");
CREATE INDEX IF NOT EXISTS "DropshipFulfillment_orderId_idx"             ON "DropshipFulfillment" ("orderId");
CREATE INDEX IF NOT EXISTS "DropshipFulfillment_tenantId_supplierId_idx" ON "DropshipFulfillment" ("tenantId", "supplierId");
