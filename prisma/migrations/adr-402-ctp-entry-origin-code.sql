-- ForestCtpEntry.originCode — el N° de permiso DECLARADO del asiento (ADR-402).
--
-- Una corrida no tiene permiso propio: hereda el de la madera que consumió, y
-- por eso el dato vive en `WoodEntry.originCode` de sus guías. Pero una
-- **existencia de apertura** (ADR-394) no consumió ninguna guía —es madera
-- anterior al libro—, así que no hay ingreso del que heredarlo y el campo
-- quedaba en blanco sin ningún lugar donde escribirlo: la pantalla lo decía y
-- ahí terminaba.
--
-- Esta columna es ese lugar. Se lee SÓLO cuando no hay permiso heredado —la
-- guía sigue mandando cuando existe, o el libro tendría dos verdades sobre el
-- mismo origen— y se corrige por `corregir_linea`, que audita el antes y el
-- después.
--
-- Nullable: las corridas que ya existen no declararon uno y no se les inventa.
-- Idempotente. Reversible.
-- Uso: USE_POOLER=1 SQL_FILE=prisma/migrations/adr-402-ctp-entry-origin-code.sql node -r dotenv/config scripts/apply-fiados-gestion-migration.mjs dotenv_config_path=.env.local

ALTER TABLE "ForestCtpEntry" ADD COLUMN IF NOT EXISTS "originCode" TEXT;
