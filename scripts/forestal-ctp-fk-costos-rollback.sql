-- ═══════════════════════════════════════════════════════════════════════════
-- ADR-134 (rev. 2) · ROLLBACK de la fase EXPAND
--
-- ⚠️ VENTANA DE USO: SÓLO si el SQL de EXPAND ya corrió pero el CÓDIGO NO se deployó
--    (schema.prisma sin tocar, DB classes sin tocar). En esa ventana nada escribe
--    estas columnas ni esta tabla ⇒ dropearlas no pierde nada.
--
-- ⚠️ SI EL CÓDIGO YA ESTÁ EN PROD: **NO CORRAS ESTO**. Hacé revert del deploy.
--    Las columnas son nullable e inertes y la tabla puente queda vacía si nadie
--    la escribe: dejarlas no cuesta nada. Dropearlas con código vivo = P2021/P2022.
--
-- ⚠️ REV 2: `DROP TABLE ForestCtpConsumo` SÍ borra datos — las atribuciones de
--    consumo. A diferencia de la rev.1 (que sólo dropeaba columnas), acá hay una
--    tabla con contenido propio. Antes de correrlo:
--       node scripts/forestal-ctp-backfill-verify.mjs --snapshot
--    El snapshot incluye ForestCtpConsumo. Igual, el acta legal (gtfIngreso,
--    materiaPrimaRef, providerName, volumeInputM3) NUNCA se tocó en EXPAND
--    (ADR-134 D2/D7) ⇒ el libro fiscal sobrevive intacto a este rollback. Lo único
--    que se pierde es la ATRIBUCIÓN (el índice), que es re-derivable con el backfill.
--
-- APLICAR: node scripts/apply-sql.mjs scripts/forestal-ctp-fk-costos-rollback.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Tabla puente completa (se lleva sus FKs, índices y CHECKs con ella)
DROP TABLE IF EXISTS "ForestCtpConsumo";

-- 2. FK a Supplier
ALTER TABLE "WoodEntry" DROP CONSTRAINT IF EXISTS "WoodEntry_supplierId_fkey";
DROP INDEX IF EXISTS "WoodEntry_tenantId_supplierId_idx";

-- 3. Columnas de ForestCtpEntry
ALTER TABLE "ForestCtpEntry" DROP COLUMN IF EXISTS "costoProceso";
ALTER TABLE "ForestCtpEntry" DROP COLUMN IF EXISTS "moneda";

-- 4. Columnas de WoodEntry
ALTER TABLE "WoodEntry" DROP COLUMN IF EXISTS "supplierId";
ALTER TABLE "WoodEntry" DROP COLUMN IF EXISTS "costoTotal";
ALTER TABLE "WoodEntry" DROP COLUMN IF EXISTS "moneda";

-- 5. Restos de la rev.1 (el FK escalar descartado por D5). Nunca se aplicaron
--    —verificado 2026-07-15— pero el guard es gratis y evita un rollback a medias
--    si alguien llegó a correr la versión vieja de este SQL.
ALTER TABLE "ForestCtpEntry" DROP CONSTRAINT IF EXISTS "ForestCtpEntry_woodEntryId_fkey";
DROP INDEX IF EXISTS "ForestCtpEntry_woodEntryId_idx";
ALTER TABLE "ForestCtpEntry" DROP COLUMN IF EXISTS "woodEntryId";
ALTER TABLE "ForestCtpEntry" DROP COLUMN IF EXISTS "costoMateriaPrima";
ALTER TABLE "ForestCtpEntry" DROP COLUMN IF EXISTS "costoTotal";
ALTER TABLE "WoodEntry"      DROP COLUMN IF EXISTS "costoUnitario";

-- Post: `npx prisma generate` si schema.prisma llegó a tocarse.
