-- Migration: add partial and composite indexes for high-traffic query patterns

-- ── Active product listing (storefront) ────────────────────────────────────
-- Covers: WHERE active = true AND "deletedAt" IS NULL ORDER BY name
CREATE INDEX IF NOT EXISTS "Product_active_visible_idx"
  ON "Product"("tenantId", "name")
  WHERE active = true AND "deletedAt" IS NULL;

-- ── Active orders per tenant (admin dashboard) ──────────────────────────────
-- Covers: WHERE tenantId = ? AND status != 'cancelado' AND "deletedAt" IS NULL
CREATE INDEX IF NOT EXISTS "Order_active_by_tenant_idx"
  ON "Order"("tenantId", "createdAt" DESC)
  WHERE status != 'cancelado' AND "deletedAt" IS NULL;

-- ── Recent orders per customer (customer portal) ────────────────────────────
-- Covers: WHERE "customerPhone" = ? ORDER BY "createdAt" DESC (joint reads)
CREATE INDEX IF NOT EXISTS "Order_customer_recent_idx"
  ON "Order"("customerPhone", "createdAt" DESC)
  WHERE "deletedAt" IS NULL;

-- ── Pending + confirmed orders (kitchen/dispatch queue) ─────────────────────
CREATE INDEX IF NOT EXISTS "Order_dispatch_queue_idx"
  ON "Order"("tenantId", "createdAt" DESC)
  WHERE status IN ('pendiente', 'confirmado', 'en_camino');

-- ── Customer lookup by tenant (admin customer list) ─────────────────────────
-- Covers: WHERE tenantId = ? ORDER BY "totalSpent" DESC
CREATE INDEX IF NOT EXISTS "Customer_tenant_spend_idx"
  ON "Customer"("tenantId", "totalSpent" DESC);

-- ── Low-stock products (reorder alerts) ─────────────────────────────────────
-- Covers: WHERE stock IS NOT NULL AND stock <= "stockMin" AND active = true
CREATE INDEX IF NOT EXISTS "Product_low_stock_idx"
  ON "Product"("tenantId", stock)
  WHERE active = true AND "deletedAt" IS NULL AND stock IS NOT NULL;
