-- CreateTable: MarketplaceAbandonedCart
-- Generated for: prisma/schema.prisma model MarketplaceAbandonedCart
-- Safe to run multiple times (IF NOT EXISTS)

CREATE TABLE IF NOT EXISTS "MarketplaceAbandonedCart" (
    "id" TEXT NOT NULL,
    "storeSlug" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "itemsJson" TEXT NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,
    "recovered" BOOLEAN NOT NULL DEFAULT false,
    "convertedAt" TIMESTAMP(3),
    "reminderSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceAbandonedCart_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX IF NOT EXISTS "MarketplaceAbandonedCart_storeSlug_idx" ON "MarketplaceAbandonedCart"("storeSlug");
CREATE INDEX IF NOT EXISTS "MarketplaceAbandonedCart_customerPhone_idx" ON "MarketplaceAbandonedCart"("customerPhone");
CREATE INDEX IF NOT EXISTS "MarketplaceAbandonedCart_recovered_reminderSentAt_createdAt_idx" ON "MarketplaceAbandonedCart"("recovered", "reminderSentAt", "createdAt");
