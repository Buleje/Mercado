-- Activos lote 2 (Brandon 2026-06-06): depreciación, documentos+vencimientos,
-- operadores, fotos, tarifas por cliente, GPS. Aditiva e idempotente.

-- Depreciación + ubicación (GPS) en Asset
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "purchaseDate" TIMESTAMP(3);
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "usefulLifeYears" INTEGER;
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "salvageValue" DECIMAL(14,2);
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "locationLabel" TEXT;
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "lat" DECIMAL(10,7);
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "lng" DECIMAL(10,7);

-- Operador asignado al alquiler
ALTER TABLE "AssetIncome" ADD COLUMN IF NOT EXISTS "operatorId" TEXT;

CREATE TABLE IF NOT EXISTS "AssetOperator" (
  "id" TEXT PRIMARY KEY, "tenantId" TEXT NOT NULL, "name" TEXT NOT NULL,
  "phone" TEXT, "dailyRate" DECIMAL(12,2), "hourlyRate" DECIMAL(12,2),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "AssetOperator_tenantId_idx" ON "AssetOperator"("tenantId");

CREATE TABLE IF NOT EXISTS "AssetDocument" (
  "id" TEXT PRIMARY KEY, "tenantId" TEXT NOT NULL, "assetId" TEXT NOT NULL,
  "type" TEXT NOT NULL, "number" TEXT, "fileUrl" TEXT,
  "issueDate" TIMESTAMP(3), "expiryDate" TIMESTAMP(3), "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "AssetDocument_tenantId_assetId_idx" ON "AssetDocument"("tenantId","assetId");
CREATE INDEX IF NOT EXISTS "AssetDocument_tenantId_expiryDate_idx" ON "AssetDocument"("tenantId","expiryDate");

CREATE TABLE IF NOT EXISTS "AssetPhoto" (
  "id" TEXT PRIMARY KEY, "tenantId" TEXT NOT NULL, "assetId" TEXT NOT NULL,
  "url" TEXT NOT NULL, "caption" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "AssetPhoto_tenantId_assetId_idx" ON "AssetPhoto"("tenantId","assetId");

CREATE TABLE IF NOT EXISTS "AssetClientRate" (
  "id" TEXT PRIMARY KEY, "tenantId" TEXT NOT NULL, "client" TEXT NOT NULL,
  "assetId" TEXT, "rate" DECIMAL(12,2) NOT NULL, "unit" TEXT NOT NULL DEFAULT 'hora',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "AssetClientRate_tenantId_idx" ON "AssetClientRate"("tenantId");

DO $$ BEGIN ALTER TABLE "AssetDocument" ADD CONSTRAINT "AssetDocument_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "AssetPhoto" ADD CONSTRAINT "AssetPhoto_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "AssetClientRate" ADD CONSTRAINT "AssetClientRate_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "AssetIncome" ADD CONSTRAINT "AssetIncome_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "AssetOperator"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
