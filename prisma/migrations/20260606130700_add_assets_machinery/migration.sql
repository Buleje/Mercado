-- Activos & Maquinaria (MVP) — Brandon 2026-06-06
-- 3 tablas nuevas. NO toca tablas existentes (aditivo, seguro para prod).

CREATE TABLE IF NOT EXISTS "Asset" (
  "id"            TEXT NOT NULL,
  "tenantId"      TEXT NOT NULL,
  "name"          TEXT NOT NULL,
  "type"          TEXT NOT NULL,
  "plate"         TEXT,
  "imageUrl"      TEXT,
  "purchaseValue" DECIMAL(14,2),
  "status"        TEXT NOT NULL DEFAULT 'operativo',
  "hourlyRate"    DECIMAL(12,2),
  "rateUnit"      TEXT NOT NULL DEFAULT 'hora',
  "notes"         TEXT,
  "active"        BOOLEAN NOT NULL DEFAULT true,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Asset_tenantId_active_idx" ON "Asset"("tenantId", "active");
CREATE INDEX IF NOT EXISTS "Asset_tenantId_status_idx" ON "Asset"("tenantId", "status");

CREATE TABLE IF NOT EXISTS "AssetIncome" (
  "id"        TEXT NOT NULL,
  "tenantId"  TEXT NOT NULL,
  "assetId"   TEXT NOT NULL,
  "date"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "client"    TEXT,
  "quantity"  DECIMAL(10,2),
  "unit"      TEXT NOT NULL DEFAULT 'hora',
  "rate"      DECIMAL(12,2) NOT NULL,
  "amount"    DECIMAL(14,2) NOT NULL,
  "hourStart" DECIMAL(12,1),
  "hourEnd"   DECIMAL(12,1),
  "notes"     TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssetIncome_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AssetIncome_tenantId_date_idx" ON "AssetIncome"("tenantId", "date");
CREATE INDEX IF NOT EXISTS "AssetIncome_assetId_idx" ON "AssetIncome"("assetId");

CREATE TABLE IF NOT EXISTS "AssetExpense" (
  "id"        TEXT NOT NULL,
  "tenantId"  TEXT NOT NULL,
  "assetId"   TEXT NOT NULL,
  "date"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "category"  TEXT NOT NULL DEFAULT 'combustible',
  "gallons"   DECIMAL(10,2),
  "unitPrice" DECIMAL(10,2),
  "amount"    DECIMAL(14,2) NOT NULL,
  "notes"     TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssetExpense_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AssetExpense_tenantId_date_idx" ON "AssetExpense"("tenantId", "date");
CREATE INDEX IF NOT EXISTS "AssetExpense_assetId_category_idx" ON "AssetExpense"("assetId", "category");

-- FKs (con IF NOT EXISTS vía DO block para idempotencia)
DO $$ BEGIN
  ALTER TABLE "AssetIncome" ADD CONSTRAINT "AssetIncome_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "AssetExpense" ADD CONSTRAINT "AssetExpense_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
