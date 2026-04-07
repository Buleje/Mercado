-- MANUAL-marketplace-bloque-c.sql
-- Idempotente: usar IF NOT EXISTS / ADD COLUMN IF NOT EXISTS
-- Ejecutar con DIRECT_URL (no pooler) contra Supabase
--
-- Bloque C — Stock Intelligence, Sales Anomalies, Sponsored Boosts, Search Suggestions
-- Incluye:
--   C1: StockoutPrediction — predicción de quiebre de stock por tienda/producto
--   C2: SalesAnomaly      — detección de anomalías de ventas (drops o spikes)
--   C3: SponsoredBoost    — ads internos: vendedor paga para aparecer primero
--   C4: SearchSuggestion  — log + caché de búsquedas para autocompletado
--   GIN trigram sobre Product.name y Product.description para búsqueda fuzzy

-- ─── Extensión pg_trgm (fuzzy search) ────────────────────
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ─── Índices GIN trigram sobre Product ───────────────────
CREATE INDEX IF NOT EXISTS "Product_name_trgm_idx"
  ON "Product" USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "Product_description_trgm_idx"
  ON "Product" USING gin (description gin_trgm_ops);

-- ─── C1: StockoutPrediction ───────────────────────────────
CREATE TABLE IF NOT EXISTS "StockoutPrediction" (
  "id"                      TEXT          NOT NULL,
  "tenantId"                TEXT          NOT NULL,
  "storeId"                 TEXT          NOT NULL,
  "productId"               INTEGER       NOT NULL,
  "storeProductId"          TEXT          NOT NULL,
  "predictedDaysToStockout" DOUBLE PRECISION NOT NULL,
  "avgDailyUnits"           DOUBLE PRECISION NOT NULL,
  "currentStock"            INTEGER       NOT NULL,
  "confidence"              DOUBLE PRECISION NOT NULL,
  "severity"                TEXT          NOT NULL,
  "computedAt"              TIMESTAMP(3)  NOT NULL,
  "expiresAt"               TIMESTAMP(3)  NOT NULL,
  CONSTRAINT "StockoutPrediction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "StockoutPrediction_tenantId_idx"
  ON "StockoutPrediction"("tenantId");

CREATE INDEX IF NOT EXISTS "StockoutPrediction_storeId_idx"
  ON "StockoutPrediction"("storeId");

CREATE INDEX IF NOT EXISTS "StockoutPrediction_storeId_severity_idx"
  ON "StockoutPrediction"("storeId", "severity");

CREATE INDEX IF NOT EXISTS "StockoutPrediction_expiresAt_idx"
  ON "StockoutPrediction"("expiresAt");

ALTER TABLE "StockoutPrediction"
  ADD CONSTRAINT IF NOT EXISTS "StockoutPrediction_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE;

ALTER TABLE "StockoutPrediction"
  ADD CONSTRAINT IF NOT EXISTS "StockoutPrediction_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id");

ALTER TABLE "StockoutPrediction"
  ADD CONSTRAINT IF NOT EXISTS "StockoutPrediction_storeProductId_fkey"
  FOREIGN KEY ("storeProductId") REFERENCES "StoreProduct"("id");

-- ─── C2: SalesAnomaly ────────────────────────────────────
CREATE TABLE IF NOT EXISTS "SalesAnomaly" (
  "id"             TEXT          NOT NULL,
  "tenantId"       TEXT          NOT NULL,
  "storeId"        TEXT          NOT NULL,
  "date"           TIMESTAMP(3)  NOT NULL,
  "comparisonDate" TIMESTAMP(3)  NOT NULL,
  "metric"         TEXT          NOT NULL,
  "expected"       DOUBLE PRECISION NOT NULL,
  "actual"         DOUBLE PRECISION NOT NULL,
  "deltaPct"       DOUBLE PRECISION NOT NULL,
  "severity"       TEXT          NOT NULL,
  "direction"      TEXT          NOT NULL,
  "notifiedAt"     TIMESTAMP(3),
  "acknowledgedAt" TIMESTAMP(3),
  "createdAt"      TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SalesAnomaly_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SalesAnomaly_tenantId_idx"
  ON "SalesAnomaly"("tenantId");

CREATE INDEX IF NOT EXISTS "SalesAnomaly_storeId_idx"
  ON "SalesAnomaly"("storeId");

CREATE INDEX IF NOT EXISTS "SalesAnomaly_storeId_date_idx"
  ON "SalesAnomaly"("storeId", "date");

CREATE INDEX IF NOT EXISTS "SalesAnomaly_severity_idx"
  ON "SalesAnomaly"("severity");

ALTER TABLE "SalesAnomaly"
  ADD CONSTRAINT IF NOT EXISTS "SalesAnomaly_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE;

-- ─── C3: SponsoredBoost ──────────────────────────────────
CREATE TABLE IF NOT EXISTS "SponsoredBoost" (
  "id"               TEXT          NOT NULL,
  "tenantId"         TEXT          NOT NULL,
  "storeId"          TEXT          NOT NULL,
  "productId"        INTEGER       NOT NULL,
  "bidAmount"        DECIMAL(10,2) NOT NULL,
  "startDate"        TIMESTAMP(3)  NOT NULL,
  "endDate"          TIMESTAMP(3)  NOT NULL,
  "status"           TEXT          NOT NULL DEFAULT 'active',
  "impressionsCount" INTEGER       NOT NULL DEFAULT 0,
  "clicksCount"      INTEGER       NOT NULL DEFAULT 0,
  "conversionsCount" INTEGER       NOT NULL DEFAULT 0,
  "totalSpentPen"    DECIMAL(10,2) NOT NULL DEFAULT 0,
  "maxBudgetPen"     DECIMAL(10,2) NOT NULL,
  "createdAt"        TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3)  NOT NULL,
  CONSTRAINT "SponsoredBoost_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SponsoredBoost_tenantId_idx"
  ON "SponsoredBoost"("tenantId");

CREATE INDEX IF NOT EXISTS "SponsoredBoost_storeId_idx"
  ON "SponsoredBoost"("storeId");

CREATE INDEX IF NOT EXISTS "SponsoredBoost_productId_idx"
  ON "SponsoredBoost"("productId");

CREATE INDEX IF NOT EXISTS "SponsoredBoost_status_idx"
  ON "SponsoredBoost"("status");

CREATE INDEX IF NOT EXISTS "SponsoredBoost_status_endDate_idx"
  ON "SponsoredBoost"("status", "endDate");

ALTER TABLE "SponsoredBoost"
  ADD CONSTRAINT IF NOT EXISTS "SponsoredBoost_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE;

ALTER TABLE "SponsoredBoost"
  ADD CONSTRAINT IF NOT EXISTS "SponsoredBoost_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id");

-- ─── C4: SearchSuggestion ────────────────────────────────
CREATE TABLE IF NOT EXISTS "SearchSuggestion" (
  "id"               TEXT          NOT NULL,
  "tenantId"         TEXT          NOT NULL,
  "query"            TEXT          NOT NULL,
  "normalizedQuery"  TEXT          NOT NULL,
  "resultCount"      INTEGER       NOT NULL,
  "clickedProductId" INTEGER,
  "lastSearchedAt"   TIMESTAMP(3)  NOT NULL,
  "searchCount"      INTEGER       NOT NULL DEFAULT 1,
  CONSTRAINT "SearchSuggestion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SearchSuggestion_tenantId_normalizedQuery_key"
  ON "SearchSuggestion"("tenantId", "normalizedQuery");

CREATE INDEX IF NOT EXISTS "SearchSuggestion_tenantId_idx"
  ON "SearchSuggestion"("tenantId");

CREATE INDEX IF NOT EXISTS "SearchSuggestion_tenantId_normalizedQuery_idx"
  ON "SearchSuggestion"("tenantId", "normalizedQuery");

CREATE INDEX IF NOT EXISTS "SearchSuggestion_lastSearchedAt_idx"
  ON "SearchSuggestion"("lastSearchedAt");

-- ─── Registro en _prisma_migrations (opcional) ───────────
-- Si usás el bypass manual de Prisma, insertar aquí el registro.
-- Dejar comentado si aplicás via Prisma directamente.
-- INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
-- VALUES (gen_random_uuid(), '', NOW(), '20260407000000_marketplace_bloque_c', NULL, NULL, NOW(), 1)
-- ON CONFLICT DO NOTHING;
