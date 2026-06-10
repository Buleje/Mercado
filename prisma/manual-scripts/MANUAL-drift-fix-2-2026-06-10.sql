-- ─────────────────────────────────────────────────────────────────────────────
-- DRIFT-FIX parte 2 (audit 2026-06-10) · resto de objetos schema↔DB
-- PageHero · CreditScoreHistory · CreditReminder (tablas nuevas) +
-- realineación de StockoutPrediction y SalesAnomaly (ambas con 0 filas
-- verificadas — remover columnas legacy no pierde data).
-- APLICAR: psql "$DIRECT_URL" -f prisma/manual-scripts/MANUAL-drift-fix-2-2026-06-10.sql
-- ─────────────────────────────────────────────────────────────────────────────
BEGIN;

-- DropForeignKey
ALTER TABLE "StockoutPrediction" DROP CONSTRAINT IF EXISTS "StockoutPrediction_productId_fkey";

-- DropIndex
DROP INDEX IF EXISTS "StockoutPrediction_productId_idx";

-- AlterTable
ALTER TABLE "SalesAnomaly" DROP COLUMN IF EXISTS "detectedAt",
DROP COLUMN IF EXISTS "message",
DROP COLUMN IF EXISTS "metadata",
DROP COLUMN IF EXISTS "productId",
DROP COLUMN IF EXISTS "resolvedAt",
DROP COLUMN IF EXISTS "type",
ADD COLUMN     IF NOT EXISTS "acknowledgedAt" TIMESTAMP(3),
ADD COLUMN     IF NOT EXISTS "actual" DOUBLE PRECISION NOT NULL,
ADD COLUMN     IF NOT EXISTS "comparisonDate" TIMESTAMP(3) NOT NULL,
ADD COLUMN     IF NOT EXISTS "date" TIMESTAMP(3) NOT NULL,
ADD COLUMN     IF NOT EXISTS "deltaPct" DOUBLE PRECISION NOT NULL,
ADD COLUMN     IF NOT EXISTS "direction" TEXT NOT NULL,
ADD COLUMN     IF NOT EXISTS "expected" DOUBLE PRECISION NOT NULL,
ADD COLUMN     IF NOT EXISTS "metric" TEXT NOT NULL,
ADD COLUMN     IF NOT EXISTS "notifiedAt" TIMESTAMP(3),
ADD COLUMN     IF NOT EXISTS "storeId" TEXT NOT NULL,
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "severity" DROP DEFAULT;

-- AlterTable
ALTER TABLE "StockoutPrediction" DROP COLUMN IF EXISTS "avgDailySales",
DROP COLUMN IF EXISTS "createdAt",
DROP COLUMN IF EXISTS "predictedStockoutDate",
DROP COLUMN IF EXISTS "recommendedOrderQty",
ADD COLUMN     IF NOT EXISTS "avgDailyUnits" DOUBLE PRECISION NOT NULL,
ADD COLUMN     IF NOT EXISTS "computedAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     IF NOT EXISTS "expiresAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     IF NOT EXISTS "predictedDaysToStockout" DOUBLE PRECISION NOT NULL,
ADD COLUMN     IF NOT EXISTS "severity" TEXT NOT NULL,
ADD COLUMN     IF NOT EXISTS "storeId" TEXT NOT NULL,
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "storeProductId" SET NOT NULL,
ALTER COLUMN "confidence" DROP DEFAULT,
ALTER COLUMN "currentStock" DROP DEFAULT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "PageHero" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "pageSlug" TEXT NOT NULL,
    "title" TEXT,
    "subtitle" TEXT,
    "imageUrl" TEXT,
    "ctaText" TEXT,
    "ctaLink" TEXT,
    "gradientFrom" TEXT,
    "gradientTo" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PageHero_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CreditScoreHistory" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "creditProfileId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "creditLimit" DECIMAL(12,2) NOT NULL,
    "riskLevel" TEXT NOT NULL,
    "breakdownPurchaseHistory" INTEGER NOT NULL DEFAULT 0,
    "breakdownPaymentPunctuality" INTEGER NOT NULL DEFAULT 0,
    "breakdownAvgTicket" INTEGER NOT NULL DEFAULT 0,
    "breakdownSeniority" INTEGER NOT NULL DEFAULT 0,
    "breakdownLoyaltyPoints" INTEGER NOT NULL DEFAULT 0,
    "trigger" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditScoreHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CreditReminder" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fiadoId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'whatsapp',
    "message" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idempotencyKey" TEXT NOT NULL,

    CONSTRAINT "CreditReminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PageHero_tenantId_pageSlug_idx" ON "PageHero"("tenantId", "pageSlug");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PageHero_tenantId_pageSlug_sortOrder_key" ON "PageHero"("tenantId", "pageSlug", "sortOrder");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CreditScoreHistory_tenantId_customerId_idx" ON "CreditScoreHistory"("tenantId", "customerId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CreditScoreHistory_creditProfileId_createdAt_idx" ON "CreditScoreHistory"("creditProfileId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CreditScoreHistory_createdAt_idx" ON "CreditScoreHistory"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CreditReminder_idempotencyKey_key" ON "CreditReminder"("idempotencyKey");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CreditReminder_tenantId_idx" ON "CreditReminder"("tenantId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CreditReminder_fiadoId_idx" ON "CreditReminder"("fiadoId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CreditReminder_customerId_idx" ON "CreditReminder"("customerId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CreditReminder_sentAt_idx" ON "CreditReminder"("sentAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SalesAnomaly_storeId_idx" ON "SalesAnomaly"("storeId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SalesAnomaly_storeId_date_idx" ON "SalesAnomaly"("storeId", "date");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SalesAnomaly_severity_idx" ON "SalesAnomaly"("severity");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StockoutPrediction_storeId_idx" ON "StockoutPrediction"("storeId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StockoutPrediction_storeId_severity_idx" ON "StockoutPrediction"("storeId", "severity");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StockoutPrediction_expiresAt_idx" ON "StockoutPrediction"("expiresAt");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PageHero_tenantId_fkey') THEN
    ALTER TABLE "PageHero" ADD CONSTRAINT "PageHero_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CreditScoreHistory_creditProfileId_fkey') THEN
    ALTER TABLE "CreditScoreHistory" ADD CONSTRAINT "CreditScoreHistory_creditProfileId_fkey" FOREIGN KEY ("creditProfileId") REFERENCES "CreditProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StockoutPrediction_storeId_fkey') THEN
    ALTER TABLE "StockoutPrediction" ADD CONSTRAINT "StockoutPrediction_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StockoutPrediction_productId_fkey') THEN
    ALTER TABLE "StockoutPrediction" ADD CONSTRAINT "StockoutPrediction_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StockoutPrediction_storeProductId_fkey') THEN
    ALTER TABLE "StockoutPrediction" ADD CONSTRAINT "StockoutPrediction_storeProductId_fkey" FOREIGN KEY ("storeProductId") REFERENCES "StoreProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SalesAnomaly_storeId_fkey') THEN
    ALTER TABLE "SalesAnomaly" ADD CONSTRAINT "SalesAnomaly_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

COMMIT;
