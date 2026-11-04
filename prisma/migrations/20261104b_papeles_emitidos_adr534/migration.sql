-- ADR-534 · Papeles emitidos (registro de los papeles de `papel` + QR público).
-- Aditiva e idempotente: 1 tabla nueva, sin enum ni columnas en tablas viejas
-- (el Prisma viejo de producción no la lee). SIN datos personales por diseño:
-- la página pública no puede mostrar lo que la tabla no guarda.

CREATE TABLE IF NOT EXISTS "PapelEmitido" (
  "id"             TEXT          NOT NULL,
  "tenantId"       TEXT          NOT NULL,
  "numero"         TEXT          NOT NULL,
  "tipo"           TEXT          NOT NULL,
  "titulo"         TEXT          NOT NULL,
  "fecha"          DATE          NOT NULL,
  "estado"         TEXT          NOT NULL,
  "codigo"         TEXT          NOT NULL,
  "clave"          TEXT          NOT NULL,
  "total"          DECIMAL(14,2),
  "moneda"         TEXT          NOT NULL DEFAULT 'PEN',
  "hojas"          INTEGER,
  "documentId"     TEXT,
  "reemplazadoPor" TEXT,
  "createdAt"      TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3)  NOT NULL,
  CONSTRAINT "PapelEmitido_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PapelEmitido_tenantId_codigo_key"
  ON "PapelEmitido" ("tenantId", "codigo");
CREATE INDEX IF NOT EXISTS "PapelEmitido_tenantId_numero_idx"
  ON "PapelEmitido" ("tenantId", "numero");
