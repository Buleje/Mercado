-- ADR-325 — Recepción física de las trozas de la guía.
--
-- La GTF declara N trozas; en el patio llegan M. Hasta ahora el libro sólo
-- guardaba lo que declara el documento, así que una troza que nunca llegó
-- figuraba como existencia. Se agregan tres datos por troza:
--
--   parcela        — la parcela de corta del POA. Es lo que OSINFOR cruza pieza
--                    por pieza contra el plan del título habilitante.
--   codigoPlanta   — el código que ESTE centro marca físicamente sobre la troza.
--                    El `ctpProductCode` del ingreso es del lote/carga; acá se
--                    identifica la pieza individual.
--   noRecepcionada — declarada en la guía pero no llegó. NO se borra la fila: el
--                    documento dice que existe y esconderla sería alterar el acta.
--   recepcionObs   — por qué no llegó / qué se observó al recibirla.
--
-- Idempotente: se puede correr dos veces sin romper nada.
BEGIN;

ALTER TABLE "WoodEntryTroza" ADD COLUMN IF NOT EXISTS "parcela" TEXT;
ALTER TABLE "WoodEntryTroza" ADD COLUMN IF NOT EXISTS "codigoPlanta" TEXT;
ALTER TABLE "WoodEntryTroza" ADD COLUMN IF NOT EXISTS "noRecepcionada" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "WoodEntryTroza" ADD COLUMN IF NOT EXISTS "recepcionObs" TEXT;

-- El código de planta se busca igual que la codificación (un operario lee el
-- número marcado en la testa y pregunta de qué guía salió).
CREATE INDEX IF NOT EXISTS "WoodEntryTroza_tenantId_codigoPlanta_idx"
  ON "WoodEntryTroza" ("tenantId", "codigoPlanta");

COMMIT;
