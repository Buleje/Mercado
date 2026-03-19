-- Migration: add soft-delete columns + idempotency key for orders
-- Applied: 2026-03-16

-- ── Soft delete: Products ───────────────────────────────────────────────────
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

-- Partial index: only index non-deleted products (smaller, faster for active lookups)
CREATE INDEX IF NOT EXISTS "Product_active_idx" ON "Product"("id")
  WHERE "deletedAt" IS NULL;

-- ── Soft delete: Orders ─────────────────────────────────────────────────────
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

-- Partial index: active orders only
CREATE INDEX IF NOT EXISTS "Order_active_idx" ON "Order"("id")
  WHERE "deletedAt" IS NULL;

-- ── Soft delete: Reviews ────────────────────────────────────────────────────
ALTER TABLE "Review" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

-- ── Idempotency key: Orders ─────────────────────────────────────────────────
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Order_idempotencyKey_key"
  ON "Order"("idempotencyKey")
  WHERE "idempotencyKey" IS NOT NULL;
