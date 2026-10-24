-- ADR-423 · El regente forestal en el plan de manejo.
--
-- «Profesional responsable de la elaboración e implementación del Plan de
--  Manejo», inscrito en el Registro Nacional de Regentes que conduce SERFOR
--  (Directiva RJ N° 001-2018-OSINFOR). Suscribe el informe de ejecución junto
--  al titular, dentro de los 45 días de culminado el año operativo.
--
-- Expand puro: cuatro columnas aditivas y nullables. NULL = «no se cargó»,
-- que es distinto de «no tiene regente».
ALTER TABLE "ForestPlan"
  ADD COLUMN IF NOT EXISTS "regenteName" TEXT,
  ADD COLUMN IF NOT EXISTS "regenteRegistro" TEXT,
  ADD COLUMN IF NOT EXISTS "regenteEspecialidad" TEXT,
  ADD COLUMN IF NOT EXISTS "representanteLegal" TEXT;
