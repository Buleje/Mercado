-- Liquidar la cuenta de una persona (ADR-413): una cabecera con código LIQ que
-- agrupa las entregas de adelanto y los movimientos forestales de un mismo acto.
--
-- EXPAND puro: una tabla nueva y columnas nullables. Ningún dato existente
-- cambia y el código actual no lee nada de esto. Idempotente. Para revertir:
-- quitar índices, columnas y la tabla, en orden inverso.
--
-- Uso: USE_POOLER=1 SQL_FILE=prisma/migrations/adr-413-liquidar-cuenta.sql node -r dotenv/config scripts/apply-fiados-gestion-migration.mjs dotenv_config_path=.env.local

-- 1. La cabecera. Las CHECK son la red: una liquidación sin persona, sin nada
--    que liquidar o con un pago a medias no puede existir aunque el código falle.
CREATE TABLE IF NOT EXISTS "LiquidacionCuenta" (
  "id"               TEXT          NOT NULL,
  "tenantId"         TEXT          NOT NULL,
  "codigo"           TEXT          NOT NULL,
  "idempotencyKey"   TEXT          NOT NULL,
  "beneficiarioId"   TEXT,
  "parteId"          TEXT,
  "personaNombre"    TEXT          NOT NULL,
  "personaDocumento" TEXT,
  "fecha"            TIMESTAMP(3)  NOT NULL,
  "montoCompensado"  DECIMAL(12,2) NOT NULL DEFAULT 0,
  "pagoDireccion"    TEXT,
  "pagoMonto"        DECIMAL(12,2),
  "metodoPago"       TEXT,
  "moverCaja"        BOOLEAN       NOT NULL DEFAULT false,
  "cajaMovimientoId" TEXT,
  "cajaResultado"    TEXT,
  "detalle"          JSONB         NOT NULL,
  "notas"            TEXT,
  "createdBy"        TEXT          NOT NULL,
  "createdAt"        TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "anuladaAt"        TIMESTAMP(3),
  "anuladaPor"       TEXT,
  "motivoAnulacion"  TEXT,
  "cajaReversionId"  TEXT,
  CONSTRAINT "LiquidacionCuenta_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LiquidacionCuenta_persona_chk" CHECK ("beneficiarioId" IS NOT NULL OR "parteId" IS NOT NULL),
  CONSTRAINT "LiquidacionCuenta_montos_chk" CHECK ("montoCompensado" >= 0 AND ("pagoMonto" IS NULL OR "pagoMonto" > 0)),
  CONSTRAINT "LiquidacionCuenta_pago_chk" CHECK (
    ("pagoDireccion" IS NULL AND "pagoMonto" IS NULL AND "metodoPago" IS NULL)
    OR ("pagoDireccion" IN ('recibido', 'hecho') AND "pagoMonto" IS NOT NULL AND "metodoPago" IS NOT NULL)
  ),
  CONSTRAINT "LiquidacionCuenta_algo_chk" CHECK ("montoCompensado" > 0 OR "pagoMonto" IS NOT NULL)
);

-- Único TOTAL (no parcial): toda liquidación nace con código y una anulada lo
-- conserva — el número ya está escrito en un papel firmado (ADR-329, sin el
-- caso de filas viejas sin código).
CREATE UNIQUE INDEX IF NOT EXISTS "LiquidacionCuenta_tenantId_codigo_key"
  ON "LiquidacionCuenta" ("tenantId", "codigo");
CREATE UNIQUE INDEX IF NOT EXISTS "LiquidacionCuenta_tenantId_idempotencyKey_key"
  ON "LiquidacionCuenta" ("tenantId", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "LiquidacionCuenta_tenantId_beneficiarioId_createdAt_idx"
  ON "LiquidacionCuenta" ("tenantId", "beneficiarioId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "LiquidacionCuenta_tenantId_parteId_createdAt_idx"
  ON "LiquidacionCuenta" ("tenantId", "parteId", "createdAt" DESC);

-- 2. La cuenta forestal: de qué liquidación salió el movimiento.
ALTER TABLE "ForestCuentaMov" ADD COLUMN IF NOT EXISTS "liquidacionId" TEXT;
CREATE INDEX IF NOT EXISTS "ForestCuentaMov_tenantId_liquidacionId_idx"
  ON "ForestCuentaMov" ("tenantId", "liquidacionId");

-- 3. Las entregas: de qué liquidación salió y, si se anuló, cuándo. `anuladaAt`
--    NULL en todas las filas existentes = ninguna lectura actual cambia.
ALTER TABLE "AdelantoEntrega" ADD COLUMN IF NOT EXISTS "liquidacionId" TEXT;
ALTER TABLE "AdelantoEntrega" ADD COLUMN IF NOT EXISTS "anuladaAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "AdelantoEntrega_liquidacionId_idx"
  ON "AdelantoEntrega" ("liquidacionId");
