-- ADR-327 — El lote tiene una ventana de trabajo y un dueño.
--
-- Del ERP forestal de referencia (`lotes`), donde el lote lleva fecha de inicio
-- y de fin y su estado se LEE de ahí: programado · en proceso · finalizado.
--
--   fechaInicio / fechaFin — la ventana en que la planta trabaja ese lote. Es
--     distinto del `status` comercial (abierto/cerrado/despachado): un lote
--     puede estar comercialmente abierto y operativamente terminado.
--
--   titularId / titularNombre — de QUIÉN es la madera. En un aserradero que
--     presta servicio de maquila el lote no es del centro: es del cliente que
--     trajo la troza, y el certificado tiene que decirlo. El nombre se guarda
--     además del id porque es acta: si mañana se corrige la ficha del
--     directorio, lo que se certificó no cambia.
--
-- Idempotente.
BEGIN;

ALTER TABLE "ForestProdLote" ADD COLUMN IF NOT EXISTS "fechaInicio" TIMESTAMP(3);
ALTER TABLE "ForestProdLote" ADD COLUMN IF NOT EXISTS "fechaFin" TIMESTAMP(3);
ALTER TABLE "ForestProdLote" ADD COLUMN IF NOT EXISTS "titularId" TEXT;
ALTER TABLE "ForestProdLote" ADD COLUMN IF NOT EXISTS "titularNombre" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ForestProdLote_titularId_fkey') THEN
    ALTER TABLE "ForestProdLote"
      ADD CONSTRAINT "ForestProdLote_titularId_fkey"
      FOREIGN KEY ("titularId") REFERENCES "ForestParty"("id") ON DELETE SET NULL;
  END IF;
END $$;

-- "Qué lotes son de este cliente" es la consulta de un aserradero de maquila.
CREATE INDEX IF NOT EXISTS "ForestProdLote_tenantId_titularId_idx"
  ON "ForestProdLote" ("tenantId", "titularId");

COMMIT;
