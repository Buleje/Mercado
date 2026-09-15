-- ADR-313 — Retrozado: cortar una troza en pedazos (Apartado 2 del LO-CTP).
-- Idempotente (se aplica con scripts/apply-sql.mjs; el pooler no admite migrate).
-- Después: `npx prisma generate` + REINICIAR el dev server.

ALTER TABLE "WoodEntryTroza" ADD COLUMN IF NOT EXISTS "trozaOrigenId"  TEXT;
ALTER TABLE "WoodEntryTroza" ADD COLUMN IF NOT EXISTS "fechaRetrozo"   TIMESTAMP(3);
ALTER TABLE "WoodEntryTroza" ADD COLUMN IF NOT EXISTS "descarte"       BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "WoodEntryTroza" ADD COLUMN IF NOT EXISTS "observaciones"  TEXT;

-- Auto-relación: si se borra la troza madre, sus pedazos se van con ella. Un
-- retrozo sin madre no se puede trazar hasta la guía, que es su única razón de existir.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WoodEntryTroza_trozaOrigenId_fkey') THEN
    ALTER TABLE "WoodEntryTroza"
      ADD CONSTRAINT "WoodEntryTroza_trozaOrigenId_fkey"
      FOREIGN KEY ("trozaOrigenId") REFERENCES "WoodEntryTroza"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "WoodEntryTroza_tenantId_trozaOrigenId_idx"
  ON "WoodEntryTroza" ("tenantId", "trozaOrigenId");
