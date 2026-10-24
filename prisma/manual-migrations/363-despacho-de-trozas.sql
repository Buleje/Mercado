-- ADR-363 · La troza que sale como entró: salida de materia prima SIN aserrar.
-- Idempotente: se puede correr las veces que haga falta.
--
-- Espejo exacto de `consumidaEnId` (ADR-326): una pieza sale en UN despacho, así
-- que es una referencia y no una tabla puente — con puente habría que prohibir
-- por constraint que la misma troza aparezca dos veces; así es imposible.

-- El despacho que se llevó ESTA pieza entera. NULL = sigue en el patio.
ALTER TABLE "WoodEntryTroza" ADD COLUMN IF NOT EXISTS "despachadaEnId" TEXT;

-- Cuándo salió. Es una operación del patio, no del documento: una guía se
-- registra el lunes y el camión carga el martes.
ALTER TABLE "WoodEntryTroza" ADD COLUMN IF NOT EXISTS "fechaDespacho" TIMESTAMP(3);

-- Por acá pregunta el saldo del patio ("¿qué piezas siguen acá?") y el detalle
-- de un despacho ("¿cuáles se llevó?").
CREATE INDEX IF NOT EXISTS "WoodEntryTroza_tenantId_despachadaEnId_idx"
  ON "WoodEntryTroza"("tenantId", "despachadaEnId");

-- SET NULL y no cascada: borrar la línea del despacho NO puede borrar la pieza
-- —la madera existe aunque el asiento se deshaga—, y devolverla al patio es
-- exactamente lo que corresponde cuando el despacho se anula.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'WoodEntryTroza_despachadaEnId_fkey'
  ) THEN
    ALTER TABLE "WoodEntryTroza"
      ADD CONSTRAINT "WoodEntryTroza_despachadaEnId_fkey"
      FOREIGN KEY ("despachadaEnId") REFERENCES "ForestCtpEntry"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
    RAISE NOTICE 'FK despachadaEnId creada.';
  ELSE
    RAISE NOTICE 'FK despachadaEnId ya existía.';
  END IF;
END $$;
