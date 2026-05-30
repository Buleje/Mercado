-- Audit #3 (Brandon 2026-05-30): índices de hot-paths del marketplace.
-- Ya aplicados en Supabase (sofkgguriggocouiuamx) vía MCP — IF NOT EXISTS hace
-- el migrate deploy idempotente. Nombres = Prisma auto-naming (sin drift).
CREATE INDEX IF NOT EXISTS "Order_source_deletedAt_createdAt_idx"
  ON "Order"("source", "deletedAt", "createdAt");
CREATE INDEX IF NOT EXISTS "Store_isPublished_rating_reviewCount_idx"
  ON "Store"("isPublished", "rating" DESC, "reviewCount" DESC);
CREATE INDEX IF NOT EXISTS "Store_isPublished_zone_idx"
  ON "Store"("isPublished", "zone");
CREATE INDEX IF NOT EXISTS "StoreProduct_storeId_isActive_idx"
  ON "StoreProduct"("storeId", "isActive");
