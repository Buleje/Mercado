-- ADR-314 — "Forma de presentación" del formato LO-CTP, en ingreso y en salida.
-- Idempotente. Después: `npx prisma generate` + REINICIAR el dev server.

ALTER TABLE "WoodEntry"      ADD COLUMN IF NOT EXISTS "presentacion" TEXT;
ALTER TABLE "ForestCtpEntry" ADD COLUMN IF NOT EXISTS "presentacion" TEXT;

-- Backfill de los ingresos que YA vinieron de SERFOR: la ficha guardada declara
-- la presentación en su detalle de productos. No se inventa nada donde no está.
UPDATE "WoodEntry"
SET "presentacion" = upper(trim(("serforGtf" -> 'productos' -> 0 ->> 'presentacion')))
WHERE "presentacion" IS NULL
  AND "serforGtf" IS NOT NULL
  AND nullif(trim(("serforGtf" -> 'productos' -> 0 ->> 'presentacion')), '') IS NOT NULL;
