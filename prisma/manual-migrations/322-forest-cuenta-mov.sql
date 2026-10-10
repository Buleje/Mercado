-- ADR-322 · Cuenta corriente con las partes del directorio. Idempotente.
CREATE TABLE IF NOT EXISTS "ForestCuentaMov" (
  "id"          TEXT PRIMARY KEY,
  "tenantId"    TEXT NOT NULL,
  "parteId"     TEXT NOT NULL,
  "parteNombre" TEXT NOT NULL,
  "fecha"       TIMESTAMP(3) NOT NULL,
  "tipo"        TEXT NOT NULL,
  "concepto"    TEXT NOT NULL,
  "monto"       DECIMAL(12,2) NOT NULL,
  "moneda"      TEXT DEFAULT 'PEN',
  "referencia"  TEXT,
  "fleteId"     TEXT,
  "notas"       TEXT,
  "createdBy"   TEXT NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt"   TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS "ForestCuentaMov_tenantId_parteId_fecha_idx" ON "ForestCuentaMov" ("tenantId", "parteId", "fecha" DESC);
CREATE INDEX IF NOT EXISTS "ForestCuentaMov_tenantId_fecha_idx" ON "ForestCuentaMov" ("tenantId", "fecha" DESC);
CREATE INDEX IF NOT EXISTS "ForestCuentaMov_deletedAt_idx" ON "ForestCuentaMov" ("deletedAt");
-- Un flete no se puede cargar dos veces a la cuenta.
CREATE UNIQUE INDEX IF NOT EXISTS "ForestCuentaMov_tenantId_fleteId_key" ON "ForestCuentaMov" ("tenantId", "fleteId");
