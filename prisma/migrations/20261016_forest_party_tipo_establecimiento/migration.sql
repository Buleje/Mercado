-- ADR-493 · El tipo de establecimiento (casillero 19 de la guía 2024) se guarda en la ficha.
--
-- EXPAND puro: una columna NULLABLE sin default en "ForestParty" (cambio de
-- catálogo, no reescribe la tabla ni toma un lock largo). El código viejo no la
-- lee; el nuevo la trata como opcional. Sin backfill: medido el 16-10-2026, 0
-- fichas con papel «establecimiento» en todos los tenants (el papel nació el 15-10).
--
-- Idempotente: IF NOT EXISTS, la 2.ª corrida no cambia nada.
ALTER TABLE "ForestParty" ADD COLUMN IF NOT EXISTS "tipoEstablecimiento" TEXT NULL;
