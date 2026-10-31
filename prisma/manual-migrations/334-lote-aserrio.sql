-- ADR-334 · Lote de ASERRÍO: las trozas de una especie que van juntas a la sierra.
-- Idempotente: se puede correr dos veces.

CREATE TABLE IF NOT EXISTS "ForestLoteAserrio" (
  "id"                TEXT PRIMARY KEY,
  "tenantId"          TEXT NOT NULL,
  "code"              TEXT NOT NULL,
  "speciesCommon"     TEXT NOT NULL,
  "speciesScientific" TEXT,
  "status"            TEXT NOT NULL DEFAULT 'abierto',
  "notes"             TEXT,
  "fechaApertura"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "fechaConsumo"      TIMESTAMP(3),
  "produccionEntryId" TEXT,
  "createdBy"         TEXT NOT NULL,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt"         TIMESTAMP(3)
);

CREATE UNIQUE INDEX IF NOT EXISTS "ForestLoteAserrio_tenantId_code_key" ON "ForestLoteAserrio" ("tenantId", "code");
CREATE INDEX IF NOT EXISTS "ForestLoteAserrio_tenantId_status_idx" ON "ForestLoteAserrio" ("tenantId", "status");
CREATE INDEX IF NOT EXISTS "ForestLoteAserrio_tenantId_speciesCommon_idx" ON "ForestLoteAserrio" ("tenantId", "speciesCommon");

-- La pieza apunta a su lote. SET NULL: deshacer un lote no borra madera.
ALTER TABLE "WoodEntryTroza" ADD COLUMN IF NOT EXISTS "loteAserrioId" TEXT;
CREATE INDEX IF NOT EXISTS "WoodEntryTroza_tenantId_loteAserrioId_idx" ON "WoodEntryTroza" ("tenantId", "loteAserrioId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WoodEntryTroza_loteAserrioId_fkey') THEN
    ALTER TABLE "WoodEntryTroza"
      ADD CONSTRAINT "WoodEntryTroza_loteAserrioId_fkey"
      FOREIGN KEY ("loteAserrioId") REFERENCES "ForestLoteAserrio"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
