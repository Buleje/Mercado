-- ADR-448 (revisión de seguridad) · Alta de adelanto idempotente.
--
-- Un doble clic en «Registrar» creaba DOS adelantos y movía la caja DOS veces.
-- La pantalla manda una clave por intento (como la liquidación de cuenta,
-- ADR-413) y la base es la red: el índice único deja entrar una sola fila por
-- clave dentro del negocio.
--
-- Expand puro: una columna nula sin backfill. NULL = alta sin clave (el
-- asistente IA, los recurrentes): en Postgres dos NULL no chocan en un único,
-- que es justo lo que se quiere acá.
ALTER TABLE "Adelanto" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Adelanto_tenantId_idempotencyKey_key" ON "Adelanto"("tenantId", "idempotencyKey");
