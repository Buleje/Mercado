-- ADR-326 — Consumir la TROZA, no sólo el volumen de la guía.
--
-- El consumo del libro es `ForestCtpConsumo` (ingreso → corrida, en m³) y así
-- se queda: sobre él viven las invariantes I1-I6, el costeo y los cuadros. Lo
-- que faltaba es decir QUÉ PIEZAS entraron a la sierra.
--
-- Se resuelve con una referencia en la propia troza —no con una tabla puente—
-- porque la relación es 1:N real: una troza entra a UNA corrida y se acabó. Con
-- tabla puente habría que impedir por constraint que la misma pieza aparezca en
-- dos corridas, que es exactamente lo que este diseño hace imposible.
--
--   consumidaEnId — la corrida (ForestCtpEntry) que se la comió. NULL = en patio.
--   fechaConsumo  — cuándo entró a la sierra.
--
-- Idempotente.
BEGIN;

ALTER TABLE "WoodEntryTroza" ADD COLUMN IF NOT EXISTS "consumidaEnId" TEXT;
ALTER TABLE "WoodEntryTroza" ADD COLUMN IF NOT EXISTS "fechaConsumo" TIMESTAMP(3);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'WoodEntryTroza_consumidaEnId_fkey'
  ) THEN
    ALTER TABLE "WoodEntryTroza"
      ADD CONSTRAINT "WoodEntryTroza_consumidaEnId_fkey"
      FOREIGN KEY ("consumidaEnId") REFERENCES "ForestCtpEntry"("id") ON DELETE SET NULL;
  END IF;
END $$;

-- "Qué trozas se comió esta corrida" es la consulta de la pantalla y del
-- certificado; sin índice es un seq scan sobre toda la tabla de trozas.
CREATE INDEX IF NOT EXISTS "WoodEntryTroza_tenantId_consumidaEnId_idx"
  ON "WoodEntryTroza" ("tenantId", "consumidaEnId");

COMMIT;
