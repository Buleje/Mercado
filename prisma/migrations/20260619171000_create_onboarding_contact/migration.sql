-- Activación v2 #10: estado de contacto por tienda (marcar contactada / posponer).
-- Aplicado en Supabase vía MCP el 2026-06-19 (flujo del proyecto: SQL idempotente,
-- prisma migrate no corre por el pooler). Idempotente para re-aplicar sin romper.

CREATE TABLE IF NOT EXISTS "OnboardingContact" (
  "tenantSlug" TEXT PRIMARY KEY,
  "status" TEXT NOT NULL DEFAULT 'none',
  "snoozedUntil" TIMESTAMP(3),
  "note" TEXT,
  "updatedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "OnboardingContact_status_idx" ON "OnboardingContact"("status");
