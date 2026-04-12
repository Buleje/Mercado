-- #26 Proposed migration: Superadmin 2FA TOTP
-- NO ejecutar directamente. Revisar con DBA y aplicar vía: prisma migrate dev
--
-- Propósito: Agrega columnas TOTP al modelo SuperadminUser (si existe) o User.
-- Verificado contra schema.prisma: no existe modelo SuperadminUser separado;
-- la auth de superadmin usa cookies de sesión propias (lib/superadmin-session.ts).
-- Se propone agregar a una tabla "SuperadminUser" que deberá crearse si se
-- implementa persistencia de usuarios de plataforma.
--
-- OPCIÓN A: Si se crea tabla SuperadminUser (recomendado para persistencia):
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "SuperadminUser" (
  "id"              TEXT    NOT NULL DEFAULT gen_random_uuid()::text,
  "username"        TEXT    NOT NULL UNIQUE,
  "passwordHash"    TEXT    NOT NULL,
  "totpSecret"      TEXT,                        -- NULL = TOTP no configurado
  "totpEnabledAt"   TIMESTAMPTZ,                 -- NULL = TOTP desactivado
  "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("id")
);

-- OPCIÓN B: Agregar a tabla AdminUser existente (para admins de tenant):
-- (Ver proposed-admin-totp.sql para esta variante)
--
-- ALTER TABLE "AdminUser"
--   ADD COLUMN IF NOT EXISTS "totpSecret"    TEXT,
--   ADD COLUMN IF NOT EXISTS "totpEnabledAt" TIMESTAMPTZ;
--
-- CREATE INDEX IF NOT EXISTS "AdminUser_totpEnabledAt_idx" ON "AdminUser" ("totpEnabledAt");

-- Índices para SuperadminUser
CREATE INDEX IF NOT EXISTS "SuperadminUser_username_idx" ON "SuperadminUser" ("username");

-- Comentario de auditoría
COMMENT ON COLUMN "SuperadminUser"."totpSecret"
  IS 'Base32-encoded TOTP secret (RFC 6238). NULL = sin 2FA configurado.';

COMMENT ON COLUMN "SuperadminUser"."totpEnabledAt"
  IS 'Timestamp de activación de TOTP. NULL = TOTP no activo.';
