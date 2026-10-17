-- ADR-307 — Contratos salen de la tabla Note a modelo propio.
-- Idempotente: se puede correr varias veces sin romper nada.

CREATE TABLE IF NOT EXISTS "Contract" (
  "id"                    TEXT PRIMARY KEY,
  "tenantId"              TEXT NOT NULL,
  "numero"                TEXT NOT NULL,
  "tipo"                  TEXT NOT NULL,
  "estado"                TEXT NOT NULL DEFAULT 'BORRADOR',
  "clienteNombre"         TEXT NOT NULL,
  "clienteDoc"            TEXT NOT NULL DEFAULT '',
  "customerId"            TEXT,
  "supplierId"            TEXT,
  "descripcion"           TEXT NOT NULL DEFAULT '',
  "resumen"               TEXT NOT NULL DEFAULT '',
  "monto"                 DECIMAL(12,2) NOT NULL DEFAULT 0,
  "moneda"                TEXT NOT NULL DEFAULT 'PEN',
  "fechaInicio"           TIMESTAMP(3) NOT NULL,
  "fechaVencimiento"      TIMESTAMP(3),
  "plantillaId"           TEXT,
  "contenido"             TEXT NOT NULL DEFAULT '',
  "datos"                 JSONB,
  "clausulas"             TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "lugarFirma"            TEXT NOT NULL DEFAULT 'Pucallpa',
  "condiciones"           TEXT NOT NULL DEFAULT '',
  "documentId"            TEXT,
  "hashSha256"            TEXT,
  "firmadoEn"             TIMESTAMP(3),
  "renovadoDeId"          TEXT,
  "revisionIa"            JSONB,
  "recordatorioEnviadoEn" TIMESTAMP(3),
  "creadoPor"             TEXT NOT NULL DEFAULT '',
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt"             TIMESTAMP(3)
);

CREATE UNIQUE INDEX IF NOT EXISTS "Contract_tenantId_numero_key"    ON "Contract"("tenantId", "numero");
CREATE INDEX        IF NOT EXISTS "Contract_tenantId_estado_idx"    ON "Contract"("tenantId", "estado");
CREATE INDEX        IF NOT EXISTS "Contract_tenantId_venc_idx"      ON "Contract"("tenantId", "fechaVencimiento");
CREATE INDEX        IF NOT EXISTS "Contract_tenantId_tipo_idx"      ON "Contract"("tenantId", "tipo");
CREATE INDEX        IF NOT EXISTS "Contract_tenantId_createdAt_idx" ON "Contract"("tenantId", "createdAt");

CREATE TABLE IF NOT EXISTS "ContractSigner" (
  "id"            TEXT PRIMARY KEY,
  "contractId"    TEXT NOT NULL,
  "tenantId"      TEXT NOT NULL,
  "orden"         INTEGER NOT NULL DEFAULT 1,
  "rol"           TEXT NOT NULL DEFAULT 'CONTRAPARTE',
  "nombre"        TEXT NOT NULL,
  "documento"     TEXT NOT NULL DEFAULT '',
  "telefono"      TEXT NOT NULL DEFAULT '',
  "email"         TEXT,
  "estado"        TEXT NOT NULL DEFAULT 'PENDIENTE',
  "token"         TEXT NOT NULL,
  "tokenExpiraEn" TIMESTAMP(3),
  "firmaDataUrl"  TEXT,
  "firmadoEn"     TIMESTAMP(3),
  "ip"            TEXT,
  "userAgent"     TEXT,
  "motivoRechazo" TEXT,
  "enviadoEn"     TIMESTAMP(3),
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContractSigner_contractId_fkey" FOREIGN KEY ("contractId")
    REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "ContractSigner_token_key"       ON "ContractSigner"("token");
CREATE INDEX        IF NOT EXISTS "ContractSigner_contract_idx"    ON "ContractSigner"("contractId", "orden");
CREATE INDEX        IF NOT EXISTS "ContractSigner_tenantId_idx"    ON "ContractSigner"("tenantId");

CREATE TABLE IF NOT EXISTS "ContractEvent" (
  "id"         TEXT PRIMARY KEY,
  "contractId" TEXT NOT NULL,
  "tenantId"   TEXT NOT NULL,
  "tipo"       TEXT NOT NULL,
  "detalle"    TEXT NOT NULL DEFAULT '',
  "actor"      TEXT NOT NULL DEFAULT '',
  "metadata"   JSONB,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContractEvent_contractId_fkey" FOREIGN KEY ("contractId")
    REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "ContractEvent_contract_idx" ON "ContractEvent"("contractId", "createdAt");
CREATE INDEX IF NOT EXISTS "ContractEvent_tenant_idx"   ON "ContractEvent"("tenantId", "createdAt");
