-- ADR-439 · Reportes diarios forestales por correo y WhatsApp.
--
-- Fase EXPAND pura: UNA tabla nueva, nada existente se toca. Idempotente
-- (`IF NOT EXISTS`). El historial de envíos reusa "NotificationLog".
-- Aplicar por el pooler :5432 (session):
--   node scripts/prisma-session.mjs db execute --file prisma/migrations/20260926_reportes_diarios_adr439/migration.sql
--   node scripts/prisma-session.mjs migrate resolve --applied 20260926_reportes_diarios_adr439
CREATE TABLE IF NOT EXISTS "ForestReporteDiario" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "nombre" TEXT NOT NULL,
  "activo" BOOLEAN NOT NULL DEFAULT true,
  "hora" TEXT NOT NULL DEFAULT '18:00',
  "dias" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5, 6]::INTEGER[],
  "porCorreo" BOOLEAN NOT NULL DEFAULT true,
  "porWhatsapp" BOOLEAN NOT NULL DEFAULT true,
  "correos" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "telefonos" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "secciones" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "rango" TEXT NOT NULL DEFAULT 'hoy',
  "ultimaFechaEnviada" TEXT,
  "creadoPor" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ForestReporteDiario_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ForestReporteDiario_tenantId_idx" ON "ForestReporteDiario"("tenantId");
CREATE INDEX IF NOT EXISTS "ForestReporteDiario_activo_idx" ON "ForestReporteDiario"("activo");
