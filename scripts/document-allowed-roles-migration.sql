-- Permisos por documento/carpeta (wave 9). Aplicado vía Supabase MCP
-- (apply_migration "document_allowed_roles") el 2026-07-22. Idempotente.
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "allowedRoles" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "DocumentFolder" ADD COLUMN IF NOT EXISTS "allowedRoles" TEXT[] NOT NULL DEFAULT '{}';
