-- ADR-373 · La libreta recuerda el sector del destinatario y el remolque del
-- camión, para que «Rellenar datos de la guía» pueda completar esos dos
-- casilleros del formato en vez de dejarlos en blanco. Idempotente.

-- Zona / sector / caserío del formato oficial. La libreta ya guardaba
-- dirección, región, provincia y distrito; faltaba justo el casillero que en la
-- selva identifica el punto de llegada cuando la dirección no tiene numeración
-- —y que los puestos de control cotejan—.
ALTER TABLE "ForestParty" ADD COLUMN IF NOT EXISTS "zona" TEXT;

-- Placa del remolque. Va aparte de `placa` porque son dos unidades: el tracto
-- y el acoplado tienen chapa propia, y la guía declara las dos. Sin esto, un
-- camión que SIEMPRE lleva el mismo remolque obligaba a re-tipearlo en cada
-- guía.
ALTER TABLE "ForestVehiculo" ADD COLUMN IF NOT EXISTS "placaRemolque" TEXT;
