-- ForestLoteAserrio.sniffs — lo que el SNIFFS declaró de este lote (ADR-398).
--
-- Cuando el lote se arma pegando la pantalla del SNIFFS (o importando su lista
-- de programaciones), se guarda la foto de lo leído: N° de lote SNIFFS, fechas,
-- especie, volumen consumido y productos con sus m³. Con eso la tarjeta puede
-- decir «cuadra con el SNIFFS» o «difiere en X m³» sin volver a pegar nada.
--
-- Nullable = el lote no vino del SNIFFS (los de siempre). JSON porque es una
-- foto de un documento externo, no datos propios del libro: no se consulta por
-- dentro, se compara entero.
--
-- Idempotente. Reversible.
-- Uso: USE_POOLER=1 SQL_FILE=prisma/migrations/adr-398-lote-sniffs-ref.sql node -r dotenv/config scripts/apply-fiados-gestion-migration.mjs dotenv_config_path=.env.local

ALTER TABLE "ForestLoteAserrio" ADD COLUMN IF NOT EXISTS "sniffs" JSONB;
