-- 313 · Lotes de producción / comercialización forestal (ADR-136)
-- Capa comercial sobre el CTP: agrupa corridas de producción en lotes con
-- código, grado y estado. Idempotente.

CREATE TABLE IF NOT EXISTS "ForestProdLote" (
  "id"                TEXT NOT NULL,
  "tenantId"          TEXT NOT NULL,
  "loteCode"          TEXT NOT NULL,
  "productType"       TEXT,
  "speciesCommon"     TEXT,
  "speciesScientific" TEXT,
  "cites"             BOOLEAN NOT NULL DEFAULT false,
  "unit"              TEXT NOT NULL DEFAULT 'm3',
  "grade"             TEXT,
  "destino"           TEXT,
  "status"            TEXT NOT NULL DEFAULT 'abierto',
  "annulledReason"    TEXT,
  "notes"             TEXT,
  "closedAt"          TIMESTAMP(3),
  "createdBy"         TEXT NOT NULL,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt"         TIMESTAMP(3),
  CONSTRAINT "ForestProdLote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ForestProdLote_tenantId_loteCode_key"
  ON "ForestProdLote" ("tenantId", "loteCode");
CREATE INDEX IF NOT EXISTS "ForestProdLote_tenantId_status_idx"
  ON "ForestProdLote" ("tenantId", "status");
CREATE INDEX IF NOT EXISTS "ForestProdLote_tenantId_deletedAt_idx"
  ON "ForestProdLote" ("tenantId", "deletedAt");
CREATE INDEX IF NOT EXISTS "ForestProdLote_tenantId_createdAt_idx"
  ON "ForestProdLote" ("tenantId", "createdAt" DESC);

CREATE TABLE IF NOT EXISTS "ForestProdLoteMiembro" (
  "id"                TEXT NOT NULL,
  "tenantId"          TEXT NOT NULL,
  "loteId"            TEXT NOT NULL,
  "produccionEntryId" TEXT NOT NULL,
  "quantity"          DECIMAL(14,4) NOT NULL,
  "createdBy"         TEXT NOT NULL,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ForestProdLoteMiembro_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ForestProdLoteMiembro_loteId_produccionEntryId_key"
  ON "ForestProdLoteMiembro" ("loteId", "produccionEntryId");
CREATE INDEX IF NOT EXISTS "ForestProdLoteMiembro_loteId_idx"
  ON "ForestProdLoteMiembro" ("loteId");
CREATE INDEX IF NOT EXISTS "ForestProdLoteMiembro_tenantId_produccionEntryId_idx"
  ON "ForestProdLoteMiembro" ("tenantId", "produccionEntryId");

DO $$ BEGIN
  ALTER TABLE "ForestProdLoteMiembro"
    ADD CONSTRAINT "ForestProdLoteMiembro_loteId_fkey"
    FOREIGN KEY ("loteId") REFERENCES "ForestProdLote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ForestProdLoteMiembro"
    ADD CONSTRAINT "ForestProdLoteMiembro_produccionEntryId_fkey"
    FOREIGN KEY ("produccionEntryId") REFERENCES "ForestCtpEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
