-- Libro TH · la guía de transporte completa desde la sección Despacho (28-09).
--
-- gtfDatos: el cuerpo de la GTF con los casilleros del formato SERFOR —
-- propietario, destinatario, transportista, título habilitante, traslado— con
-- el MISMO esquema que ya usa la guía de salida del CTP (`ForestCtpEntry.gtfDatos`,
-- `lib/forestal/ctp-gtf-datos.ts`). Hasta hoy la guía del bosque guardaba sólo
-- 12 textos sueltos (transportista, placa, destino…) y el papel salía con los
-- bloques del propietario y del destinatario en blanco.
--
-- Expand puro: una columna aditiva nula, sin backfill. null = guía anotada con
-- el formulario corto de antes; ninguna guía existente cambia de significado.
ALTER TABLE "ForestGtf"
  ADD COLUMN IF NOT EXISTS "gtfDatos" JSONB;
