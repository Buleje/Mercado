-- ─────────────────────────────────────────────────────────────────────────────
-- ROADMAP ITEM #70 — DB indexes wave 2
--
-- Indices para tablas de alto crecimiento con queries frecuentes sin cobertura.
-- Columnas verificadas contra prisma/schema.prisma antes de proponer.
-- Todos son CONCURRENTLY IF NOT EXISTS — no bloquean tráfico en producción.
--
-- Aplicar manualmente con DIRECT_URL:
--   psql "$DIRECT_URL" -f prisma/migrations/proposed-db-indexes-wave-2.sql
--
-- Rollback: DROP INDEX CONCURRENTLY IF EXISTS <index_name>;
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. WhatsAppConversation — limpieza de sesiones expiradas + lookup por phone
-- Query: WHERE tenantId = ? AND expiresAt < NOW()  (cron de limpieza, 24/7 bot)
-- Schema confirmado: tenantId String, phone String, expiresAt DateTime, lastMessageAt DateTime
-- Nota: @@unique([tenantId, phone]) ya cubre lookups exactos; este cubre rangos de expiresAt
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_waconv_tenant_expires_phone
  ON "WhatsAppConversation" ("tenantId", "expiresAt", "phone");

-- 2. WhatsAppConversation — conversaciones activas recientes por tenant
-- Query: WHERE tenantId = ? AND state != 'idle' ORDER BY lastMessageAt DESC
-- Schema confirmado: tenantId String, state String, lastMessageAt DateTime
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_waconv_tenant_state_lastmsg
  ON "WhatsAppConversation" ("tenantId", "state", "lastMessageAt" DESC);

-- 3. OrderItem — reportes de ventas por producto (top productos, co-purchase)
-- Query: SELECT productId, SUM(quantity) FROM OrderItem WHERE productId = ? (joins con orders)
-- Schema confirmado: productId Int (nullable), orderId String
-- Wave-1 creó idx_orderitem_product sobre productId solo; este cubre joins product+order
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orderitem_product_order
  ON "OrderItem" ("productId", "orderId") WHERE "productId" IS NOT NULL;

-- 4. CustomerNotification — inbox de notificaciones no leídas por cliente
-- Query: WHERE customerPhone = ? AND read = false ORDER BY createdAt DESC
-- Schema confirmado: customerPhone String, read Boolean, createdAt DateTime, tenantId String
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_customernotif_phone_read_created
  ON "CustomerNotification" ("customerPhone", "read", "createdAt" DESC);

-- 5. CustomerNotification — bandeja del admin: no leídas por tenant
-- Query: WHERE tenantId = ? AND read = false ORDER BY createdAt DESC (SSE notifications)
-- Schema confirmado: tenantId String, read Boolean, createdAt DateTime
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_customernotif_tenant_read_created
  ON "CustomerNotification" ("tenantId", "read", "createdAt" DESC);

-- 6. Notification (admin inbox) — alertas críticas sin leer por tenant
-- Query: WHERE tenantId = ? AND severity = 'HIGH' AND readAt IS NULL ORDER BY createdAt DESC
-- Schema confirmado: tenantId String, severity String, readAt DateTime?, createdAt DateTime
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notification_tenant_severity_read
  ON "Notification" ("tenantId", "severity", "readAt");

-- 7. StripeWebhookQueue — cron replay: eventos pendientes listos para reintentar
-- Query: WHERE processedAt IS NULL AND nextRetryAt <= NOW() ORDER BY nextRetryAt ASC
-- Schema confirmado: processedAt DateTime?, nextRetryAt DateTime, attempts Int
-- Wave-1 no tocó esta tabla; índices simples existentes no cubren el compound del cron
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_stripequeue_pending_retry
  ON "StripeWebhookQueue" ("nextRetryAt", "attempts") WHERE "processedAt" IS NULL;

-- 8. Promotion — promos activas vigentes por tenant (checkout + storefront)
-- Query: WHERE tenantId = ? AND active = true AND (expiresAt IS NULL OR expiresAt > NOW())
-- Schema confirmado: tenantId String, active Boolean, expiresAt DateTime?
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_promotion_tenant_active_expires
  ON "Promotion" ("tenantId", "active", "expiresAt");

-- 9. Coupon — cupones activos no vencidos por tenant (validación en checkout)
-- Query: WHERE tenantId = ? AND active = true AND (expiresAt IS NULL OR expiresAt > NOW())
-- Schema confirmado: tenantId String, active Boolean, expiresAt DateTime?
-- Nota: @@unique([tenantId, code]) cubre el lookup por código exacto; este cubre filtros de vigencia
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_coupon_tenant_active_expires
  ON "Coupon" ("tenantId", "active", "expiresAt");

-- 10. Review — storefront: reseñas aprobadas globales por tenant (página de tienda)
-- Query: WHERE tenantId = ? AND status = 'approved' AND deletedAt IS NULL ORDER BY date DESC
-- Schema confirmado: tenantId String, status String, deletedAt DateTime?, date DateTime
-- Existente Review_productId_status_date cubre product-level; este cubre tenant-level (sin productId)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_review_tenant_status_date
  ON "Review" ("tenantId", "status", "date" DESC) WHERE "deletedAt" IS NULL;

-- 11. SaleItem — reportes POS por producto (ventas por ítem en panel admin)
-- Query: SELECT productId, SUM(quantity) ... JOIN Sale ON tenantId = ? GROUP BY productId
-- Schema confirmado: productId Int, saleId String
-- Nótese: SaleItem.productId es NOT NULL (a diferencia de OrderItem.productId que es nullable)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_saleitem_product
  ON "SaleItem" ("productId");

-- ANALYZE para actualizar estadísticas del planner tras crear los índices
ANALYZE "WhatsAppConversation", "OrderItem", "CustomerNotification",
        "Notification", "StripeWebhookQueue", "Promotion",
        "Coupon", "Review", "SaleItem";
