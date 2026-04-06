-- ═══════════════════════════════════════════════════════
-- MIGRACIÓN PENDIENTE — Ejecutar en Supabase SQL Editor
-- Tablas: Prestamo, PrestamoCuota, PrestamoDocumento
-- Columnas: GuiaRemision (conductor, bultos, docRef, pesoBruto)
-- ═══════════════════════════════════════════════════════

-- ── 1. ENUMs de préstamos ─────────────────────────────
DO $$ BEGIN
  CREATE TYPE "PrestamoStatus" AS ENUM ('ACTIVO', 'PAGADO', 'VENCIDO', 'CANCELADO');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "PrestamoTipo" AS ENUM ('PERSONAL', 'BANCARIO', 'TERCERO', 'PROVEEDOR');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "PrestamoDireccion" AS ENUM ('DADO', 'RECIBIDO');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "PrestamoEntidadTipo" AS ENUM ('BANCO', 'PERSONA_NATURAL', 'EMPRESA', 'PROVEEDOR');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "PrestamoSistemaAmortizacion" AS ENUM ('FRANCES', 'ALEMAN', 'AMERICANO');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── 2. Tabla Prestamo ─────────────────────────────────
CREATE TABLE IF NOT EXISTS "Prestamo" (
    "id"                   TEXT NOT NULL,
    "tenantId"             TEXT NOT NULL,
    "customerId"           TEXT,
    "tipo"                 "PrestamoTipo" NOT NULL DEFAULT 'PERSONAL',
    "direccion"            "PrestamoDireccion" NOT NULL DEFAULT 'DADO',
    "entidadNombre"        TEXT,
    "entidadTipo"          "PrestamoEntidadTipo",
    "nroOperacion"         TEXT,
    "monto"                DECIMAL(12,2) NOT NULL,
    "moneda"               TEXT NOT NULL DEFAULT 'PEN',
    "tasaInteres"          DECIMAL(5,2) NOT NULL DEFAULT 0,
    "tea"                  DECIMAL(6,4),
    "moraInteres"          DECIMAL(5,2) NOT NULL DEFAULT 0,
    "numeroCuotas"         INTEGER NOT NULL DEFAULT 1,
    "sistemaAmortizacion"  "PrestamoSistemaAmortizacion" NOT NULL DEFAULT 'FRANCES',
    "periodoGracia"        INTEGER NOT NULL DEFAULT 0,
    "status"               "PrestamoStatus" NOT NULL DEFAULT 'ACTIVO',
    "fechaDesembolso"      TIMESTAMP(3),
    "fechaVencimiento"     TIMESTAMP(3),
    "garantia"             TEXT,
    "notas"                TEXT,
    "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Prestamo_pkey" PRIMARY KEY ("id")
);

-- ── 3. Tabla PrestamoCuota ────────────────────────────
CREATE TABLE IF NOT EXISTS "PrestamoCuota" (
    "id"            TEXT NOT NULL,
    "prestamoId"    TEXT NOT NULL,
    "numeroCuota"   INTEGER NOT NULL,
    "monto"         DECIMAL(12,2) NOT NULL,
    "capital"       DECIMAL(12,2) NOT NULL DEFAULT 0,
    "interes"       DECIMAL(12,2) NOT NULL DEFAULT 0,
    "fechaVence"    TIMESTAMP(3) NOT NULL,
    "pagadoEn"      TIMESTAMP(3),
    "montoPagado"   DECIMAL(12,2),
    "moraCalculada" DECIMAL(12,2) NOT NULL DEFAULT 0,

    CONSTRAINT "PrestamoCuota_pkey" PRIMARY KEY ("id")
);

-- ── 4. Tabla PrestamoDocumento ────────────────────────
CREATE TABLE IF NOT EXISTS "PrestamoDocumento" (
    "id"          TEXT NOT NULL,
    "prestamoId"  TEXT NOT NULL,
    "nombre"      TEXT NOT NULL,
    "tipo"        TEXT NOT NULL DEFAULT 'otro',
    "url"         TEXT NOT NULL,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrestamoDocumento_pkey" PRIMARY KEY ("id")
);

-- ── 5. Foreign keys ───────────────────────────────────
ALTER TABLE "Prestamo"
  ADD CONSTRAINT "Prestamo_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Prestamo"
  ADD CONSTRAINT "Prestamo_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Customer"("phone")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PrestamoCuota"
  ADD CONSTRAINT "PrestamoCuota_prestamoId_fkey"
    FOREIGN KEY ("prestamoId") REFERENCES "Prestamo"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PrestamoDocumento"
  ADD CONSTRAINT "PrestamoDocumento_prestamoId_fkey"
    FOREIGN KEY ("prestamoId") REFERENCES "Prestamo"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ── 6. Índices ────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "Prestamo_tenantId_status_idx"    ON "Prestamo"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "Prestamo_tenantId_tipo_idx"      ON "Prestamo"("tenantId", "tipo");
CREATE INDEX IF NOT EXISTS "Prestamo_tenantId_direccion_idx" ON "Prestamo"("tenantId", "direccion");
CREATE INDEX IF NOT EXISTS "Prestamo_customerId_idx"         ON "Prestamo"("customerId");
CREATE INDEX IF NOT EXISTS "PrestamoCuota_prestamoId_idx"    ON "PrestamoCuota"("prestamoId");
CREATE INDEX IF NOT EXISTS "PrestamoCuota_fechaVence_idx"    ON "PrestamoCuota"("fechaVence");
CREATE INDEX IF NOT EXISTS "PrestamoDocumento_prestamoId_idx" ON "PrestamoDocumento"("prestamoId");

-- ── 7. Columnas nuevas en GuiaRemision ────────────────
ALTER TABLE "GuiaRemision"
  ADD COLUMN IF NOT EXISTS "conductorNombre" TEXT,
  ADD COLUMN IF NOT EXISTS "conductorDni"    TEXT,
  ADD COLUMN IF NOT EXISTS "bultos"          INTEGER,
  ADD COLUMN IF NOT EXISTS "documentoRef"    TEXT,
  ADD COLUMN IF NOT EXISTS "pesoBruto"       DECIMAL(10,3);

-- ── 8. updatedAt trigger para Prestamo ───────────────
-- (Asegura que updatedAt se actualice automáticamente)
CREATE OR REPLACE FUNCTION update_prestamo_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updatedAt" = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_prestamo_updated_at ON "Prestamo";
CREATE TRIGGER update_prestamo_updated_at
  BEFORE UPDATE ON "Prestamo"
  FOR EACH ROW
  EXECUTE PROCEDURE update_prestamo_updated_at();
