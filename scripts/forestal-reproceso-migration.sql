-- ADR-316 — Reproceso: un producto terminado que vuelve a la sierra.
-- Idempotente. Después: `npx prisma generate` + REINICIAR el dev server.

CREATE TABLE IF NOT EXISTS "ForestCtpReproceso" (
  "id"             TEXT NOT NULL,
  "tenantId"       TEXT NOT NULL,
  "origenEntryId"  TEXT NOT NULL,
  "destinoEntryId" TEXT NOT NULL,
  "quantity"       DECIMAL(14,4) NOT NULL,
  "createdBy"      TEXT NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ForestCtpReproceso_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ForestCtpEntry" ADD COLUMN IF NOT EXISTS "codigoRaiz" TEXT;

DO $$
BEGIN
  -- RESTRICT en el origen: no se borra una corrida que ya alimentó un reproceso
  -- sin deshacer antes el reproceso. Su producto ya se transformó.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ForestCtpReproceso_origenEntryId_fkey') THEN
    ALTER TABLE "ForestCtpReproceso"
      ADD CONSTRAINT "ForestCtpReproceso_origenEntryId_fkey"
      FOREIGN KEY ("origenEntryId") REFERENCES "ForestCtpEntry"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  -- CASCADE en el destino: si se borra la corrida resultante, sus atribuciones
  -- se van con ella y el origen recupera su saldo.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ForestCtpReproceso_destinoEntryId_fkey') THEN
    ALTER TABLE "ForestCtpReproceso"
      ADD CONSTRAINT "ForestCtpReproceso_destinoEntryId_fkey"
      FOREIGN KEY ("destinoEntryId") REFERENCES "ForestCtpEntry"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Una corrida una sola vez por reproceso: se suma, no se duplica.
CREATE UNIQUE INDEX IF NOT EXISTS "ForestCtpReproceso_destinoEntryId_origenEntryId_key"
  ON "ForestCtpReproceso" ("destinoEntryId", "origenEntryId");
CREATE INDEX IF NOT EXISTS "ForestCtpReproceso_destinoEntryId_idx"
  ON "ForestCtpReproceso" ("destinoEntryId");
CREATE INDEX IF NOT EXISTS "ForestCtpReproceso_tenantId_origenEntryId_idx"
  ON "ForestCtpReproceso" ("tenantId", "origenEntryId");
