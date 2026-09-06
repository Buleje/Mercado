-- Centro de alertas v2 (#1): estado persistido por alerta (reconocer/posponer/resolver).
-- Aplicado en Supabase vía MCP el 2026-06-19 (flujo del proyecto: SQL idempotente,
-- prisma migrate no corre por el pooler). Idempotente para re-aplicar sin romper.

CREATE TABLE IF NOT EXISTS "AlertState" (
  "alertId" TEXT PRIMARY KEY,
  "status" TEXT NOT NULL DEFAULT 'open',
  "snoozedUntil" TIMESTAMP(3),
  "note" TEXT,
  "updatedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "AlertState_status_idx" ON "AlertState"("status");
