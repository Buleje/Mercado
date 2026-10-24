-- ADR-448 · Adelantos en las dos direcciones.
--
-- El adelanto sólo sabía «el negocio da la plata». Brandon pidió registrar
-- también la que RECIBE: un adelanto por un servicio que el negocio dará
-- (WASACO paga el aserrío antes) o un préstamo que le hacen. En Blas había
-- S/ 3 031 de pagos por aserrío guardados como entregados, sin ingreso en caja.
--
-- Expand puro: dos tipos, dos columnas, un CHECK y un índice. El default
-- constante no reescribe la tabla (53 filas en 4 negocios, medido 28-09) y
-- todas quedan DADO, que es lo que eran. No hay backfill ni paso de contract.
--
-- Sin bloques DO: scripts/aplicar-migracion-sesion.mjs parte por punto y coma
-- y salta los «already exists» (tipos y CHECK), así el archivo se re-corre.
CREATE TYPE "AdelantoDireccion" AS ENUM ('DADO', 'RECIBIDO');
CREATE TYPE "AdelantoConceptoRecibido" AS ENUM ('SERVICIO', 'PRESTAMO');
ALTER TABLE "Adelanto" ADD COLUMN IF NOT EXISTS "direccion" "AdelantoDireccion" NOT NULL DEFAULT 'DADO';
ALTER TABLE "Adelanto" ADD COLUMN IF NOT EXISTS "conceptoRecibido" "AdelantoConceptoRecibido";
-- La misma regla que problemaDeDireccion (lib/adelantos/direccion.ts) y el
-- superRefine del POST: DADO sin concepto; RECIBIDO con concepto y nunca por
-- descuento de planilla (eso es un adelanto de sueldo, siempre dado).
ALTER TABLE "Adelanto" ADD CONSTRAINT "Adelanto_direccion_chk" CHECK (("direccion" = 'DADO' AND "conceptoRecibido" IS NULL) OR ("direccion" = 'RECIBIDO' AND "conceptoRecibido" IS NOT NULL AND "modalidad" <> 'DESCUENTO_PLANILLA'));
CREATE INDEX IF NOT EXISTS "Adelanto_tenantId_direccion_status_idx" ON "Adelanto"("tenantId", "direccion", "status");
