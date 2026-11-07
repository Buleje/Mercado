-- Precios por cliente y vínculos del Directorio (ADR-430).
--
-- EXPAND puro: dos tablas nuevas. Ningún dato existente cambia y el código
-- viejo no lee nada de esto. Idempotente: se puede correr dos veces (las CHECK
-- van DENTRO del CREATE TABLE porque `ADD CONSTRAINT` no admite IF NOT EXISTS).
--
-- Medido antes (tenant real Blas, 22-09): 0 cobros, 0 movimientos de cuenta,
-- 0 despachos — no hay datos que migrar.
--
-- Para revertir (contar primero qué se perdería):
--   SELECT count(*) FROM "ForestParteTarifa";  SELECT count(*) FROM "ForestParteVinculo";
--   DROP TABLE IF EXISTS "ForestParteVinculo"; DROP TABLE IF EXISTS "ForestParteTarifa";
--
-- Uso: node scripts/apply-sql.mjs prisma/migrations/adr-430-precios-cliente-y-vinculos.sql

-- 1. El trato de precio con un cliente: una fila = una versión por fecha.
--    `parteId` sin FK (ADR-426): una FK aceptaría una parte de OTRO tenant; el
--    aislamiento lo hace la DB class con `findFirst({ id, tenantId })`.
CREATE TABLE IF NOT EXISTS "ForestParteTarifa" (
  "id"           TEXT          NOT NULL,
  "tenantId"     TEXT          NOT NULL,
  "parteId"      TEXT          NOT NULL,
  "servicio"     TEXT          NOT NULL,
  "vigenteDesde" DATE          NOT NULL,
  "basePt"       DECIMAL(10,4),
  "detalle"      JSONB         NOT NULL,
  "nota"         TEXT,
  "createdBy"    TEXT          NOT NULL,
  "createdAt"    TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt"    TIMESTAMP(3),
  CONSTRAINT "ForestParteTarifa_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ForestParteTarifa_servicio_chk" CHECK ("servicio" IN ('aserrio', 'venta')),
  -- «No pactado» es NULL, nunca 0: un cero cobraría gratis en silencio.
  CONSTRAINT "ForestParteTarifa_basePt_chk" CHECK ("basePt" IS NULL OR "basePt" > 0)
);

CREATE INDEX IF NOT EXISTS "ForestParteTarifa_tenantId_parteId_servicio_vigenteDesde_idx"
  ON "ForestParteTarifa" ("tenantId", "parteId", "servicio", "vigenteDesde" DESC);
CREATE INDEX IF NOT EXISTS "ForestParteTarifa_deletedAt_idx"
  ON "ForestParteTarifa" ("deletedAt");

-- Una versión viva por cliente, servicio y día. PARCIAL: `deletedAt` es NULL
-- en las vivas y Postgres trata cada NULL como distinto, así que un `@@unique`
-- que la incluyera no protegería nada; y uno total sin ella dejaría el día de
-- una versión dada de baja bloqueado para siempre (ADR-427, mismo caso).
CREATE UNIQUE INDEX IF NOT EXISTS "ForestParteTarifa_vigente_vivo_key"
  ON "ForestParteTarifa" ("tenantId", "parteId", "servicio", "vigenteDesde")
  WHERE "deletedAt" IS NULL;

-- 2. Vínculos parte↔parte o parte↔permiso. Refs. sin FK (ADR-426).
CREATE TABLE IF NOT EXISTS "ForestParteVinculo" (
  "id"               TEXT          NOT NULL,
  "tenantId"         TEXT          NOT NULL,
  "parteId"          TEXT          NOT NULL,
  "relacion"         TEXT          NOT NULL,
  "vinculadaParteId" TEXT,
  "contratoId"       TEXT,
  "desde"            DATE,
  "hasta"            DATE,
  "notas"            TEXT,
  "createdBy"        TEXT          NOT NULL,
  "createdAt"        TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt"        TIMESTAMP(3),
  CONSTRAINT "ForestParteVinculo_pkey" PRIMARY KEY ("id"),
  -- Con UNA parte o con UN permiso: nunca los dos, nunca ninguno.
  CONSTRAINT "ForestParteVinculo_uno_de_dos_chk"
    CHECK (("vinculadaParteId" IS NULL) <> ("contratoId" IS NULL)),
  -- Una parte no se vincula consigo misma.
  CONSTRAINT "ForestParteVinculo_no_consigo_chk"
    CHECK ("vinculadaParteId" IS NULL OR "vinculadaParteId" <> "parteId"),
  CONSTRAINT "ForestParteVinculo_fechas_chk"
    CHECK ("desde" IS NULL OR "hasta" IS NULL OR "hasta" >= "desde")
);

CREATE INDEX IF NOT EXISTS "ForestParteVinculo_tenantId_parteId_idx"
  ON "ForestParteVinculo" ("tenantId", "parteId");
CREATE INDEX IF NOT EXISTS "ForestParteVinculo_tenantId_vinculadaParteId_idx"
  ON "ForestParteVinculo" ("tenantId", "vinculadaParteId");
CREATE INDEX IF NOT EXISTS "ForestParteVinculo_tenantId_contratoId_idx"
  ON "ForestParteVinculo" ("tenantId", "contratoId");
CREATE INDEX IF NOT EXISTS "ForestParteVinculo_deletedAt_idx"
  ON "ForestParteVinculo" ("deletedAt");

-- El mismo vínculo vivo no se anota dos veces (dos toques en «vincular»).
-- COALESCE porque los NULL serían distintos entre sí y el índice no frenaría nada.
CREATE UNIQUE INDEX IF NOT EXISTS "ForestParteVinculo_vivo_key"
  ON "ForestParteVinculo" ("tenantId", "parteId", "relacion", COALESCE("vinculadaParteId", ''), COALESCE("contratoId", ''))
  WHERE "deletedAt" IS NULL;
