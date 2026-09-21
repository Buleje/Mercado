-- ADR-424 · ronda 3: condiciones comerciales, segundo contacto, punto de acopio
-- y bitácora de la ficha del Directorio.
--
-- Expand puro: nueve columnas aditivas y nullables. NULL = «no se cargó» — en
-- particular `condicionPago` NULL NO significa contado.
ALTER TABLE "ForestParty"
  ADD COLUMN IF NOT EXISTS "contacto2Nombre" TEXT,
  ADD COLUMN IF NOT EXISTS "contacto2Telefono" TEXT,
  ADD COLUMN IF NOT EXISTS "emailCobranza" TEXT,
  ADD COLUMN IF NOT EXISTS "condicionPago" TEXT,
  ADD COLUMN IF NOT EXISTS "diasCredito" INTEGER,
  ADD COLUMN IF NOT EXISTS "acopioLat" DECIMAL(9,6),
  ADD COLUMN IF NOT EXISTS "acopioLng" DECIMAL(9,6),
  ADD COLUMN IF NOT EXISTS "acopioReferencia" TEXT,
  ADD COLUMN IF NOT EXISTS "bitacora" JSONB;
