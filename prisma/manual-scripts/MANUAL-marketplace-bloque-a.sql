-- Migración manual: Marketplace Bloque A
-- Tablas nuevas: ProductImage, ProductVariant
-- Extensión: Review (6 campos opcionales)
-- Ejecutar en Supabase SQL Editor con conexión DIRECT (puerto 5432)

-- ─── ProductImage ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "ProductImage" (
  "id"        TEXT         NOT NULL,
  "productId" INTEGER      NOT NULL,
  "url"       TEXT         NOT NULL,
  "alt"       TEXT,
  "position"  INTEGER      NOT NULL DEFAULT 0,
  "isPrimary" BOOLEAN      NOT NULL DEFAULT false,
  "tenantId"  TEXT         NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ProductImage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProductImage_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "ProductImage_productId_idx"          ON "ProductImage"("productId");
CREATE INDEX IF NOT EXISTS "ProductImage_tenantId_idx"           ON "ProductImage"("tenantId");
CREATE INDEX IF NOT EXISTS "ProductImage_productId_position_idx" ON "ProductImage"("productId", "position");

-- ─── ProductVariant ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "ProductVariant" (
  "id"             TEXT         NOT NULL,
  "productId"      INTEGER      NOT NULL,
  "name"           TEXT         NOT NULL,
  "sku"            TEXT,
  "priceModifier"  DOUBLE PRECISION NOT NULL DEFAULT 0,
  "stock"          INTEGER,
  "attributesJson" TEXT,
  "isActive"       BOOLEAN      NOT NULL DEFAULT true,
  "position"       INTEGER      NOT NULL DEFAULT 0,
  "tenantId"       TEXT         NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ProductVariant_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProductVariant_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "ProductVariant_productId_idx" ON "ProductVariant"("productId");
CREATE INDEX IF NOT EXISTS "ProductVariant_tenantId_idx"  ON "ProductVariant"("tenantId");
CREATE INDEX IF NOT EXISTS "ProductVariant_sku_idx"       ON "ProductVariant"("sku");

-- ─── Review: extensión de campos ─────────────────────────────────────────────
-- Todos los campos son opcionales/con default para backward compatibility

ALTER TABLE "Review" ADD COLUMN IF NOT EXISTS "qualityRating"  INTEGER;
ALTER TABLE "Review" ADD COLUMN IF NOT EXISTS "priceRating"    INTEGER;
ALTER TABLE "Review" ADD COLUMN IF NOT EXISTS "deliveryRating" INTEGER;
ALTER TABLE "Review" ADD COLUMN IF NOT EXISTS "photosJson"     TEXT;
ALTER TABLE "Review" ADD COLUMN IF NOT EXISTS "verified"       BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Review" ADD COLUMN IF NOT EXISTS "helpfulCount"   INTEGER NOT NULL DEFAULT 0;
