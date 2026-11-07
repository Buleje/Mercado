-- ADR-421 · corrección del mismo día (hallazgo del plan de migración).
--
-- 1. El unique de `(tenantId, codigoNorm)` era TOTAL. Con `deletedAt` en el
--    modelo, dar de baja un contrato dejaba su código bloqueado para siempre:
--    volver a cargar ese mismo permiso tiraba P2002. Pasa a PARCIAL, que es lo
--    que este repo ya eligió para `ForestLoteAserrio` (ADR-396).
--    Cuesta cero hacerlo hoy: la tabla todavía está vacía.
DROP INDEX IF EXISTS "ForestContrato_tenantId_codigoNorm_key";

CREATE UNIQUE INDEX IF NOT EXISTS "ForestContrato_tenantId_codigoNorm_vivo_key"
  ON "ForestContrato"("tenantId", "codigoNorm")
  WHERE "deletedAt" IS NULL;

CREATE INDEX IF NOT EXISTS "ForestContrato_tenantId_codigoNorm_idx"
  ON "ForestContrato"("tenantId", "codigoNorm");

-- 2. `updatedAt` lo escribe Prisma por `@updatedAt`, pero cualquier INSERT en
--    SQL crudo que no lo ponga falla. El DEFAULT lo vuelve inofensivo.
ALTER TABLE "ForestContrato" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
