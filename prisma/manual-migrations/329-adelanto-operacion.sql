-- 329 · Adelantos: código de operación, recibo manual y modalidad de planilla
--
-- Idempotente a propósito: se corre por el POOLER (el DNS directo de Supabase no
-- resuelve en todas las redes) y puede repetirse sin romper nada.

-- ── 1. Código de operación ───────────────────────────────────────────────────
-- El identificador que se dice por teléfono y se escribe en el papel: «ADL-2026-0007».
-- El `id` es un cuid de 25 caracteres — sirve para la máquina, no para una persona
-- que tiene que buscarlo o dictarlo.
ALTER TABLE "Adelanto" ADD COLUMN IF NOT EXISTS "codigoOperacion" TEXT;

-- Único POR TENANT, no global: cada negocio lleva su propia numeración y dos
-- bodegas distintas pueden tener su ADL-2026-0001 sin pisarse.
-- Parcial (WHERE NOT NULL) para que los adelantos viejos, que no tienen código,
-- no choquen entre sí.
CREATE UNIQUE INDEX IF NOT EXISTS "Adelanto_tenantId_codigoOperacion_key"
  ON "Adelanto" ("tenantId", "codigoOperacion")
  WHERE "codigoOperacion" IS NOT NULL;

-- ── 2. Recibo manual ─────────────────────────────────────────────────────────
-- El número del talonario de papel que se le entrega a la persona. Es el puente
-- entre el sistema y lo que quedó firmado sobre el mostrador.
ALTER TABLE "Adelanto" ADD COLUMN IF NOT EXISTS "reciboManual" TEXT;

-- Se busca por él tanto como por el código propio, y sin índice el LIKE sobre
-- toda la tabla se nota apenas hay historia.
CREATE INDEX IF NOT EXISTS "Adelanto_tenantId_reciboManual_idx"
  ON "Adelanto" ("tenantId", "reciboManual")
  WHERE "reciboManual" IS NOT NULL;

-- ── 3. Modalidad: descuento por planilla ─────────────────────────────────────
-- El adelanto de sueldo, que en Perú es de los más comunes y hasta ahora había
-- que forzarlo como «cuenta corriente». La mecánica de liquidación es la misma
-- (entregas que consumen el saldo); lo que cambia es de dónde sale la entrega:
-- del pago del mes, no de un producto.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'AdelantoModalidad' AND e.enumlabel = 'DESCUENTO_PLANILLA'
  ) THEN
    ALTER TYPE "AdelantoModalidad" ADD VALUE 'DESCUENTO_PLANILLA';
  END IF;
END $$;
