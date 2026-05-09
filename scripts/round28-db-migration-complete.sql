-- ═══════════════════════════════════════════════════════════════════════════════
-- ROUND 28 — DB Migration Complete
-- Run in Supabase SQL Editor (NO DIRECT_URL needed, NO psql needed)
-- URL: https://supabase.com/dashboard/project/sofkgguriggocouiuamx/sql/new
--
-- Idempotent: safe to re-run. All DDL uses IF EXISTS / IF NOT EXISTS.
-- Generated: 2026-05-09
--
-- Cubre:
--   Sec 1  — Float → Decimal (5 campos financieros)
--   Sec 2  — Composite unique: NewsletterSubscriber + SavedCart
--   Sec 3  — WholesaleOrder.tenantId (expand pattern + backfill)
--   Sec 4  — Wave-1 indexes (12 CONCURRENTLY, roadmap #69)
--   Sec 5  — Wave-2 indexes (11 CONCURRENTLY, roadmap #70)
--   Sec 6  — ANALYZE tablas afectadas
--   Sec 7  — Validacion final (copiar y ejecutar por separado)
--
-- NOTA IMPORTANTE: CREATE INDEX CONCURRENTLY no puede correr dentro de una
-- transaccion explicita. El archivo esta estructurado en dos bloques:
--   BLOQUE A (BEGIN/COMMIT)  — Secs 1-3: DDL de columnas y constraints
--   BLOQUE B (sin transaccion) — Secs 4-6: CREATE INDEX CONCURRENTLY
-- Pegar y ejecutar cada bloque por separado en SQL Editor.
-- ═══════════════════════════════════════════════════════════════════════════════


-- ┌─────────────────────────────────────────────────────────────────────────────┐
-- │  BLOQUE A — Ejecutar primero (dentro de transaccion)                       │
-- └─────────────────────────────────────────────────────────────────────────────┘

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Float → Decimal (financieros)
--    Convierte sin pérdida de datos usando USING ::numeric cast.
--    No requiere backfill: PostgreSQL convierte float a decimal sin truncar
--    para las precisiones indicadas (Decimal(5,2), (10,3), (7,4), (12,2)).
-- ─────────────────────────────────────────────────────────────────────────────

-- 1a. Promotion.discountPercent  Float → Decimal(5,2)
--     Riesgo: redondeo en descuentos. Max valor esperado: 100.00
ALTER TABLE "Promotion"
  ALTER COLUMN "discountPercent" TYPE DECIMAL(5,2)
  USING "discountPercent"::DECIMAL(5,2);

-- 1b. Batch.quantity  Float → Decimal(10,3)
--     Riesgo: medición FEFO (unidades fraccionadas de kg/lt)
ALTER TABLE "Batch"
  ALTER COLUMN "quantity" TYPE DECIMAL(10,3)
  USING "quantity"::DECIMAL(10,3);

-- 1c. CommissionLedger.rate  Float → Decimal(7,4)
--     Riesgo: comisiones marketplace (ej: 0.1500 = 15%)
ALTER TABLE "CommissionLedger"
  ALTER COLUMN "rate" TYPE DECIMAL(7,4)
  USING "rate"::DECIMAL(7,4);

-- 1d. WholesaleOrderItem.appliedDiscount  Float → Decimal(5,2)
--     Riesgo: descuento por volumen (ej: 12.50 = 12.5%)
ALTER TABLE "WholesaleOrderItem"
  ALTER COLUMN "appliedDiscount" TYPE DECIMAL(5,2)
  USING "appliedDiscount"::DECIMAL(5,2);

-- 1e. MarketplaceAbandonedCart.total  Float → Decimal(12,2)
--     Riesgo: total carrito abandonado para remarketing
ALTER TABLE "MarketplaceAbandonedCart"
  ALTER COLUMN "total" TYPE DECIMAL(12,2)
  USING "total"::DECIMAL(12,2);


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Composite unique constraints
--    Patron expand: primero DROP el global, luego CREATE el composite.
--    Idempotente: IF EXISTS / IF NOT EXISTS.
-- ─────────────────────────────────────────────────────────────────────────────

-- 2a. NewsletterSubscriber: email @unique global → @@unique([tenantId, email])
--     Razon: un mismo email puede suscribirse en multiples tenants (correcto en multi-tenant).
--     La constraint global impide esto y causa errores cross-tenant.
ALTER TABLE "NewsletterSubscriber"
  DROP CONSTRAINT IF EXISTS "NewsletterSubscriber_email_key";

CREATE UNIQUE INDEX IF NOT EXISTS "NewsletterSubscriber_tenantId_email_key"
  ON "NewsletterSubscriber" ("tenantId", "email");

-- 2b. SavedCart: customerPhone @unique global → @@unique([customerPhone, tenantId])
--     Razon: un cliente puede tener un carrito en cada tenant donde este registrado.
ALTER TABLE "SavedCart"
  DROP CONSTRAINT IF EXISTS "SavedCart_customerPhone_key";

CREATE UNIQUE INDEX IF NOT EXISTS "SavedCart_customerPhone_tenantId_key"
  ON "SavedCart" ("customerPhone", "tenantId");


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. WholesaleOrder.tenantId — expand pattern (P0 multi-tenant leak)
--    WholesaleOrder tiene buyerTenantId + sellerTenantId pero NO tenantId canonico.
--    Las DB classes filtran por tenantId — sin este campo hay cross-tenant leak potencial.
--    Estrategia: agregar como nullable, backfill = buyerTenantId, dejar nullable por ahora.
--    TODO post-verificacion: SET NOT NULL cuando COUNT(*) WHERE tenantId IS NULL = 0.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "WholesaleOrder"
  ADD COLUMN IF NOT EXISTS "tenantId" TEXT;

-- Backfill: tenantId = buyerTenantId para todas las filas existentes
UPDATE "WholesaleOrder"
SET "tenantId" = "buyerTenantId"
WHERE "tenantId" IS NULL;

-- Indice para queries por tenantId canonico (no CONCURRENTLY dentro de transaccion)
CREATE INDEX IF NOT EXISTS "WholesaleOrder_tenantId_idx"
  ON "WholesaleOrder" ("tenantId");


COMMIT;

-- ┌─────────────────────────────────────────────────────────────────────────────┐
-- │  BLOQUE B — Ejecutar segundo (sin transaccion — CREATE INDEX CONCURRENTLY) │
-- │  Pegar este bloque en una nueva query en SQL Editor                        │
-- └─────────────────────────────────────────────────────────────────────────────┘


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Wave-1 indexes (12 indices — roadmap #69)
--    Todos CONCURRENTLY IF NOT EXISTS — zero downtime, safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

-- 4-1. Orders por tenant + fecha (dashboard aggregates + reports)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_tenant_created
  ON "Order" ("tenantId", "createdAt" DESC);

-- 4-2. Orders por tenant + estado (kanban de entregas)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_tenant_status
  ON "Order" ("tenantId", "status");

-- 4-3. OrderItem por productId (co-purchase + hybrid recommender)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orderitem_product
  ON "OrderItem" ("productId");

-- 4-4. Product por tenant + activo (listados publicos) — indice parcial
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_product_tenant_active
  ON "Product" ("tenantId", "active") WHERE "active" = true;

-- 4-5. Product por tenant + categoria (grids de categoria)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_product_tenant_category
  ON "Product" ("tenantId", "category");

-- 4-6. ActivityLog por tenant + entity + createdAt (audit + metering)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_activitylog_tenant_entity_created
  ON "ActivityLog" ("tenantId", "entity", "createdAt" DESC);

-- 4-7. Customer por tenant + phone (lookup en checkout + WhatsApp bot)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_customer_tenant_phone
  ON "Customer" ("tenantId", "phone");

-- 4-8. LoyaltyTransaction por tenant + customerId + createdAt (historial gamificado)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_loyaltytxn_tenant_customer_created
  ON "LoyaltyTransaction" ("tenantId", "customerId", "createdAt" DESC);

-- 4-9. Sale por tenant + createdAt (reportes POS)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sale_tenant_created
  ON "Sale" ("tenantId", "createdAt" DESC);

-- 4-10. Review por tenant + productId + date (PDP)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_review_tenant_product_date
  ON "Review" ("tenantId", "productId", "date" DESC);

-- 4-11. Settings lookup (usado en cada request de tenant)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_settings_tenant
  ON "Settings" ("tenantId");

-- 4-12. RoadmapItemStatus by itemId (superadmin roadmap)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_roadmapstatus_item
  ON "RoadmapItemStatus" ("itemId");


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Wave-2 indexes (11 indices — roadmap #70)
--    Tablas de alto crecimiento con queries frecuentes sin cobertura.
-- ─────────────────────────────────────────────────────────────────────────────

-- 5-1. WhatsAppConversation — limpieza de sesiones expiradas + lookup por phone
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_waconv_tenant_expires_phone
  ON "WhatsAppConversation" ("tenantId", "expiresAt", "phone");

-- 5-2. WhatsAppConversation — conversaciones activas recientes por tenant
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_waconv_tenant_state_lastmsg
  ON "WhatsAppConversation" ("tenantId", "state", "lastMessageAt" DESC);

-- 5-3. OrderItem — reportes de ventas por producto (joins product+order)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orderitem_product_order
  ON "OrderItem" ("productId", "orderId") WHERE "productId" IS NOT NULL;

-- 5-4. CustomerNotification — inbox no leidas por cliente
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_customernotif_phone_read_created
  ON "CustomerNotification" ("customerPhone", "read", "createdAt" DESC);

-- 5-5. CustomerNotification — bandeja admin: no leidas por tenant
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_customernotif_tenant_read_created
  ON "CustomerNotification" ("tenantId", "read", "createdAt" DESC);

-- 5-6. Notification (admin inbox) — alertas criticas sin leer por tenant
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notification_tenant_severity_read
  ON "Notification" ("tenantId", "severity", "readAt");

-- 5-7. StripeWebhookQueue — cron replay: eventos pendientes para reintentar
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_stripequeue_pending_retry
  ON "StripeWebhookQueue" ("nextRetryAt", "attempts") WHERE "processedAt" IS NULL;

-- 5-8. Promotion — promos activas vigentes por tenant (checkout + storefront)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_promotion_tenant_active_expires
  ON "Promotion" ("tenantId", "active", "expiresAt");

-- 5-9. Coupon — cupones activos no vencidos por tenant (validacion en checkout)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_coupon_tenant_active_expires
  ON "Coupon" ("tenantId", "active", "expiresAt");

-- 5-10. Review — reseñas aprobadas globales por tenant (pagina de tienda)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_review_tenant_status_date
  ON "Review" ("tenantId", "status", "date" DESC) WHERE "deletedAt" IS NULL;

-- 5-11. SaleItem — reportes POS por producto
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_saleitem_product
  ON "SaleItem" ("productId");


-- ─────────────────────────────────────────────────────────────────────────────
-- 6. ANALYZE — actualizar estadisticas del query planner
-- ─────────────────────────────────────────────────────────────────────────────

ANALYZE "Order";
ANALYZE "OrderItem";
ANALYZE "Product";
ANALYZE "ActivityLog";
ANALYZE "Customer";
ANALYZE "LoyaltyTransaction";
ANALYZE "Sale";
ANALYZE "Review";
ANALYZE "Settings";
ANALYZE "RoadmapItemStatus";
ANALYZE "WhatsAppConversation";
ANALYZE "CustomerNotification";
ANALYZE "Notification";
ANALYZE "StripeWebhookQueue";
ANALYZE "Promotion";
ANALYZE "Coupon";
ANALYZE "SaleItem";
ANALYZE "Batch";
ANALYZE "CommissionLedger";
ANALYZE "WholesaleOrderItem";
ANALYZE "MarketplaceAbandonedCart";
ANALYZE "NewsletterSubscriber";
ANALYZE "SavedCart";
ANALYZE "WholesaleOrder";


-- ┌─────────────────────────────────────────────────────────────────────────────┐
-- │  BLOQUE C — Validacion final (pegar en nueva query, ejecutar al final)     │
-- └─────────────────────────────────────────────────────────────────────────────┘

/*
-- Ejecutar cada SELECT por separado o como bloque de lectura:

-- V1. Contar indices wave creados (esperado: >= 23)
SELECT COUNT(*) AS wave_indexes_total
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname LIKE 'idx_%';

-- V2. Verificar ningun indice quedo en estado INVALID
SELECT c.relname AS indexname_invalido
FROM pg_index i
JOIN pg_class c ON c.oid = i.indexrelid
WHERE i.indisvalid = false
  AND c.relname LIKE 'idx_%';
-- Debe retornar 0 filas. Si hay filas: DROP el indice y re-crear.

-- V3. Confirmar columnas Float→Decimal (esperado: numeric para los 5 campos)
SELECT
  table_name,
  column_name,
  data_type,
  numeric_precision,
  numeric_scale
FROM information_schema.columns
WHERE (table_name = 'Promotion'                AND column_name = 'discountPercent')
   OR (table_name = 'Batch'                    AND column_name = 'quantity')
   OR (table_name = 'CommissionLedger'         AND column_name = 'rate')
   OR (table_name = 'WholesaleOrderItem'       AND column_name = 'appliedDiscount')
   OR (table_name = 'MarketplaceAbandonedCart' AND column_name = 'total')
ORDER BY table_name;
-- Todos deben mostrar data_type = 'numeric'.

-- V4. Confirmar unique constraints composite creados
SELECT indexname, tablename
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
    'NewsletterSubscriber_tenantId_email_key',
    'SavedCart_customerPhone_tenantId_key'
  );
-- Debe retornar 2 filas.

-- V5. Confirmar WholesaleOrder.tenantId existe y esta backfilled
SELECT
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_name = 'WholesaleOrder' AND column_name = 'tenantId') AS col_exists,
  (SELECT COUNT(*) FROM "WholesaleOrder" WHERE "tenantId" IS NULL)   AS nulls_pending;
-- col_exists=1, nulls_pending=0

-- V6. Resumen ejecutivo — todos los checks en un solo SELECT
SELECT
  (SELECT COUNT(*) FROM pg_indexes
   WHERE schemaname = 'public' AND indexname LIKE 'idx_%')                               AS wave_indexes,
  (SELECT COUNT(*) FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
   WHERE i.indisvalid = false AND c.relname LIKE 'idx_%')                                AS invalid_indexes,
  (SELECT COUNT(*) FROM pg_indexes WHERE indexname = 'NewsletterSubscriber_tenantId_email_key') AS newsletter_composite,
  (SELECT COUNT(*) FROM pg_indexes WHERE indexname = 'SavedCart_customerPhone_tenantId_key')    AS savedcart_composite,
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_name = 'WholesaleOrder' AND column_name = 'tenantId')                     AS wholesale_tenantid_col,
  (SELECT COUNT(*) FROM "WholesaleOrder" WHERE "tenantId" IS NULL)                       AS wholesale_nulls;
-- Esperado: wave_indexes>=23, invalid_indexes=0, newsletter_composite=1,
--           savedcart_composite=1, wholesale_tenantid_col=1, wholesale_nulls=0
*/


-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK PLAN (ejecutar solo si hay regresion — NO ejecutar en condiciones normales)
-- ─────────────────────────────────────────────────────────────────────────────

/*
-- R1. Revertir Float → Decimal (perdida de precision posible, revisar datos primero)
ALTER TABLE "Promotion"                ALTER COLUMN "discountPercent"  TYPE DOUBLE PRECISION;
ALTER TABLE "Batch"                    ALTER COLUMN "quantity"         TYPE DOUBLE PRECISION;
ALTER TABLE "CommissionLedger"         ALTER COLUMN "rate"             TYPE DOUBLE PRECISION;
ALTER TABLE "WholesaleOrderItem"       ALTER COLUMN "appliedDiscount"  TYPE DOUBLE PRECISION;
ALTER TABLE "MarketplaceAbandonedCart" ALTER COLUMN "total"            TYPE DOUBLE PRECISION;

-- R2. Revertir composite unique → global unique
DROP INDEX CONCURRENTLY IF EXISTS "NewsletterSubscriber_tenantId_email_key";
ALTER TABLE "NewsletterSubscriber"
  ADD CONSTRAINT "NewsletterSubscriber_email_key" UNIQUE ("email");

DROP INDEX CONCURRENTLY IF EXISTS "SavedCart_customerPhone_tenantId_key";
ALTER TABLE "SavedCart"
  ADD CONSTRAINT "SavedCart_customerPhone_key" UNIQUE ("customerPhone");

-- R3. Revertir WholesaleOrder.tenantId
DROP INDEX CONCURRENTLY IF EXISTS "WholesaleOrder_tenantId_idx";
ALTER TABLE "WholesaleOrder" DROP COLUMN IF EXISTS "tenantId";

-- R4. Rollback wave-1 (12 indices)
DROP INDEX CONCURRENTLY IF EXISTS idx_order_tenant_created;
DROP INDEX CONCURRENTLY IF EXISTS idx_order_tenant_status;
DROP INDEX CONCURRENTLY IF EXISTS idx_orderitem_product;
DROP INDEX CONCURRENTLY IF EXISTS idx_product_tenant_active;
DROP INDEX CONCURRENTLY IF EXISTS idx_product_tenant_category;
DROP INDEX CONCURRENTLY IF EXISTS idx_activitylog_tenant_entity_created;
DROP INDEX CONCURRENTLY IF EXISTS idx_customer_tenant_phone;
DROP INDEX CONCURRENTLY IF EXISTS idx_loyaltytxn_tenant_customer_created;
DROP INDEX CONCURRENTLY IF EXISTS idx_sale_tenant_created;
DROP INDEX CONCURRENTLY IF EXISTS idx_review_tenant_product_date;
DROP INDEX CONCURRENTLY IF EXISTS idx_settings_tenant;
DROP INDEX CONCURRENTLY IF EXISTS idx_roadmapstatus_item;

-- R5. Rollback wave-2 (11 indices)
DROP INDEX CONCURRENTLY IF EXISTS idx_waconv_tenant_expires_phone;
DROP INDEX CONCURRENTLY IF EXISTS idx_waconv_tenant_state_lastmsg;
DROP INDEX CONCURRENTLY IF EXISTS idx_orderitem_product_order;
DROP INDEX CONCURRENTLY IF EXISTS idx_customernotif_phone_read_created;
DROP INDEX CONCURRENTLY IF EXISTS idx_customernotif_tenant_read_created;
DROP INDEX CONCURRENTLY IF EXISTS idx_notification_tenant_severity_read;
DROP INDEX CONCURRENTLY IF EXISTS idx_stripequeue_pending_retry;
DROP INDEX CONCURRENTLY IF EXISTS idx_promotion_tenant_active_expires;
DROP INDEX CONCURRENTLY IF EXISTS idx_coupon_tenant_active_expires;
DROP INDEX CONCURRENTLY IF EXISTS idx_review_tenant_status_date;
DROP INDEX CONCURRENTLY IF EXISTS idx_saleitem_product;
*/
