-- ForestCtpEntry.aperturaDeclarada* — la existencia de apertura como origen
-- DECLARADO (ADR-394). Calco del trío `usado*`: quién, cuándo y por qué se
-- declaró que esta corrida es madera anterior al libro y no tiene qué atar.
--
-- No toca ningún número: saldo, libro, cierre y export SERFOR no la leen. El
-- certificado sigue bloqueado para estas corridas (no hay cadena hacia atrás).
--
-- Aditiva, nullable, sin backfill: a lo importado no se le inventa una
-- declaración que nadie hizo (se reconoce por su marca de importación).
-- Idempotente. Reversible (DROP COLUMN no toca otro dato).
-- Uso (SQL_FILE es una VARIABLE DE ENTORNO: va ANTES de `node`; después del script es un argumento que se ignora y corre el SQL por defecto):
--   USE_POOLER=1 SQL_FILE=prisma/migrations/adr-394-apertura-declarada.sql node -r dotenv/config scripts/apply-fiados-gestion-migration.mjs dotenv_config_path=.env.local

ALTER TABLE "ForestCtpEntry" ADD COLUMN IF NOT EXISTS "aperturaDeclaradaAt" TIMESTAMP(3);
ALTER TABLE "ForestCtpEntry" ADD COLUMN IF NOT EXISTS "aperturaDeclaradaPor" TEXT;
ALTER TABLE "ForestCtpEntry" ADD COLUMN IF NOT EXISTS "aperturaDeclaradaMotivo" TEXT;
