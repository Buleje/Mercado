-- ============================================================
-- round28-product-analytics-create.sql
-- Idempotent. Run in Supabase SQL Editor.
-- Crea la tabla ProductAnalytics si no existe, refleja
-- exactamente el modelo Prisma (schema.prisma L3340-3358).
-- ============================================================

-- 1. Tabla principal
CREATE TABLE IF NOT EXISTS "ProductAnalytics" (
  "id"          TEXT          NOT NULL,
  "productId"   INTEGER       NOT NULL,
  "tenantId"    TEXT          NOT NULL,
  "date"        DATE          NOT NULL,
  "views"       INTEGER       NOT NULL DEFAULT 0,
  "clicks"      INTEGER       NOT NULL DEFAULT 0,
  "addsToCart"  INTEGER       NOT NULL DEFAULT 0,
  "conversions" INTEGER       NOT NULL DEFAULT 0,
  "revenue"     DECIMAL(12,2) NOT NULL DEFAULT 0,
  "createdAt"   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  "updatedAt"   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT "ProductAnalytics_pkey" PRIMARY KEY ("id"),

  -- FK → Product (onDelete: Cascade)
  CONSTRAINT "ProductAnalytics_productId_fkey"
    FOREIGN KEY ("productId")
    REFERENCES "Product"("id")
    ON DELETE CASCADE
);

-- 2. Unique constraint @@unique([productId, date, tenantId])
ALTER TABLE "ProductAnalytics"
  ADD CONSTRAINT "ProductAnalytics_productId_date_tenantId_key"
  UNIQUE ("productId", "date", "tenantId")
  ON CONFLICT DO NOTHING;

-- 3. Índices @@index([tenantId]), @@index([productId]), @@index([tenantId, date])
CREATE INDEX IF NOT EXISTS "ProductAnalytics_tenantId_idx"
  ON "ProductAnalytics" ("tenantId");

CREATE INDEX IF NOT EXISTS "ProductAnalytics_productId_idx"
  ON "ProductAnalytics" ("productId");

CREATE INDEX IF NOT EXISTS "ProductAnalytics_tenantId_date_idx"
  ON "ProductAnalytics" ("tenantId", "date");

-- 4. Trigger para updatedAt automático (Prisma lo espera actualizado)
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW."updatedAt" = NOW();
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'product_analytics_set_updated_at'
  ) THEN
    CREATE TRIGGER product_analytics_set_updated_at
      BEFORE UPDATE ON "ProductAnalytics"
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END;
$$;

-- ============================================================
-- VALIDATION — debe retornar count = 1
-- ============================================================
SELECT COUNT(*) AS table_exists
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name = 'ProductAnalytics';
