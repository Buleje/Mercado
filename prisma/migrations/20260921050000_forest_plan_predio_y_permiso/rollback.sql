-- ROLLBACK de `migration.sql` (ADR-426 — identidad, predio y permiso del plan).
--
-- Espejo exacto del EXPAND: el índice y las nueve columnas. Deja `ForestPlan`
-- como estaba (30 columnas). El `DROP CONSTRAINT` de abajo es por si alguien
-- aplicó una versión anterior de `migration.sql`, que sí creaba la FK: hoy el
-- vínculo es app-level y la constraint no existe (`IF EXISTS` = no-op).
--
-- ⚠️ ANTES de correrlo, SIEMPRE los dos pasos:
--
--   1) Contar qué se perdería (mientras todo dé 0, revertir es gratis):
--        SELECT count(*) FROM "ForestPlan" WHERE "contratoId"        IS NOT NULL;
--        SELECT count(*) FROM "ForestPlan" WHERE "propietarioNombre" IS NOT NULL;
--        SELECT count(*) FROM "ForestPlan"
--          WHERE coalesce(alias, provincia, distrito, sector, cuenca,
--                         "propietarioDoc", "propietarioDocTipo") IS NOT NULL;
--
--   2) Si alguno dio > 0, exportar primero. El vínculo al permiso se puede
--      volver a atar desde la ficha, pero el predio, el propietario y la cuenca
--      los tipeó una PERSONA leyendo un papel: no se derivan de ningún lado.
--        \copy (SELECT id, "tenantId", "planNumber", alias, "propietarioNombre",
--                      "propietarioDocTipo", "propietarioDoc", provincia,
--                      distrito, sector, cuenca, "contratoId"
--                 FROM "ForestPlan") TO 'forestplan-predio-backup.csv' CSV HEADER;
--
--   3) Revertir TAMBIÉN el código, en este orden: primero se despliega el
--      código sin esas columnas (o se quitan de `prisma/schema.prisma` + `npx
--      prisma generate` + reiniciar el dev server), DESPUÉS este SQL. Al revés,
--      toda lectura de `ForestPlan` muere con P2022 («column does not exist»):
--      es la caída del Libro TH entero, no un bug de una pantalla.
--
--   4) Si la migración ya estaba registrada, desregistrarla después:
--        DELETE FROM _prisma_migrations
--         WHERE migration_name = '20260921050000_forest_plan_predio_y_permiso';
--
-- Uso: node scripts/apply-sql.mjs prisma/migrations/20260921050000_forest_plan_predio_y_permiso/rollback.sql --dry-run
--      node scripts/apply-sql.mjs prisma/migrations/20260921050000_forest_plan_predio_y_permiso/rollback.sql

ALTER TABLE "ForestPlan" DROP CONSTRAINT IF EXISTS "ForestPlan_contratoId_fkey";
DROP INDEX IF EXISTS "ForestPlan_tenantId_contratoId_idx";

ALTER TABLE "ForestPlan"
  DROP COLUMN IF EXISTS "contratoId",
  DROP COLUMN IF EXISTS "cuenca",
  DROP COLUMN IF EXISTS "sector",
  DROP COLUMN IF EXISTS "distrito",
  DROP COLUMN IF EXISTS "provincia",
  DROP COLUMN IF EXISTS "propietarioDoc",
  DROP COLUMN IF EXISTS "propietarioDocTipo",
  DROP COLUMN IF EXISTS "propietarioNombre",
  DROP COLUMN IF EXISTS "alias";
