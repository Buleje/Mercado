-- LO-TH · ADR-422: guardar de dónde salieron los números del formato.
--
-- El libro consigna el Ø promedio (items 6 y 7) y la longitud aprovechable
-- (item 8). Los dos son el resultado de una cuenta —dos medidas cruzadas por
-- sección; el total menos aletas, defectos y despunte— que hasta ahora se
-- perdía al guardar.
--
-- Expand puro: columna aditiva y nullable. Una línea vieja queda en NULL, que
-- es «no se registró cómo se midió», no un dato falso.
ALTER TABLE "ForestLothEntry"
  ADD COLUMN IF NOT EXISTS "medicionCruda" JSONB;
