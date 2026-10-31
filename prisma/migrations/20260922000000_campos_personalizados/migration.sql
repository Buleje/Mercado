-- ADR-427 · Campos personalizados en los modales.
-- Dos tablas nuevas: nada existente se toca. Idempotente.
CREATE TABLE IF NOT EXISTS "CampoPersonalizado" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "formulario" TEXT NOT NULL,
  "clave" TEXT NOT NULL,
  "nombre" TEXT NOT NULL,
  "descripcion" TEXT,
  "tipo" TEXT NOT NULL DEFAULT 'texto',
  "opciones" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "soloParaRegistroId" TEXT,
  "orden" INTEGER NOT NULL DEFAULT 0,
  "activo" BOOLEAN NOT NULL DEFAULT true,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "CampoPersonalizado_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CampoPersonalizadoValor" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "campoId" TEXT NOT NULL,
  "registroId" TEXT NOT NULL,
  "valor" TEXT,
  "valorNum" DECIMAL(18,4),
  "valorFecha" TIMESTAMP(3),
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CampoPersonalizadoValor_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CampoPersonalizado_tenantId_formulario_clave_soloParaRegistroId_key"
  ON "CampoPersonalizado"("tenantId", "formulario", "clave", "soloParaRegistroId");
CREATE INDEX IF NOT EXISTS "CampoPersonalizado_tenantId_formulario_activo_idx"
  ON "CampoPersonalizado"("tenantId", "formulario", "activo");
CREATE INDEX IF NOT EXISTS "CampoPersonalizado_deletedAt_idx" ON "CampoPersonalizado"("deletedAt");
CREATE UNIQUE INDEX IF NOT EXISTS "CampoPersonalizadoValor_tenantId_campoId_registroId_key"
  ON "CampoPersonalizadoValor"("tenantId", "campoId", "registroId");
CREATE INDEX IF NOT EXISTS "CampoPersonalizadoValor_tenantId_registroId_idx"
  ON "CampoPersonalizadoValor"("tenantId", "registroId");

-- La FK va suelta (el runner del repo parte por ';' y no soporta bloques DO).
ALTER TABLE "CampoPersonalizadoValor" DROP CONSTRAINT IF EXISTS "CampoPersonalizadoValor_campoId_fkey";
ALTER TABLE "CampoPersonalizadoValor" ADD CONSTRAINT "CampoPersonalizadoValor_campoId_fkey" FOREIGN KEY ("campoId") REFERENCES "CampoPersonalizado"("id") ON DELETE CASCADE ON UPDATE CASCADE;
