-- LO-TH · Sección 1 (Tala), item 3 de la RDE 264-2019:
-- «Este código debe ser colocado físicamente en el fuste y el tocón con
--  materiales durables (placa metálica o plástica, pintura esmalte, etc.)».
--
-- Expand puro: dos columnas aditivas con DEFAULT, sin backfill y sin NOT NULL,
-- así ninguna línea existente cambia de significado. false = «no consta»,
-- no «no se marcó».
ALTER TABLE "ForestLothEntry"
  ADD COLUMN IF NOT EXISTS "marcadoFuste" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "marcadoTocon" BOOLEAN NOT NULL DEFAULT false;
