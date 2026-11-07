-- Port de cobranza Adelantos → Fiados: bitácora de gestión por cliente.
--
-- Mismo shape que AdelantoGestion (tenantId, tipo, nota, fechaPrometida,
-- montoPrometido, usuario) pero indexada por customerId en vez de
-- beneficiarioId, y sin relación FK — un Fiado abierto ya impide borrar al
-- Customer (Fiado.customer onDelete: Restrict), así que el log no necesita
-- su propia cascada.
--
-- Idempotente.
-- Uso: USE_POOLER=1 node -r dotenv/config scripts/apply-fiados-gestion-migration.mjs dotenv_config_path=.env.local

CREATE TABLE IF NOT EXISTS "FiadoGestion" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "tipo" TEXT NOT NULL DEFAULT 'RECORDATORIO',
  "nota" TEXT,
  "fechaPrometida" TIMESTAMP(3),
  "montoPrometido" DECIMAL(12,2),
  "usuario" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FiadoGestion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "FiadoGestion_tenantId_customerId_fecha_idx" ON "FiadoGestion"("tenantId", "customerId", "fecha");
CREATE INDEX IF NOT EXISTS "FiadoGestion_tenantId_fechaPrometida_idx" ON "FiadoGestion"("tenantId", "fechaPrometida");
