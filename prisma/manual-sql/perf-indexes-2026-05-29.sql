-- Índices compuestos de performance (multi-tenant) — 2026-05-29.
-- Nombres = los que Prisma generaría, para que un `migrate` futuro los reconozca.
-- CONCURRENTLY = NO bloquea escrituras (seguro en prod). NO correr dentro de una
-- transacción: `psql -f` los ejecuta en autocommit por defecto. Si una falla a
-- medias deja un índice INVALID → borralo (DROP INDEX) y reintentá.

-- PriceHistory: getByProduct/getByProducts filtran (tenantId, productId) y ordenan
-- changedAt desc. El [productId] suelto no scopa por tenant; este lo cubre + sort.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "PriceHistory_tenantId_productId_changedAt_idx"
  ON "PriceHistory" ("tenantId", "productId", "changedAt" DESC);

-- Batch: getExpiring filtra tenantId + rango expiryDate y ordena expiryDate asc.
-- El [expiryDate] suelto no scopa por tenant; este sirve filtro + orden de una.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Batch_tenantId_expiryDate_idx"
  ON "Batch" ("tenantId", "expiryDate");
