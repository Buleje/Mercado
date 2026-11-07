-- ADR-312 — La troza de la GTF como pieza trazable del CTP.
--
-- Idempotente: se puede correr N veces (el pooler de Supabase no deja usar
-- `prisma migrate`, así que la migración se aplica con `scripts/apply-sql.mjs`).
--
-- Después: `npx prisma generate` + REINICIAR el dev server, si no el cliente
-- viejo sigue en memoria y la tabla "no existe" para la app.

CREATE TABLE IF NOT EXISTS "WoodEntryTroza" (
  "id"                TEXT NOT NULL,
  "tenantId"          TEXT NOT NULL,
  "woodEntryId"       TEXT NOT NULL,
  "orden"             INTEGER NOT NULL DEFAULT 0,
  "codificacion"      TEXT,
  "especieComun"      TEXT,
  "especieCientifica" TEXT,
  "dimensiones"       TEXT,
  "largoM"            DECIMAL(8,3),
  "diametroCm"        DECIMAL(8,2),
  "cantidad"          INTEGER,
  "volumenM3"         DECIMAL(12,4),
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WoodEntryTroza_pkey" PRIMARY KEY ("id")
);

-- Cascade: si el ingreso se borra, sus trozas se van con él. No tiene sentido
-- una pieza huérfana de la guía que la amparaba.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'WoodEntryTroza_woodEntryId_fkey'
  ) THEN
    ALTER TABLE "WoodEntryTroza"
      ADD CONSTRAINT "WoodEntryTroza_woodEntryId_fkey"
      FOREIGN KEY ("woodEntryId") REFERENCES "WoodEntry"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "WoodEntryTroza_tenantId_woodEntryId_idx"
  ON "WoodEntryTroza" ("tenantId", "woodEntryId");

-- El índice que hace útil la tabla: buscar una troza por su codificación y
-- llegar a la GTF con la que entró.
CREATE INDEX IF NOT EXISTS "WoodEntryTroza_tenantId_codificacion_idx"
  ON "WoodEntryTroza" ("tenantId", "codificacion");
