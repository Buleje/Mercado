-- Migration: add FK indexes flagged by supabase-postgres-best-practices skill audit
-- TD-019: missing single-column indexes on foreign-key columns
-- TD-020: composite (tenantId, status) for CommissionLedger common query pattern
--
-- Risk: ZERO — all affected tables have ≤52 rows in current dev DB.
-- Lock impact: instant on small tables, no need for CREATE INDEX CONCURRENTLY.
-- Rollback: DROP INDEX <name>; (each index is independent and idempotent).

-- AddIndex: StoreProduct.productId (FK without index)
CREATE INDEX "StoreProduct_productId_idx" ON "StoreProduct"("productId");

-- AddIndex: WholesaleOrderItem.wholesaleOrderId (FK without index, blocks fast CASCADE)
CREATE INDEX "WholesaleOrderItem_wholesaleOrderId_idx" ON "WholesaleOrderItem"("wholesaleOrderId");

-- AddIndex: WholesaleOrderItem.productId (orphan FK column, useful for product-level reports)
CREATE INDEX "WholesaleOrderItem_productId_idx" ON "WholesaleOrderItem"("productId");

-- AddIndex: StorePermission.userId (single-column index missing despite composite unique)
CREATE INDEX "StorePermission_userId_idx" ON "StorePermission"("userId");

-- AddIndex: CommissionLedger.orderId (FK without index)
CREATE INDEX "CommissionLedger_orderId_idx" ON "CommissionLedger"("orderId");

-- AddIndex: CommissionLedger composite (tenantId, status) — most common WHERE pattern in SaaS multi-tenant
CREATE INDEX "CommissionLedger_tenantId_status_idx" ON "CommissionLedger"("tenantId", "status");
