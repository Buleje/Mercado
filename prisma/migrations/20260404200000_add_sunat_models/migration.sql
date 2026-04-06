-- Migration: 20260404200000_add_sunat_models
-- Adds TenantSunatConfig and SunatInvoice models for electronic billing (SUNAT/Nubefact)

-- ─── TenantSunatConfig ────────────────────────────────────────────────────────
CREATE TABLE "TenantSunatConfig" (
    "id"              TEXT NOT NULL,
    "tenantId"        TEXT NOT NULL,
    "ruc"             TEXT NOT NULL,
    "razonSocial"     TEXT NOT NULL,
    "direccionFiscal" TEXT,
    "ubigeo"          TEXT,
    "nubefactToken"   TEXT NOT NULL,
    "nubefactUrl"     TEXT NOT NULL DEFAULT 'https://api.nubefact.com/api/v1',
    "boletaSeries"    TEXT NOT NULL DEFAULT 'B001',
    "facturaSeries"   TEXT NOT NULL DEFAULT 'F001',
    "lastBoletaNum"   INTEGER NOT NULL DEFAULT 0,
    "lastFacturaNum"  INTEGER NOT NULL DEFAULT 0,
    "isProduction"    BOOLEAN NOT NULL DEFAULT false,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantSunatConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TenantSunatConfig_tenantId_key"
    ON "TenantSunatConfig"("tenantId");

CREATE INDEX "TenantSunatConfig_tenantId_idx"
    ON "TenantSunatConfig"("tenantId");

-- ─── SunatInvoice ─────────────────────────────────────────────────────────────
CREATE TABLE "SunatInvoice" (
    "id"           TEXT NOT NULL,
    "tenantId"     TEXT NOT NULL,
    "orderId"      TEXT,
    "type"         TEXT NOT NULL,
    "series"       TEXT NOT NULL,
    "number"       INTEGER NOT NULL,
    "customerRuc"  TEXT,
    "customerName" TEXT NOT NULL,
    "subtotal"     DOUBLE PRECISION NOT NULL,
    "igv"          DOUBLE PRECISION NOT NULL,
    "total"        DOUBLE PRECISION NOT NULL,
    "xmlContent"   TEXT,
    "cdrResponse"  TEXT,
    "sunatStatus"  TEXT NOT NULL DEFAULT 'pending',
    "nubefactId"   TEXT,
    "pdfUrl"       TEXT,
    "errorMessage" TEXT,
    "sentAt"       TIMESTAMP(3),
    "acceptedAt"   TIMESTAMP(3),
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SunatInvoice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SunatInvoice_tenantId_series_number_key"
    ON "SunatInvoice"("tenantId", "series", "number");

CREATE INDEX "SunatInvoice_tenantId_idx"
    ON "SunatInvoice"("tenantId");

CREATE INDEX "SunatInvoice_tenantId_type_series_number_idx"
    ON "SunatInvoice"("tenantId", "type", "series", "number");

CREATE INDEX "SunatInvoice_orderId_idx"
    ON "SunatInvoice"("orderId");

CREATE INDEX "SunatInvoice_sunatStatus_idx"
    ON "SunatInvoice"("sunatStatus");
