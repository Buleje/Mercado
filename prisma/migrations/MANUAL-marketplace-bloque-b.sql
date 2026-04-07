-- MANUAL-marketplace-bloque-b.sql
-- Idempotente: usar IF NOT EXISTS / ADD COLUMN IF NOT EXISTS
-- Ejecutar con DIRECT_URL (no pooler) contra Supabase

-- ─── Product: campos SEO ──────────────────────────────────
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "metaTitle"        TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "metaDescription"  TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "metaKeywordsJson" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "ogImage"          TEXT;

-- ─── StoreBanner ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "StoreBanner" (
  "id"        TEXT NOT NULL,
  "storeId"   TEXT NOT NULL,
  "title"     TEXT NOT NULL,
  "subtitle"  TEXT,
  "imageUrl"  TEXT NOT NULL,
  "linkUrl"   TEXT,
  "position"  INTEGER NOT NULL DEFAULT 0,
  "section"   TEXT NOT NULL DEFAULT 'hero',
  "isActive"  BOOLEAN NOT NULL DEFAULT true,
  "startDate" TIMESTAMP(3),
  "endDate"   TIMESTAMP(3),
  "tenantId"  TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StoreBanner_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "StoreBanner_storeId_idx"
  ON "StoreBanner"("storeId");

CREATE INDEX IF NOT EXISTS "StoreBanner_tenantId_idx"
  ON "StoreBanner"("tenantId");

CREATE INDEX IF NOT EXISTS "StoreBanner_storeId_section_position_idx"
  ON "StoreBanner"("storeId", "section", "position");

ALTER TABLE "StoreBanner"
  ADD CONSTRAINT IF NOT EXISTS "StoreBanner_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE;

-- ─── ProductAnalytics ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ProductAnalytics" (
  "id"          TEXT NOT NULL,
  "productId"   INTEGER NOT NULL,
  "tenantId"    TEXT NOT NULL,
  "date"        DATE NOT NULL,
  "views"       INTEGER NOT NULL DEFAULT 0,
  "clicks"      INTEGER NOT NULL DEFAULT 0,
  "addsToCart"  INTEGER NOT NULL DEFAULT 0,
  "conversions" INTEGER NOT NULL DEFAULT 0,
  "revenue"     DOUBLE PRECISION NOT NULL DEFAULT 0,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductAnalytics_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProductAnalytics_productId_date_tenantId_key"
  ON "ProductAnalytics"("productId", "date", "tenantId");

CREATE INDEX IF NOT EXISTS "ProductAnalytics_tenantId_idx"
  ON "ProductAnalytics"("tenantId");

CREATE INDEX IF NOT EXISTS "ProductAnalytics_productId_idx"
  ON "ProductAnalytics"("productId");

CREATE INDEX IF NOT EXISTS "ProductAnalytics_tenantId_date_idx"
  ON "ProductAnalytics"("tenantId", "date");

ALTER TABLE "ProductAnalytics"
  ADD CONSTRAINT IF NOT EXISTS "ProductAnalytics_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE;

-- ─── Registro en _prisma_migrations (opcional) ───────────
-- Si usás el bypass manual de Prisma, insertar aquí el registro.
-- Dejar comentado si aplicás via Prisma directamente.
-- INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
-- VALUES (gen_random_uuid(), '', NOW(), '20260407000000_marketplace_bloque_b', NULL, NULL, NOW(), 1)
-- ON CONFLICT DO NOTHING;
