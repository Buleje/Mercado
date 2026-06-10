-- #45 Proposed migration: Admin 2FA TOTP (tenant admin users)
-- NO ejecutar directamente. Revisar con DBA y aplicar vía: prisma migrate dev
--
-- Propósito: Agrega columnas TOTP a la tabla AdminUser existente.
-- AdminUser ya existe en schema.prisma con campos: id, username, tenantId,
-- passwordHash, role, name, active, onboardingCompletedAt, createdAt, updatedAt.

ALTER TABLE "AdminUser"
  ADD COLUMN IF NOT EXISTS "totpSecret"    TEXT,
  ADD COLUMN IF NOT EXISTS "totpEnabledAt" TIMESTAMPTZ;

-- Índice para consultar admins con TOTP activo
CREATE INDEX IF NOT EXISTS "AdminUser_totpEnabledAt_idx"
  ON "AdminUser" ("totpEnabledAt")
  WHERE "totpEnabledAt" IS NOT NULL;

COMMENT ON COLUMN "AdminUser"."totpSecret"
  IS 'Base32-encoded TOTP secret (RFC 6238). NULL = sin 2FA configurado.';

COMMENT ON COLUMN "AdminUser"."totpEnabledAt"
  IS 'Timestamp de activación de TOTP. NULL = TOTP no activo aún.';
