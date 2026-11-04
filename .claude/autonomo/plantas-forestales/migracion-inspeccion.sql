-- Fase 3: inspecciones de planta (aditivo: sólo crea una tabla). NO aplicado.
CREATE TABLE IF NOT EXISTS "ForestInspeccionPlanta" (
  "id" TEXT PRIMARY KEY, "tenantId" TEXT NOT NULL, "fecha" DATE NOT NULL,
  "inspector" TEXT NOT NULL, "estado" VARCHAR(12) NOT NULL DEFAULT 'abierta',
  "libro" JSONB NOT NULL, "conteoPatioId" TEXT, "aserrada" JSONB NOT NULL DEFAULT '[]',
  "hallazgos" JSONB NOT NULL DEFAULT '[]', "conclusion" TEXT, "responsablePlanta" TEXT,
  "motivoAnulacion" TEXT, "cerradaAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL);
CREATE INDEX IF NOT EXISTS "ForestInspeccionPlanta_tenantId_fecha_idx" ON "ForestInspeccionPlanta"("tenantId","fecha");
CREATE INDEX IF NOT EXISTS "ForestInspeccionPlanta_estado_idx" ON "ForestInspeccionPlanta"("estado");
