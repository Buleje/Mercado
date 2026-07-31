-- ADR-318 · Fletes forestales: el viaje que trae la madera. Idempotente.

CREATE TABLE IF NOT EXISTS "ForestFlete" (
  "id"                  TEXT PRIMARY KEY,
  "tenantId"            TEXT NOT NULL,
  "fecha"               TIMESTAMP(3) NOT NULL,
  "tipo"                TEXT NOT NULL DEFAULT 'ingreso',
  "gtfNumber"           TEXT,
  "vehiculoId"          TEXT,
  "placa"               TEXT,
  "transportistaId"     TEXT,
  "transportistaNombre" TEXT,
  "conductorId"         TEXT,
  "proveedorId"         TEXT,
  "proveedorNombre"     TEXT,
  "volumenM3"           DECIMAL(12,4),
  "monto"               DECIMAL(12,2),
  "moneda"              TEXT DEFAULT 'PEN',
  "pagaQuien"           TEXT NOT NULL DEFAULT 'ctp',
  "estadoPago"          TEXT NOT NULL DEFAULT 'pendiente',
  "fechaPago"           TIMESTAMP(3),
  "notas"               TEXT,
  "createdBy"           TEXT NOT NULL,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt"           TIMESTAMP(3)
);

CREATE INDEX IF NOT EXISTS "ForestFlete_tenantId_fecha_idx" ON "ForestFlete" ("tenantId", "fecha" DESC);
CREATE INDEX IF NOT EXISTS "ForestFlete_tenantId_estadoPago_idx" ON "ForestFlete" ("tenantId", "estadoPago");
CREATE INDEX IF NOT EXISTS "ForestFlete_tenantId_gtfNumber_idx" ON "ForestFlete" ("tenantId", "gtfNumber");
CREATE INDEX IF NOT EXISTS "ForestFlete_deletedAt_idx" ON "ForestFlete" ("deletedAt");

-- SetNull: si el vehículo se da de baja, el viaje sigue existiendo con su placa
-- en el snapshot — un flete pagado no se borra porque el camión ya no está.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ForestFlete_vehiculoId_fkey') THEN
    ALTER TABLE "ForestFlete"
      ADD CONSTRAINT "ForestFlete_vehiculoId_fkey"
      FOREIGN KEY ("vehiculoId") REFERENCES "ForestVehiculo"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
