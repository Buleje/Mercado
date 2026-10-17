-- ADR-448 (segunda revisión) · Idempotencia de las entregas y del cuerpo.
--
-- 1. Un corte de red + reintento en «Me pagan lo que me deben» (entrega LIBRE
--    con caja) o en la devolución en plata de un recibido anotaba DOS entregas
--    y movía la caja DOS veces. La pantalla manda una clave por intento; el
--    índice único deja entrar una sola entrega por clave en cada adelanto (el
--    adelanto es de un solo negocio: la clave queda aislada por tenant).
-- 2. La huella del cuerpo (persona, monto, moneda, dirección, concepto, caja en
--    el alta; tipo, valor, producto, cantidad, caja en la entrega): la misma
--    clave con OTRO cuerpo no puede devolver el primero como si nada (422).
--
-- Expand puro: columnas nulas sin backfill. NULL no choca en un único.
ALTER TABLE "Adelanto" ADD COLUMN IF NOT EXISTS "idempotencyHuella" TEXT;
ALTER TABLE "AdelantoEntrega" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;
ALTER TABLE "AdelantoEntrega" ADD COLUMN IF NOT EXISTS "idempotencyHuella" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "AdelantoEntrega_adelantoId_idempotencyKey_key" ON "AdelantoEntrega"("adelantoId", "idempotencyKey");
