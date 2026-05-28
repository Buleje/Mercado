-- ADR-124 — Schema migration manual para módulo Forestal CTP
--
-- Aplicar via Supabase MCP o psql con DIRECT_URL (NO usar pgBouncer pooler).
-- Esta migración es IDEMPOTENTE — chequea existencia antes de crear.
--
-- Después de aplicar, registrar en _prisma_migrations:
--   INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, started_at, applied_steps_count)
--   VALUES (gen_random_uuid()::text, 'manual-2026-05-28-wood-entries', NOW(), '20260528_wood_entries_ctp', NOW(), 1);

-- ─── ENUMs ───────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "WoodEntryStatus" AS ENUM ('pendiente', 'validado', 'rechazado', 'procesado', 'anulado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "WoodOriginType" AS ENUM ('concesion', 'predio_privado', 'comunidad_nativa', 'reforestacion', 'retroaserradero', 'otro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "WoodProductType" AS ENUM ('rolliza', 'aserrada', 'tablones', 'listones', 'durmientes', 'pulgada', 'carbon', 'lena', 'otro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "DocumentType" AS ENUM ('RUC', 'DNI', 'CE', 'PASAPORTE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── TABLE WoodEntry ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "WoodEntry" (
  "id"                    TEXT PRIMARY KEY,
  "tenantId"              TEXT NOT NULL,

  -- Fecha + GTF
  "entryDate"             TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  "gtfNumber"             TEXT NOT NULL,
  "gtfDate"               TIMESTAMP(3),
  "gtfSeries"             TEXT,

  -- Proveedor / Titular Habilitante
  "providerName"          TEXT NOT NULL,
  "providerDocument"      TEXT,
  "providerDocumentType"  "DocumentType",

  -- Origen
  "originType"            "WoodOriginType" NOT NULL DEFAULT 'otro',
  "originCode"            TEXT,
  "originRegion"          TEXT,
  "originDistrict"        TEXT,

  -- Especie
  "speciesCommonName"     TEXT NOT NULL,
  "speciesScientificName" TEXT,
  "speciesCites"          BOOLEAN NOT NULL DEFAULT false,

  -- Producto
  "productType"           "WoodProductType" NOT NULL DEFAULT 'rolliza',
  "volumeM3"              DECIMAL(12,4) NOT NULL,
  "pieces"                INTEGER NOT NULL DEFAULT 0,
  "avgLengthM"            DECIMAL(8,2),
  "avgDiameterCm"         DECIMAL(8,2),
  "humidityPct"           DECIMAL(5,2),
  "defectsNotes"          TEXT,

  -- Trazabilidad
  "notes"                 TEXT,
  "photos"                JSONB,
  "status"                "WoodEntryStatus" NOT NULL DEFAULT 'pendiente',
  "validatedBy"           TEXT,
  "validatedAt"           TIMESTAMP(3),
  "rejectionReason"       TEXT,

  -- Auditoría
  "createdBy"             TEXT NOT NULL,
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  "updatedAt"             TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  "deletedAt"             TIMESTAMP(3)
);

-- ─── Indexes (multi-tenant + filtros frecuentes) ─────────────────────────

CREATE INDEX IF NOT EXISTS "WoodEntry_tenantId_entryDate_idx"
  ON "WoodEntry"("tenantId", "entryDate" DESC);

CREATE INDEX IF NOT EXISTS "WoodEntry_tenantId_status_idx"
  ON "WoodEntry"("tenantId", "status");

CREATE INDEX IF NOT EXISTS "WoodEntry_tenantId_gtfNumber_idx"
  ON "WoodEntry"("tenantId", "gtfNumber");

CREATE INDEX IF NOT EXISTS "WoodEntry_tenantId_speciesCommonName_idx"
  ON "WoodEntry"("tenantId", "speciesCommonName");

CREATE INDEX IF NOT EXISTS "WoodEntry_deletedAt_idx"
  ON "WoodEntry"("deletedAt");

-- ─── Trigger para updatedAt ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_woodentry_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updatedAt" = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_woodentry_updated_at ON "WoodEntry";
CREATE TRIGGER trigger_woodentry_updated_at
  BEFORE UPDATE ON "WoodEntry"
  FOR EACH ROW
  EXECUTE FUNCTION set_woodentry_updated_at();

-- ─── Verificación ────────────────────────────────────────────────────────

DO $$
DECLARE
  table_exists BOOLEAN;
  enum_count INTEGER;
BEGIN
  SELECT EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_name = 'WoodEntry'
  ) INTO table_exists;

  SELECT COUNT(*) INTO enum_count
  FROM pg_type
  WHERE typname IN ('WoodEntryStatus', 'WoodOriginType', 'WoodProductType', 'DocumentType');

  RAISE NOTICE 'WoodEntry table exists: %', table_exists;
  RAISE NOTICE 'Forestry enums created: % / 4', enum_count;
END $$;
