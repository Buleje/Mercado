-- ADR-497 · Plan de la empresa: una fila por sección + su historial de versiones.
--
-- EXPAND puro: sólo dos tablas nuevas, ninguna existente cambia (sin locks sobre
-- tablas vivas, sin backfill). El código viejo no las lee.
--
-- Índices: el único (tenantId, seccion) sirve toda lectura por negocio y el único
-- (tenantId, seccion, version) sirve el historial (ordenado por version) y la poda.
-- No llevan índice aparte por tenantId: sería el mismo prefijo dos veces.
--
-- Idempotente: IF NOT EXISTS, la 2.ª corrida no cambia nada.

CREATE TABLE IF NOT EXISTS "PlanEmpresaSeccion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "seccion" TEXT NOT NULL,
    "datos" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanEmpresaSeccion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PlanEmpresaSeccion_tenantId_seccion_key"
    ON "PlanEmpresaSeccion"("tenantId", "seccion");

CREATE TABLE IF NOT EXISTS "PlanEmpresaVersion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "seccion" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "datos" JSONB NOT NULL,
    "autor" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanEmpresaVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PlanEmpresaVersion_tenantId_seccion_version_key"
    ON "PlanEmpresaVersion"("tenantId", "seccion", "version");
