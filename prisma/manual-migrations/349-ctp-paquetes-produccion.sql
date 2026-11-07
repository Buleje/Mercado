-- ADR-349 · El PAQUETE de producto terminado.
--
-- El formato de producción del SNIFFS no declara "3.5 m³ de tablones": declara
-- paquetes, cada uno con su código, su producto, su presentación y —cuando se
-- dimensiona— espesor, ancho y largo. Ese código es el que viaja en la GTF de
-- salida y el que un fiscalizador busca en la pila.
--
-- La cantidad de la corrida (`ForestCtpEntry.quantity`) sigue siendo la única
-- que cuentan las invariantes: esto es su DETALLE. Idempotente.

CREATE TABLE IF NOT EXISTS "ForestCtpPaquete" (
  "id"           TEXT NOT NULL,
  "tenantId"     TEXT NOT NULL,
  "ctpEntryId"   TEXT NOT NULL,
  "codigo"       TEXT NOT NULL,
  "productType"  TEXT,
  "presentacion" TEXT,
  "cantidad"     INTEGER NOT NULL,
  "unit"         TEXT NOT NULL DEFAULT 'm3',
  "volumenM3"    DECIMAL(14,4) NOT NULL,
  "espesorCm"    DECIMAL(8,2),
  "anchoCm"      DECIMAL(8,2),
  "largoM"       DECIMAL(8,2),
  "observations" TEXT,
  "createdBy"    TEXT NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  "deletedAt"    TIMESTAMP(3),
  CONSTRAINT "ForestCtpPaquete_pkey" PRIMARY KEY ("id")
);

-- Cascada: los paquetes son detalle de la corrida, no existen sin ella.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ForestCtpPaquete_ctpEntryId_fkey'
  ) THEN
    ALTER TABLE "ForestCtpPaquete"
      ADD CONSTRAINT "ForestCtpPaquete_ctpEntryId_fkey"
      FOREIGN KEY ("ctpEntryId") REFERENCES "ForestCtpEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- El código de paquete no se repite en la planta: es lo que se busca en la pila
-- y lo que se cita en la guía de salida.
CREATE UNIQUE INDEX IF NOT EXISTS "ForestCtpPaquete_tenantId_codigo_key"
  ON "ForestCtpPaquete" ("tenantId", "codigo");

CREATE INDEX IF NOT EXISTS "ForestCtpPaquete_tenantId_ctpEntryId_idx"
  ON "ForestCtpPaquete" ("tenantId", "ctpEntryId");
