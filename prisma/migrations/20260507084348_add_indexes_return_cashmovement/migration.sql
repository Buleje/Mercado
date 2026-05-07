-- SECURITY 2026-05-07 (audit DB P0-2 + P0-3): agregar @@index faltantes a Return + CashMovement.
-- Sin estos indexes las queries de devoluciones por venta/pedido y reconciliación de caja
-- por venta hacían seq scan completo de la tabla.
--
-- Aplicación a producción: usar CONCURRENTLY para evitar lock en tablas grandes.
-- Si la migration falla por concurrent index ya existente, ignorar y continuar.

-- CashMovement: lookup por venta + historial cierre de caja por periodo
CREATE INDEX CONCURRENTLY IF NOT EXISTS "CashMovement_saleId_idx" ON "CashMovement"("saleId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "CashMovement_cashRegisterId_createdAt_idx" ON "CashMovement"("cashRegisterId", "createdAt");

-- Return: lookup por venta POS, pedido online, y reportes por periodo
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Return_saleId_idx" ON "Return"("saleId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Return_orderId_idx" ON "Return"("orderId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Return_tenantId_createdAt_idx" ON "Return"("tenantId", "createdAt");
