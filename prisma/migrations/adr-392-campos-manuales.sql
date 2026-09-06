-- WoodEntry.camposManuales — de dónde salió cada casillero (ADR-392).
--
-- Guarda qué campo del formato escribió una PERSONA, quién y cuándo:
--   { "gtfSeries": { "por": "almacen@bodega", "el": "2026-09-06T14:22:10Z" } }
--
-- El VALOR del dato sigue viviendo donde siempre (su columna o `gtfDatos`);
-- acá va sólo la procedencia. `serforGtf` ya prueba qué dijo el documento
-- oficial; esto prueba qué agregó el operador — que es lo que pregunta una
-- fiscalización cuando un casillero no coincide con el papel.
--
-- Aditiva y nullable a propósito: `null` significa «no se sabe», NO «todo
-- oficial». A los ingresos anteriores a esta decisión no se les inventa una
-- procedencia que nadie registró.
--
-- Idempotente. Reversible (DROP COLUMN no toca ningún otro dato).
-- Uso: USE_POOLER=1 node -r dotenv/config scripts/apply-fiados-gestion-migration.mjs dotenv_config_path=.env.local SQL_FILE=prisma/migrations/adr-392-campos-manuales.sql

ALTER TABLE "WoodEntry" ADD COLUMN IF NOT EXISTS "camposManuales" JSONB;
