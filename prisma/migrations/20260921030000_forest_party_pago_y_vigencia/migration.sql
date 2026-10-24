-- ADR-424 · La ficha del Directorio suma cómo se le paga, cómo se le ubica y
-- hasta cuándo puede vender.
--
-- Expand puro: ocho columnas aditivas y nullables. NULL = «no se cargó».
ALTER TABLE "ForestParty"
  ADD COLUMN IF NOT EXISTS "banco" TEXT,
  ADD COLUMN IF NOT EXISTS "cuentaNumero" TEXT,
  ADD COLUMN IF NOT EXISTS "cuentaCci" TEXT,
  ADD COLUMN IF NOT EXISTS "cuentaTitular" TEXT,
  ADD COLUMN IF NOT EXISTS "whatsapp" TEXT,
  ADD COLUMN IF NOT EXISTS "contactoNombre" TEXT,
  ADD COLUMN IF NOT EXISTS "contactoTelefono" TEXT,
  ADD COLUMN IF NOT EXISTS "tituloVigenciaHasta" TIMESTAMP(3);
