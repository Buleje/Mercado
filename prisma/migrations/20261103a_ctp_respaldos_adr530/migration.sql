-- ADR-530 · Respaldos del Libro CTP: foto comprimida del libro en la base.
-- Aditiva e idempotente: una tabla nueva y su índice; no toca nada existente.
CREATE TABLE IF NOT EXISTS "ForestCtpRespaldo" (
  "id"        TEXT         NOT NULL,
  "tenantId"  TEXT         NOT NULL,
  "tipo"      TEXT         NOT NULL,
  "nota"      TEXT,
  "conteos"   JSONB        NOT NULL,
  "huella"    TEXT         NOT NULL,
  "version"   INTEGER      NOT NULL DEFAULT 1,
  "bytes"     INTEGER      NOT NULL,
  "datos"     BYTEA        NOT NULL,
  "createdBy" TEXT         NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ForestCtpRespaldo_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ForestCtpRespaldo_tenantId_createdAt_idx"
  ON "ForestCtpRespaldo" ("tenantId", "createdAt" DESC);
