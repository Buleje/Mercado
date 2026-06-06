-- Activos reforzados (Brandon 2026-06-06): horómetro, combustible meta,
-- cobranza, rango de fechas, mantenimiento e inspección. Aditiva e idempotente.

ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "currentHours" DECIMAL(12,1);
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "fuelTargetPerUnit" DECIMAL(12,3);

ALTER TABLE "AssetIncome" ADD COLUMN IF NOT EXISTS "paid" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "AssetIncome" ADD COLUMN IF NOT EXISTS "paidAt" TIMESTAMP(3);
ALTER TABLE "AssetIncome" ADD COLUMN IF NOT EXISTS "dueDate" TIMESTAMP(3);
ALTER TABLE "AssetIncome" ADD COLUMN IF NOT EXISTS "startDate" TIMESTAMP(3);
ALTER TABLE "AssetIncome" ADD COLUMN IF NOT EXISTS "endDate" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "AssetIncome_tenantId_paid_idx" ON "AssetIncome"("tenantId","paid");

CREATE TABLE IF NOT EXISTS "AssetMaintenance" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "intervalHours" INTEGER,
  "intervalDays" INTEGER,
  "lastDoneHours" DECIMAL(12,1),
  "lastDoneAt" TIMESTAMP(3),
  "notes" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssetMaintenance_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AssetMaintenance_tenantId_assetId_idx" ON "AssetMaintenance"("tenantId","assetId");

CREATE TABLE IF NOT EXISTS "AssetInspection" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'salida',
  "client" TEXT,
  "hours" DECIMAL(12,1),
  "itemsJson" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssetInspection_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AssetInspection_tenantId_assetId_idx" ON "AssetInspection"("tenantId","assetId");

-- FKs (idempotente vía bloque): si la tabla padre existe, agrega cascade
DO $$ BEGIN
  ALTER TABLE "AssetMaintenance" ADD CONSTRAINT "AssetMaintenance_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "AssetInspection" ADD CONSTRAINT "AssetInspection_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
