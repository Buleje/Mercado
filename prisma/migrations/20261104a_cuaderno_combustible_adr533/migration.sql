-- ADR-533 · Cuaderno de combustible en cilindros (SUNAT bienes fiscalizados).
-- Aditiva e idempotente: 2 tablas nuevas (ingresos y conteos) y columnas
-- opcionales en AssetExpense para el vale (las filas viejas quedan en NULL,
-- el Prisma viejo de producción no las lee).

ALTER TABLE "AssetExpense"
  ADD COLUMN IF NOT EXISTS "fuelSource"    TEXT,
  ADD COLUMN IF NOT EXISTS "voucherNumber" INTEGER,
  ADD COLUMN IF NOT EXISTS "hourMeter"     DECIMAL(12,1),
  ADD COLUMN IF NOT EXISTS "operatorName"  TEXT,
  ADD COLUMN IF NOT EXISTS "signature"     TEXT,
  ADD COLUMN IF NOT EXISTS "createdBy"     TEXT,
  ADD COLUMN IF NOT EXISTS "annulledAt"    TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "annulReason"   TEXT,
  ADD COLUMN IF NOT EXISTS "annulledBy"    TEXT;

-- N.° de vale único por negocio (los NULL de los gastos sueltos no chocan entre sí).
CREATE UNIQUE INDEX IF NOT EXISTS "AssetExpense_tenantId_voucherNumber_key"
  ON "AssetExpense" ("tenantId", "voucherNumber");
CREATE INDEX IF NOT EXISTS "AssetExpense_tenantId_fuelSource_date_idx"
  ON "AssetExpense" ("tenantId", "fuelSource", "date");

CREATE TABLE IF NOT EXISTS "FuelPurchase" (
  "id"            TEXT          NOT NULL,
  "tenantId"      TEXT          NOT NULL,
  "date"          TIMESTAMP(3)  NOT NULL,
  "kind"          TEXT          NOT NULL DEFAULT 'compra',
  "product"       TEXT          NOT NULL DEFAULT 'Diésel B5 S-50',
  "invoiceNumber" TEXT,
  "supplierName"  TEXT,
  "supplierRuc"   TEXT,
  "guideNumber"   TEXT,
  "cylinders"     INTEGER       NOT NULL,
  "gallons"       DECIMAL(10,2) NOT NULL,
  "unitPrice"     DECIMAL(10,3),
  "amount"        DECIMAL(14,2) NOT NULL DEFAULT 0,
  "firstCylinder" INTEGER       NOT NULL,
  "expenseId"     TEXT,
  "notes"         TEXT,
  "createdBy"     TEXT,
  "annulledAt"    TIMESTAMP(3),
  "annulReason"   TEXT,
  "annulledBy"    TEXT,
  "createdAt"     TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3)  NOT NULL,
  CONSTRAINT "FuelPurchase_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "FuelPurchase_tenantId_firstCylinder_key"
  ON "FuelPurchase" ("tenantId", "firstCylinder");
CREATE INDEX IF NOT EXISTS "FuelPurchase_tenantId_date_idx"
  ON "FuelPurchase" ("tenantId", "date");

CREATE TABLE IF NOT EXISTS "FuelCount" (
  "id"               TEXT          NOT NULL,
  "tenantId"         TEXT          NOT NULL,
  "date"             TIMESTAMP(3)  NOT NULL,
  "cylindersCounted" INTEGER       NOT NULL,
  "gallonsCounted"   DECIMAL(10,2) NOT NULL,
  "cylindersBook"    INTEGER       NOT NULL,
  "gallonsBook"      DECIMAL(10,2) NOT NULL,
  "countedBy"        TEXT          NOT NULL,
  "witness"          TEXT,
  "notes"            TEXT,
  "createdBy"        TEXT,
  "annulledAt"       TIMESTAMP(3),
  "annulReason"      TEXT,
  "annulledBy"       TEXT,
  "createdAt"        TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FuelCount_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "FuelCount_tenantId_date_idx"
  ON "FuelCount" ("tenantId", "date");
