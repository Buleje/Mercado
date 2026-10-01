-- ROLLBACK de `migration.sql` (ADR-421 — el contrato como eje del movimiento).
--
-- Espejo exacto del EXPAND: borra la tabla `ForestContrato`, las siete columnas
-- `contratoId`, sus índices y sus foreign keys. Deja la base como estaba.
--
-- ⚠️ ANTES de correrlo, SIEMPRE los dos pasos:
--
--   1) Contar qué se perdería (mientras todo dé 0, revertir es gratis):
--        SELECT count(*) FROM "ForestContrato";
--        SELECT count(*) FROM "WoodEntry"         WHERE "contratoId" IS NOT NULL;
--        SELECT count(*) FROM "ForestCtpEntry"    WHERE "contratoId" IS NOT NULL;
--        SELECT count(*) FROM "ForestLoteAserrio" WHERE "contratoId" IS NOT NULL;
--        SELECT count(*) FROM "Expense"           WHERE "contratoId" IS NOT NULL;
--        SELECT count(*) FROM "Adelanto"          WHERE "contratoId" IS NOT NULL;
--        SELECT count(*) FROM "ForestFlete"       WHERE "contratoId" IS NOT NULL;
--        SELECT count(*) FROM "ForestCuentaMov"   WHERE "contratoId" IS NOT NULL;
--
--   2) Si alguno dio > 0, exportar primero. Los contratos se pueden volver a
--      sembrar del libro, pero la imputación que hizo una PERSONA (sobre todo
--      gastos, adelantos, fletes y cuenta corriente, que no se pueden derivar de
--      ningún texto) no se recupera de ningún lado:
--        \copy (SELECT * FROM "ForestContrato") TO 'contratos-backup.csv' CSV HEADER;
--        \copy (SELECT 'WoodEntry' t, id, "tenantId", "contratoId" FROM "WoodEntry" WHERE "contratoId" IS NOT NULL
--               UNION ALL SELECT 'ForestCtpEntry',    id, "tenantId", "contratoId" FROM "ForestCtpEntry"    WHERE "contratoId" IS NOT NULL
--               UNION ALL SELECT 'ForestLoteAserrio', id, "tenantId", "contratoId" FROM "ForestLoteAserrio" WHERE "contratoId" IS NOT NULL
--               UNION ALL SELECT 'Expense',           id, "tenantId", "contratoId" FROM "Expense"           WHERE "contratoId" IS NOT NULL
--               UNION ALL SELECT 'Adelanto',          id, "tenantId", "contratoId" FROM "Adelanto"          WHERE "contratoId" IS NOT NULL
--               UNION ALL SELECT 'ForestFlete',       id, "tenantId", "contratoId" FROM "ForestFlete"       WHERE "contratoId" IS NOT NULL
--               UNION ALL SELECT 'ForestCuentaMov',   id, "tenantId", "contratoId" FROM "ForestCuentaMov"   WHERE "contratoId" IS NOT NULL)
--          TO 'contrato-imputacion-backup.csv' CSV HEADER;
--
--   3) Revertir TAMBIÉN el código, en este orden: primero se despliega el código
--      sin `contratoId` (o se quita el modelo de `prisma/schema.prisma` y se
--      corre `npx prisma generate` + reiniciar el dev server), DESPUÉS este SQL.
--      Al revés, toda lectura de esas siete tablas muere con P2022
--      («column does not exist»), que es una caída total del panel, no un bug.
--
-- Uso: node scripts/apply-sql.mjs prisma/migrations/20260918190000_forest_contrato_eje/rollback.sql --dry-run
--      node scripts/apply-sql.mjs prisma/migrations/20260918190000_forest_contrato_eje/rollback.sql
--
-- Si la migración ya estaba registrada, después hay que desregistrarla:
--   DELETE FROM "_prisma_migrations" WHERE migration_name = '20260918190000_forest_contrato_eje';

-- Espejo del DO $$ del EXPAND: la FK y el índice se van solos con la columna,
-- pero se borran explícitos para que el log diga qué pasó.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['WoodEntry','ForestCtpEntry','ForestLoteAserrio','Expense','Adelanto','ForestFlete','ForestCuentaMov']
  LOOP
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I', t, t || '_contratoId_fkey');
    EXECUTE format('DROP INDEX IF EXISTS %I', t || '_tenantId_contratoId_idx');
    EXECUTE format('ALTER TABLE %I DROP COLUMN IF EXISTS "contratoId"', t);
  END LOOP;
END $$;

DROP INDEX IF EXISTS "ForestContrato_deletedAt_idx";
DROP INDEX IF EXISTS "ForestContrato_tenantId_titularNombre_idx";
DROP INDEX IF EXISTS "ForestContrato_tenantId_estado_idx";
DROP INDEX IF EXISTS "ForestContrato_tenantId_codigoNorm_key";

DROP TABLE IF EXISTS "ForestContrato";
