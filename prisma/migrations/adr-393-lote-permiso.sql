-- ForestLoteAserrio.permiso — un lote, un título habilitante (ADR-393).
--
-- El permiso que el lote va a consumir, elegido AL ARMARLO. El lote nace vacío
-- y las piezas se eligen después, así que el filtro tiene que existir antes de
-- que haya ninguna: derivarlo de las trozas sirve para denunciar la mezcla, no
-- para impedirla.
--
-- Nullable = «todos los permisos». Los lotes que ya existen no declararon uno y
-- no se les inventa: se siguen pudiendo consumir igual, y la columna de permiso
-- en Saldos avisa si sus trozas vienen de varios títulos.
--
-- Idempotente. Reversible.
-- Uso: USE_POOLER=1 node -r dotenv/config scripts/apply-fiados-gestion-migration.mjs dotenv_config_path=.env.local SQL_FILE=prisma/migrations/adr-393-lote-permiso.sql

ALTER TABLE "ForestLoteAserrio" ADD COLUMN IF NOT EXISTS "permiso" TEXT;
