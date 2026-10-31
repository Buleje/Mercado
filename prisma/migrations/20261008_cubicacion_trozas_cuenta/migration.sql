-- Contrato K2 (08-10) · La cubicación de trozas se guarda con dueño y descuenta del adelanto.
-- (ADR del paso M2 · servidor.)
--
-- EXPAND puro: una tabla nueva y una columna NULLABLE sin default en
-- "AdelantoEntrega" (cambio de catálogo, no reescribe la tabla). El código viejo
-- no lee ninguna de las dos. Sin valor nuevo en el enum AdelantoEntregaTipo: la
-- marca de «entrega de madera» es "cubicacionId" (un valor de enum nuevo rompe
-- al cliente Prisma viejo que lee esas filas).
--
-- Idempotente: todo con IF NOT EXISTS. Los CHECK viven dentro del CREATE TABLE
-- (ADD CONSTRAINT no admite IF NOT EXISTS), así la 2.ª corrida no cambia nada.
-- Prisma no declara los CHECK: no aparecen en `migrate diff` ni los propone borrar.
--
-- Sin respaldo de datos que mover: hoy las cubicaciones de trozas viven en el
-- localStorage del navegador. Cifras de adelantos antes/después en
-- reports/respaldo-k2-2026-10-08.json (deben dar igual: es aditivo).
--
-- Ensayo (BEGIN … ROLLBACK, verifica tabla/columna/índices dentro de la tx):
--   node -r dotenv/config scripts/aplicar-migracion-sesion.mjs prisma/migrations/20261008_cubicacion_trozas_cuenta/migration.sql --ensayo dotenv_config_path=.env.local
-- Aplicar (2 veces: la 2.ª da «0 nuevas»):
--   node -r dotenv/config scripts/aplicar-migracion-sesion.mjs prisma/migrations/20261008_cubicacion_trozas_cuenta/migration.sql dotenv_config_path=.env.local
--   node scripts/prisma-session.mjs migrate resolve --applied 20261008_cubicacion_trozas_cuenta
--
-- Para revertir (contar primero qué se perdería):
--   SELECT count(*) FROM "ForestCubicacionTrozas";
--   SELECT count(*) FROM "AdelantoEntrega" WHERE "cubicacionId" IS NOT NULL;
--   DROP INDEX IF EXISTS "AdelantoEntrega_cubicacionId_idx";
--   ALTER TABLE "AdelantoEntrega" DROP COLUMN IF EXISTS "cubicacionId";
--   DROP TABLE IF EXISTS "ForestCubicacionTrozas";

CREATE TABLE IF NOT EXISTS "ForestCubicacionTrozas" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "codigo" TEXT NOT NULL,
  "fecha" DATE NOT NULL,
  "formula" TEXT NOT NULL,
  "diametros" INTEGER NOT NULL,
  "beneficiarioId" TEXT,
  "parteId" TEXT,
  "personaNombre" TEXT,
  "sentido" TEXT NOT NULL DEFAULT 'compra',
  "gtfNumber" TEXT,
  "contratoId" TEXT,
  "trozas" JSONB NOT NULL,
  "nTrozas" INTEGER NOT NULL,
  "volumen" DECIMAL(14,4) NOT NULL,
  "porEspecie" JSONB,
  "monto" DECIMAL(12,2),
  "moneda" TEXT NOT NULL DEFAULT 'PEN',
  "estado" TEXT NOT NULL DEFAULT 'borrador',
  "version" INTEGER NOT NULL DEFAULT 1,
  "aplicadaAt" TIMESTAMP(3),
  "aplicadaPor" TEXT,
  "imputacion" JSONB,
  "idempotencyKey" TEXT,
  "idempotencyHuella" TEXT,
  "anuladaAt" TIMESTAMP(3),
  "anuladaPor" TEXT,
  "motivoAnulacion" TEXT,
  "notas" TEXT,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "ForestCubicacionTrozas_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ForestCubicacionTrozas_estado_chk" CHECK ("estado" IN ('borrador', 'aplicada', 'anulada')),
  CONSTRAINT "ForestCubicacionTrozas_formula_chk" CHECK ("formula" IN ('smalian', 'oxapampina')),
  CONSTRAINT "ForestCubicacionTrozas_diametros_chk" CHECK ("diametros" IN (1, 2)),
  CONSTRAINT "ForestCubicacionTrozas_sentido_chk" CHECK ("sentido" IN ('compra', 'venta')),
  CONSTRAINT "ForestCubicacionTrozas_monto_chk" CHECK ("estado" <> 'aplicada' OR ("monto" IS NOT NULL AND "monto" > 0))
);

CREATE UNIQUE INDEX IF NOT EXISTS "ForestCubicacionTrozas_tenantId_codigo_key" ON "ForestCubicacionTrozas"("tenantId", "codigo");

CREATE UNIQUE INDEX IF NOT EXISTS "ForestCubicacionTrozas_tenantId_idempotencyKey_key" ON "ForestCubicacionTrozas"("tenantId", "idempotencyKey");

CREATE INDEX IF NOT EXISTS "ForestCubicacionTrozas_tenantId_beneficiarioId_fecha_idx" ON "ForestCubicacionTrozas"("tenantId", "beneficiarioId", "fecha" DESC);

CREATE INDEX IF NOT EXISTS "ForestCubicacionTrozas_tenantId_parteId_fecha_idx" ON "ForestCubicacionTrozas"("tenantId", "parteId", "fecha" DESC);

CREATE INDEX IF NOT EXISTS "ForestCubicacionTrozas_tenantId_estado_idx" ON "ForestCubicacionTrozas"("tenantId", "estado");

CREATE INDEX IF NOT EXISTS "ForestCubicacionTrozas_tenantId_gtfNumber_idx" ON "ForestCubicacionTrozas"("tenantId", "gtfNumber");

ALTER TABLE "AdelantoEntrega" ADD COLUMN IF NOT EXISTS "cubicacionId" TEXT;

CREATE INDEX IF NOT EXISTS "AdelantoEntrega_cubicacionId_idx" ON "AdelantoEntrega"("cubicacionId");
