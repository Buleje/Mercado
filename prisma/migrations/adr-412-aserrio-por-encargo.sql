-- Aserrío por encargo (ADR-412): el dueño por id, el precio del día congelado
-- en la corrida, el cargo en su cuenta y la persona de Adelantos vinculada.
--
-- Pedido de Brandon (2026-09-13): al declarar la producción poner el cliente
-- (dueño de la madera), el precio de aserrío de ese momento —con variaciones por
-- especie, tipo y largo— y que todo vaya a la cuenta del dueño, visible en
-- Mi Plata › Adelantos › Resumen.
--
-- EXPAND puro: sólo columnas nullables e índices. Ningún dato existente cambia
-- y el código viejo sigue funcionando sin leerlas. Idempotente. Reversible
-- (DROP INDEX + DROP COLUMN, en orden inverso).
--
-- Uso: USE_POOLER=1 SQL_FILE=prisma/migrations/adr-412-aserrio-por-encargo.sql node -r dotenv/config scripts/apply-fiados-gestion-migration.mjs dotenv_config_path=.env.local

-- 1. La corrida: a quién se le asierra (id del directorio, ADR-317) y lo que se
--    le cobró, congelado. `titularNombre` (ya existente) sigue siendo el acta.
ALTER TABLE "ForestCtpEntry" ADD COLUMN IF NOT EXISTS "duenoParteId" TEXT;
ALTER TABLE "ForestCtpEntry" ADD COLUMN IF NOT EXISTS "aserrioImporte" DECIMAL(12,2);
ALTER TABLE "ForestCtpEntry" ADD COLUMN IF NOT EXISTS "aserrioDetalle" JSONB;
CREATE INDEX IF NOT EXISTS "ForestCtpEntry_tenantId_duenoParteId_idx"
  ON "ForestCtpEntry" ("tenantId", "duenoParteId");

-- 2. La cuenta: de qué corrida nació el cargo. Único PARCIAL entre los vivos:
--    una corrida no se cobra dos veces, pero un cargo dado de baja no bloquea
--    volver a cobrarla (mismo criterio que el código de operación, ADR-329).
ALTER TABLE "ForestCuentaMov" ADD COLUMN IF NOT EXISTS "ctpEntryId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "ForestCuentaMov_tenantId_ctpEntryId_vivo_key"
  ON "ForestCuentaMov" ("tenantId", "ctpEntryId")
  WHERE "ctpEntryId" IS NOT NULL AND "deletedAt" IS NULL;

-- 3. Adelantos: esta persona es tal parte del directorio forestal. Con esto la
--    cuenta de una persona junta adelantos y aserríos en una sola fila.
ALTER TABLE "AdelantoBeneficiario" ADD COLUMN IF NOT EXISTS "forestPartyId" TEXT;
CREATE INDEX IF NOT EXISTS "AdelantoBeneficiario_tenantId_forestPartyId_idx"
  ON "AdelantoBeneficiario" ("tenantId", "forestPartyId");
