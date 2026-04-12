-- Migration: add_loyalty_transaction
-- ADR-024 / TD-030. Append-only ledger for Customer.loyaltyPoints.
--
-- Zero-downtime: brand-new table with zero rows, additive only.
-- Customer.loyaltyPoints column is untouched.
-- Backfill is a separate Node script (scripts/backfill-loyalty-transactions.ts).
--
-- Rollback: DROP TABLE "LoyaltyTransaction";

-- CreateTable
CREATE TABLE "LoyaltyTransaction" (
    "id"         TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "tenantId"   TEXT NOT NULL,
    "amount"     INTEGER NOT NULL,
    "reason"     TEXT NOT NULL,
    "metadata"   JSONB,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoyaltyTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: primary read path "newest history for a customer"
CREATE INDEX "idx_loyalty_tx_customer_created_desc"
    ON "LoyaltyTransaction" ("customerId", "createdAt" DESC);

-- CreateIndex: tenant-wide reporting "points issued this week"
CREATE INDEX "idx_loyalty_tx_tenant_created_desc"
    ON "LoyaltyTransaction" ("tenantId", "createdAt" DESC);

-- CreateIndex: per-reason aggregations "how many points came from referrals"
CREATE INDEX "LoyaltyTransaction_tenantId_reason_idx"
    ON "LoyaltyTransaction" ("tenantId", "reason");

-- AddForeignKey: cascade so GDPR / Ley 29733 right-to-erasure works in one DELETE
ALTER TABLE "LoyaltyTransaction"
    ADD CONSTRAINT "LoyaltyTransaction_customerId_fkey"
    FOREIGN KEY ("customerId")
    REFERENCES "Customer"("phone")
    ON DELETE CASCADE
    ON UPDATE CASCADE;
