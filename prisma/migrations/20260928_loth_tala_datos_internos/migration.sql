-- LO-TH · tala: datos INTERNOS que no salen en el formato SERFOR (RDE 264-2019).
--
-- gpsOrigen: la tala hereda sola la coordenada del árbol censado. Medido 28-09
-- en Blas: las 2 talas registradas tenían el GPS a 0,01 m de la coordenada del
-- censo — o sea, copiado, no tomado en el tocón. Sin el origen, el libro no
-- distingue una cosa de la otra.
--
-- motosierrista / motosierristaId / horaTala: quién tumbó el árbol (persona de
-- Recursos Humanos o nombre tipeado) y a qué hora; entryDate es sólo fecha.
--
-- Expand puro: cuatro columnas aditivas nulas, sin backfill. null = «no
-- consta»; ninguna línea existente cambia de significado.
ALTER TABLE "ForestLothEntry"
  ADD COLUMN IF NOT EXISTS "gpsOrigen" TEXT,
  ADD COLUMN IF NOT EXISTS "motosierrista" TEXT,
  ADD COLUMN IF NOT EXISTS "motosierristaId" TEXT,
  ADD COLUMN IF NOT EXISTS "horaTala" TEXT;
