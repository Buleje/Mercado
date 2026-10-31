-- ADR-450 · Recibir contando las trozas y la troza recuerda su árbol.
--
-- L1: lo que se midió en planta al recibir una troza que llegó DISTINTA a la
-- guía. Las medidas de la guía (d1Cm, d2Cm, largoM, volumenM3) no se tocan:
-- esto va aparte y el m³ lo calcula el servidor con smalianVolume.
-- L4: la línea de Trozado del Libro TH de la troza (sin FK, como planId en el
-- Libro TH) y una copia del código del árbol para el acta y para buscar.
--
-- Expand puro, sin rellenar datos viejos: Blas tiene 0 guías del TH y en main
-- los 4 ingresos que vinieron del TH están anulados.
ALTER TABLE "WoodEntryTroza"
  ADD COLUMN IF NOT EXISTS "lothTrozadoId" TEXT,
  ADD COLUMN IF NOT EXISTS "arbolCodigo" TEXT,
  ADD COLUMN IF NOT EXISTS "recibidaD1Cm" DECIMAL(8,2),
  ADD COLUMN IF NOT EXISTS "recibidaD2Cm" DECIMAL(8,2),
  ADD COLUMN IF NOT EXISTS "recibidaLargoM" DECIMAL(8,3),
  ADD COLUMN IF NOT EXISTS "recibidaVolumenM3" DECIMAL(12,4);
CREATE INDEX IF NOT EXISTS "WoodEntryTroza_tenantId_lothTrozadoId_idx" ON "WoodEntryTroza" ("tenantId","lothTrozadoId");
CREATE INDEX IF NOT EXISTS "WoodEntryTroza_tenantId_arbolCodigo_idx" ON "WoodEntryTroza" ("tenantId","arbolCodigo");
