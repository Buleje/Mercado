-- ADR-317 · Directorio forestal: partes (proveedor/destinatario/transportista/
-- conductor) y vehículos. Idempotente: se puede correr dos veces.

CREATE TABLE IF NOT EXISTS "ForestParty" (
  "id"                TEXT PRIMARY KEY,
  "tenantId"          TEXT NOT NULL,
  "roles"             TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "nombre"            TEXT NOT NULL,
  "docTipo"           TEXT,
  "docNumero"         TEXT,
  "direccion"         TEXT,
  "region"            TEXT,
  "provincia"         TEXT,
  "distrito"          TEXT,
  "ubigeo"            TEXT,
  "telefono"          TEXT,
  "email"             TEXT,
  "registroMtc"       TEXT,
  "licencia"          TEXT,
  "tituloHabilitante" TEXT,
  "notas"             TEXT,
  "activo"            BOOLEAN NOT NULL DEFAULT true,
  "usos"              INTEGER NOT NULL DEFAULT 0,
  "ultimoUso"         TIMESTAMP(3),
  "createdBy"         TEXT NOT NULL,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt"         TIMESTAMP(3)
);

-- El documento identifica a la parte. Los NULL son distintos entre sí en
-- Postgres, así que las partes sin documento conviven sin chocar.
CREATE UNIQUE INDEX IF NOT EXISTS "ForestParty_tenantId_docTipo_docNumero_key"
  ON "ForestParty" ("tenantId", "docTipo", "docNumero");
CREATE INDEX IF NOT EXISTS "ForestParty_tenantId_activo_idx" ON "ForestParty" ("tenantId", "activo");
CREATE INDEX IF NOT EXISTS "ForestParty_tenantId_nombre_idx" ON "ForestParty" ("tenantId", "nombre");
CREATE INDEX IF NOT EXISTS "ForestParty_deletedAt_idx" ON "ForestParty" ("deletedAt");

CREATE TABLE IF NOT EXISTS "ForestVehiculo" (
  "id"              TEXT PRIMARY KEY,
  "tenantId"        TEXT NOT NULL,
  "placa"           TEXT NOT NULL,
  "marca"           TEXT,
  "tipo"            TEXT,
  "configuracion"   TEXT,
  "capacidadM3"     DECIMAL(10,3),
  "transportistaId" TEXT,
  "notas"           TEXT,
  "activo"          BOOLEAN NOT NULL DEFAULT true,
  "usos"            INTEGER NOT NULL DEFAULT 0,
  "ultimoUso"       TIMESTAMP(3),
  "createdBy"       TEXT NOT NULL,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt"       TIMESTAMP(3)
);

CREATE UNIQUE INDEX IF NOT EXISTS "ForestVehiculo_tenantId_placa_key"
  ON "ForestVehiculo" ("tenantId", "placa");
CREATE INDEX IF NOT EXISTS "ForestVehiculo_tenantId_activo_idx" ON "ForestVehiculo" ("tenantId", "activo");
CREATE INDEX IF NOT EXISTS "ForestVehiculo_deletedAt_idx" ON "ForestVehiculo" ("deletedAt");

-- SetNull: si se borra el transportista, la placa sobrevive — el vehículo viajó
-- y las guías ya emitidas lo nombran.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ForestVehiculo_transportistaId_fkey'
  ) THEN
    ALTER TABLE "ForestVehiculo"
      ADD CONSTRAINT "ForestVehiculo_transportistaId_fkey"
      FOREIGN KEY ("transportistaId") REFERENCES "ForestParty"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
