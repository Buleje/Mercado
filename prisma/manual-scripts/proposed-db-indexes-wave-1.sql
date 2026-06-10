-- ─────────────────────────────────────────────────────────────────────────────
-- ROADMAP ITEM #69 — DB indexes wave 1
--
-- Indexes para queries recurrentes detectados en producción y en el código.
-- Todos son `CREATE INDEX CONCURRENTLY IF NOT EXISTS` — no bloquean tráfico.
--
-- Aplicar manualmente con DIRECT_URL:
--   psql "$DIRECT_URL" -f prisma/migrations/proposed-db-indexes-wave-1.sql
--
-- Rollback: DROP INDEX CONCURRENTLY IF EXISTS <index_name>;
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Orders por tenant + fecha (dashboard aggregates + reports)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_tenant_created
  ON "Order" ("tenantId", "createdAt" DESC);

-- 2. Orders por tenant + estado (kanban de entregas)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_tenant_status
  ON "Order" ("tenantId", "status");

-- 3. OrderItem por productId (co-purchase + hybrid recommender)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orderitem_product
  ON "OrderItem" ("productId");

-- 4. Product por tenant + activo (listados públicos)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_product_tenant_active
  ON "Product" ("tenantId", "active") WHERE "active" = true;

-- 5. Product por tenant + categoría (grids de categoría)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_product_tenant_category
  ON "Product" ("tenantId", "category");

-- 6. ActivityLog por tenant + entity + createdAt (audit + metering aggregation)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_activitylog_tenant_entity_created
  ON "ActivityLog" ("tenantId", "entity", "createdAt" DESC);

-- 7. Customer por tenant + phone (lookup rápido en checkout + WhatsApp bot)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_customer_tenant_phone
  ON "Customer" ("tenantId", "phone");

-- 8. LoyaltyTransaction por tenant + customerId + createdAt (historial gamificado)
-- FIX 2026-05-08: el modelo no tiene `phone`, usa `customerId` (FK a Customer.phone)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_loyaltytxn_tenant_customer_created
  ON "LoyaltyTransaction" ("tenantId", "customerId", "createdAt" DESC);

-- 9. Sale por tenant + createdAt (reportes POS)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sale_tenant_created
  ON "Sale" ("tenantId", "createdAt" DESC);

-- 10. Review por tenant + productId + date (PDP)
-- FIX 2026-05-08: Review usa columna `date`, no `createdAt`
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_review_tenant_product_date
  ON "Review" ("tenantId", "productId", "date" DESC);

-- 11. Settings lookup (usado en cada request)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_settings_tenant
  ON "Settings" ("tenantId");

-- 12. RoadmapItemStatus by itemId (superadmin roadmap)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_roadmapstatus_item
  ON "RoadmapItemStatus" ("itemId");

-- ANALYZE para actualizar estadísticas tras crear los índices
ANALYZE "Order", "OrderItem", "Product", "ActivityLog", "Customer",
        "LoyaltyTransaction", "Sale", "Review", "Settings", "RoadmapItemStatus";
