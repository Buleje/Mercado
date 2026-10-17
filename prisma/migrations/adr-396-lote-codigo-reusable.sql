-- ForestLoteAserrio.code — el código de un lote BORRADO se puede volver a usar (ADR-396).
--
-- `@@unique([tenantId, code])` no miraba `deletedAt`: un lote que se armó, se
-- borró y se quiso volver a armar con el mismo nombre chocaba contra su propio
-- fantasma («ya está en uso») para siempre. El índice único pasa a ser PARCIAL:
-- sólo los lotes vivos compiten por el código. Los borrados conservan el suyo
-- (la auditoría sigue pudiendo decir «el LA-2026-010 se borró el día tal»).
--
-- Prisma no sabe expresar índices parciales: en `schema.prisma` el modelo queda
-- con `@@index([tenantId, code])` y un comentario que apunta acá. No lo
-- «arregles» volviendo a poner `@@unique`.
--
-- Idempotente. Reversible (volver a crear el índice único completo).
-- Uso: USE_POOLER=1 SQL_FILE=prisma/migrations/adr-396-lote-codigo-reusable.sql node -r dotenv/config scripts/apply-fiados-gestion-migration.mjs dotenv_config_path=.env.local

DROP INDEX IF EXISTS "ForestLoteAserrio_tenantId_code_key";

CREATE UNIQUE INDEX IF NOT EXISTS "ForestLoteAserrio_tenantId_code_vivo_key"
  ON "ForestLoteAserrio" ("tenantId", "code")
  WHERE "deletedAt" IS NULL;

CREATE INDEX IF NOT EXISTS "ForestLoteAserrio_tenantId_code_idx"
  ON "ForestLoteAserrio" ("tenantId", "code");
