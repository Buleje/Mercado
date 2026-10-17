-- ADR-311 (corrección del mismo día) — el casillero (10) de la Sección 1 del
-- LO-CTP NO es "el código de otro CTP" sino el código que ESTE centro asigna al
-- producto que ingresa y marca físicamente sobre la madera para no perderle el
-- rastro. La cita literal de la guía está en el ADR.
--
-- La columna se creó hoy y no tiene datos productivos, así que se renombra en vez
-- de dejar un nombre que miente sobre lo que guarda.
--
-- Idempotente. Aplicar vía scripts/apply-sql.mjs; luego `prisma generate` +
-- REINICIAR el dev server.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'WoodEntry' AND column_name = 'originCtpCode'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'WoodEntry' AND column_name = 'ctpProductCode'
  ) THEN
    ALTER TABLE "WoodEntry" RENAME COLUMN "originCtpCode" TO "ctpProductCode";
  END IF;
END $$;

ALTER TABLE "WoodEntry" ADD COLUMN IF NOT EXISTS "ctpProductCode" TEXT;
