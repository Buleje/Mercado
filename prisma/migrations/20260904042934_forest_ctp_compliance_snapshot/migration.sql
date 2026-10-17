-- ADR-384 · La historia del cumplimiento del Libro CTP.
--
-- Tabla nueva, sin tocar ninguna existente y sin backfill: el pasado no se
-- puede reconstruir sin los agregados de ese día, y no se finge. La serie
-- arranca el día del deploy.

CREATE TABLE "ForestCtpComplianceSnapshot" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "periodo" VARCHAR(20) NOT NULL,
    "score" INTEGER NOT NULL,
    "fueraPlazo" INTEGER NOT NULL DEFAULT 0,
    "pendientes" INTEGER NOT NULL DEFAULT 0,
    "especiesEnNegativo" INTEGER NOT NULL DEFAULT 0,
    "stockNegativo" INTEGER NOT NULL DEFAULT 0,
    "despachosSinTraza" INTEGER NOT NULL DEFAULT 0,
    "citesCount" INTEGER NOT NULL DEFAULT 0,
    "citesSinPermiso" INTEGER NOT NULL DEFAULT 0,
    "rendimientoAlto" INTEGER NOT NULL DEFAULT 0,
    "documentosVencidos" INTEGER NOT NULL DEFAULT 0,
    "documentosPorVencer" INTEGER NOT NULL DEFAULT 0,
    "totalIngresos" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ForestCtpComplianceSnapshot_pkey" PRIMARY KEY ("id")
);

-- Un punto por día y período; el segundo guardado del día actualiza.
-- Sirve además de índice de lectura de la serie (prefijo tenantId, periodo).
CREATE UNIQUE INDEX "ForestCtpComplianceSnapshot_tenantId_periodo_fecha_key"
    ON "ForestCtpComplianceSnapshot"("tenantId", "periodo", "fecha");
