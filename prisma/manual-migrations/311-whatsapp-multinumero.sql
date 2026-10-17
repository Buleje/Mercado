-- 311: multi-número WhatsApp por tenant + WABA id (plantillas). Idempotente.
-- Rompe el unique(tenantId): un negocio puede conectar varios números
-- (ej. ventas + delivery). phoneNumberId pasa a ser único GLOBAL (un número
-- pertenece a una sola config).

ALTER TABLE "TenantWhatsAppConfig" ADD COLUMN IF NOT EXISTS "label" TEXT;
ALTER TABLE "TenantWhatsAppConfig" ADD COLUMN IF NOT EXISTS "wabaId" TEXT;

DROP INDEX IF EXISTS "TenantWhatsAppConfig_tenantId_key";
CREATE INDEX IF NOT EXISTS "TenantWhatsAppConfig_tenantId_idx"
  ON "TenantWhatsAppConfig"("tenantId");
CREATE UNIQUE INDEX IF NOT EXISTS "TenantWhatsAppConfig_phoneNumberId_key"
  ON "TenantWhatsAppConfig"("phoneNumberId");
