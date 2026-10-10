-- LO-TH · censo forestal: la hoja del regente trae «Nombre en idioma nativo» y
-- «condición» (Aprovechable, Semillero…), y el censo no tenía dónde guardarlos.
-- Al importar, «Nombre en idioma nativo» caía en la especie: la Copaiba entraba
-- como «Coubé» (medido 28-09 con la hoja de Brandon).
--
-- Expand puro: dos columnas aditivas nulas, sin backfill. null = «la hoja no
-- lo trajo», ningún árbol existente cambia de significado.
ALTER TABLE "ForestCensusTree"
  ADD COLUMN IF NOT EXISTS "speciesNative" TEXT,
  ADD COLUMN IF NOT EXISTS "condicion" TEXT;
