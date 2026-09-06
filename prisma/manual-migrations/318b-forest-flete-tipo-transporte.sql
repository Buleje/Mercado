-- ADR-318 addendum · Fletes: propio (privado) vs flete de tercero (público) +
-- snapshot del conductor. Idempotente.

ALTER TABLE "ForestFlete" ADD COLUMN IF NOT EXISTS "tipoTransporte" TEXT NOT NULL DEFAULT 'privado';
ALTER TABLE "ForestFlete" ADD COLUMN IF NOT EXISTS "conductorNombre" TEXT;

CREATE INDEX IF NOT EXISTS "ForestFlete_tenantId_tipoTransporte_idx" ON "ForestFlete" ("tenantId", "tipoTransporte");
