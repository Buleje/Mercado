-- CacaoVenta (ADR-128 v3) — venta de cacao seco. Creado manualmente (drift, como
-- el resto del módulo cacao). Aplicar en prod antes de deploy.
CREATE TABLE IF NOT EXISTS "CacaoVenta" (
  "id"              TEXT NOT NULL,
  "tenantId"        TEXT NOT NULL,
  "ventaCode"       TEXT NOT NULL,
  "fecha"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "compradorNombre" TEXT,
  "canal"           TEXT,
  "pesoKg"          DECIMAL(12,2) NOT NULL,
  "moneda"          TEXT NOT NULL DEFAULT 'PEN',
  "precioPorKg"     DECIMAL(10,2),
  "tipoCambio"      DECIMAL(8,4),
  "totalPen"        DECIMAL(14,2),
  "esFob"           BOOLEAN NOT NULL DEFAULT false,
  "variedad"        TEXT,
  "grado"           TEXT,
  "observaciones"   TEXT,
  "status"          TEXT NOT NULL DEFAULT 'registrado',
  "annulledReason"  TEXT,
  "createdBy"       TEXT NOT NULL,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt"       TIMESTAMP(3),
  CONSTRAINT "CacaoVenta_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CacaoVenta_tenantId_fecha_idx" ON "CacaoVenta" ("tenantId", "fecha" DESC);
CREATE INDEX IF NOT EXISTS "CacaoVenta_tenantId_status_idx" ON "CacaoVenta" ("tenantId", "status");
CREATE INDEX IF NOT EXISTS "CacaoVenta_deletedAt_idx" ON "CacaoVenta" ("deletedAt");
