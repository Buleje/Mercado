-- Migration: add_supplier_portal_models
-- Adds SupplierPriceVersion, SupplierRating, SupplierOffer

-- ─── SupplierPriceVersion ─────────────────────────────────────────────────────
CREATE TABLE "SupplierPriceVersion" (
    "id"            TEXT        NOT NULL,
    "supplierId"    TEXT        NOT NULL,
    "productName"   TEXT        NOT NULL,
    "sku"           TEXT,
    "oldPrice"      DOUBLE PRECISION NOT NULL,
    "newPrice"      DOUBLE PRECISION NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierPriceVersion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SupplierPriceVersion_supplierId_idx"    ON "SupplierPriceVersion"("supplierId");
CREATE INDEX "SupplierPriceVersion_effectiveDate_idx" ON "SupplierPriceVersion"("effectiveDate");

-- ─── SupplierRating ───────────────────────────────────────────────────────────
CREATE TABLE "SupplierRating" (
    "id"              TEXT        NOT NULL,
    "tenantId"        TEXT        NOT NULL,
    "supplierId"      TEXT        NOT NULL,
    "period"          TEXT        NOT NULL,
    "ordersPlaced"    INTEGER     NOT NULL DEFAULT 0,
    "ordersDelivered" INTEGER     NOT NULL DEFAULT 0,
    "ordersOnTime"    INTEGER     NOT NULL DEFAULT 0,
    "avgDeliveryDays" DOUBLE PRECISION,
    "fillRate"        DOUBLE PRECISION,
    "qualityScore"    DOUBLE PRECISION,
    "calculatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierRating_pkey"                  PRIMARY KEY ("id"),
    CONSTRAINT "SupplierRating_tenantId_supplierId_period_key"
        UNIQUE ("tenantId", "supplierId", "period")
);

CREATE INDEX "SupplierRating_supplierId_idx" ON "SupplierRating"("supplierId");

-- ─── SupplierOffer ────────────────────────────────────────────────────────────
CREATE TABLE "SupplierOffer" (
    "id"              TEXT        NOT NULL,
    "supplierId"      TEXT        NOT NULL,
    "title"           TEXT        NOT NULL,
    "description"     TEXT,
    "discountPercent" DOUBLE PRECISION,
    "minQuantity"     INTEGER,
    "validFrom"       TIMESTAMP(3) NOT NULL,
    "validUntil"      TIMESTAMP(3) NOT NULL,
    "isActive"        BOOLEAN     NOT NULL DEFAULT true,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierOffer_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SupplierOffer_supplierId_idx"  ON "SupplierOffer"("supplierId");
CREATE INDEX "SupplierOffer_validUntil_idx"  ON "SupplierOffer"("validUntil");
