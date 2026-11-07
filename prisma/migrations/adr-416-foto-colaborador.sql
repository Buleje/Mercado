-- Foto de la persona para el fotocheck (ADR-416).
--
-- EXPAND puro: una columna nullable y su CHECK. Ningún dato existente cambia y
-- el código actual no la lee. Idempotente con el script: «already exists» = skip.
-- Para revertir (sólo si ninguna persona tiene foto: contar primero):
--   ALTER TABLE "Colaborador" DROP CONSTRAINT "Colaborador_fotoUrl_chk"
--   ALTER TABLE "Colaborador" DROP COLUMN "fotoUrl"
--
-- Uso: USE_POOLER=1 SQL_FILE=prisma/migrations/adr-416-foto-colaborador.sql node -r dotenv/config scripts/apply-fiados-gestion-migration.mjs dotenv_config_path=.env.local

ALTER TABLE "Colaborador" ADD COLUMN IF NOT EXISTS "fotoUrl" TEXT;

-- La foto sale de /api/upload (bucket público, https). Una URL http o un data: no entra.
ALTER TABLE "Colaborador" ADD CONSTRAINT "Colaborador_fotoUrl_chk" CHECK ("fotoUrl" IS NULL OR "fotoUrl" LIKE 'https://%');
