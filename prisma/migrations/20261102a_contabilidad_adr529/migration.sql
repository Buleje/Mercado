-- ADR-529 Contabilidad completa (doble partida, PCGE 2019). Solo agrega tablas.
CREATE TABLE IF NOT EXISTS "AsientoContable" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "periodo" TEXT NOT NULL,
  "fecha" DATE NOT NULL,
  "glosa" TEXT NOT NULL,
  "tipo" TEXT NOT NULL DEFAULT 'manual',
  "origen" TEXT,
  "enlace" JSONB,
  "moneda" TEXT NOT NULL DEFAULT 'PEN',
  "total" DECIMAL(14,2) NOT NULL,
  "anulado" BOOLEAN NOT NULL DEFAULT false,
  "creadoPor" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AsientoContable_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "AsientoContable_tenantId_origen_key" ON "AsientoContable"("tenantId", "origen");
CREATE INDEX IF NOT EXISTS "AsientoContable_tenantId_periodo_idx" ON "AsientoContable"("tenantId", "periodo");
CREATE INDEX IF NOT EXISTS "AsientoContable_tenantId_fecha_idx" ON "AsientoContable"("tenantId", "fecha");

CREATE TABLE IF NOT EXISTS "AsientoContableLinea" (
  "id" TEXT NOT NULL,
  "asientoId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "orden" INTEGER NOT NULL,
  "cuenta" TEXT NOT NULL,
  "debe" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "haber" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "glosa" TEXT,
  "tercero" TEXT,
  CONSTRAINT "AsientoContableLinea_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AsientoContableLinea_asientoId_idx" ON "AsientoContableLinea"("asientoId");
CREATE INDEX IF NOT EXISTS "AsientoContableLinea_tenantId_cuenta_idx" ON "AsientoContableLinea"("tenantId", "cuenta");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AsientoContableLinea_asientoId_fkey') THEN
    ALTER TABLE "AsientoContableLinea" ADD CONSTRAINT "AsientoContableLinea_asientoId_fkey"
      FOREIGN KEY ("asientoId") REFERENCES "AsientoContable"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "PeriodoContable" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "periodo" TEXT NOT NULL,
  "estado" TEXT NOT NULL DEFAULT 'abierto',
  "cerradoAt" TIMESTAMP(3),
  "cerradoPor" TEXT,
  "resumen" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PeriodoContable_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PeriodoContable_tenantId_periodo_key" ON "PeriodoContable"("tenantId", "periodo");

CREATE TABLE IF NOT EXISTS "CuentaContablePropia" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "codigo" TEXT NOT NULL,
  "nombre" TEXT NOT NULL,
  "naturaleza" TEXT NOT NULL,
  "activa" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CuentaContablePropia_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CuentaContablePropia_tenantId_codigo_key" ON "CuentaContablePropia"("tenantId", "codigo");

CREATE TABLE IF NOT EXISTS "ContabilidadAjustes" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "ventasConIgv" BOOLEAN,
  "mapeo" JSONB,
  "inicio" TEXT,
  "updatedPor" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ContabilidadAjustes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ContabilidadAjustes_tenantId_key" ON "ContabilidadAjustes"("tenantId");
