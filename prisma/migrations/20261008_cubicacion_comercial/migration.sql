-- Contrato K7 (08-10) · ADR-483 · Cubicación COMERCIAL con descuentos ligada a la cuenta.
-- Extiende ADR-478 (20261008_cubicacion_trozas_cuenta): misma tabla, misma plata, mismos frenos.
--
-- EXPAND puro sobre "ForestCubicacionTrozas":
--   · 8 columnas nuevas. Las dos NOT NULL llevan DEFAULT constante ("material"='troza',
--     "modo"='pieza'): en PG 11+ es sólo catálogo, no reescribe la tabla. Las filas de
--     ADR-478 quedan como troza/pieza y el cliente Prisma viejo sigue insertando igual.
--   · 1 índice (tenantId, origen, origenId) para «las cubicaciones de esta GTF/despacho».
--   · CHECK de fórmula v2 (suma 'tablar' = madera aserrada) + 5 CHECK nuevos.
-- Sin FK: "origenId" apunta a ForestGtf.id (loth) o a ForestCtpEntry.id (despacho), ADR-426,
-- se valida del MISMO tenant en la DB class. Sin índice parcial (Prisma lo propondría borrar).
-- Prisma no declara los CHECK: no aparecen en `migrate diff`.
--
-- Idempotente: ADD COLUMN / CREATE INDEX con IF NOT EXISTS. La fórmula vieja se suelta con
-- DROP CONSTRAINT IF EXISTS y la v2 tiene OTRO nombre, así la 2.ª corrida no la borra y su
-- «already exists» lo salta el script (cada sentencia en su SAVEPOINT).
-- Este archivo se parte por punto y coma de sentencia: ninguno dentro de comentarios ni literales.
--
-- Respaldo (cifras que deben dar igual antes y después): reports/respaldo-k7-2026-10-08.json
--
-- Ensayo (BEGIN … ROLLBACK, verifica columnas e índice dentro de la tx):
--   node -r dotenv/config scripts/aplicar-migracion-sesion.mjs prisma/migrations/20261008_cubicacion_comercial/migration.sql --ensayo dotenv_config_path=.env.local
-- Aplicar (2 veces: la 2.ª da «0 nuevas»):
--   node -r dotenv/config scripts/aplicar-migracion-sesion.mjs prisma/migrations/20261008_cubicacion_comercial/migration.sql dotenv_config_path=.env.local
--   node scripts/prisma-session.mjs migrate resolve --applied 20261008_cubicacion_comercial
--
-- Para revertir (contar primero qué se perdería: filas aserrada u origen no nulo), una sentencia por línea:
--   SELECT count(*), "material", "origen" FROM "ForestCubicacionTrozas" GROUP BY 2, 3
--   ALTER TABLE "ForestCubicacionTrozas" DROP CONSTRAINT IF EXISTS "ForestCubicacionTrozas_volumen_neto_chk"
--   ALTER TABLE "ForestCubicacionTrozas" DROP CONSTRAINT IF EXISTS "ForestCubicacionTrozas_tablar_chk"
--   ALTER TABLE "ForestCubicacionTrozas" DROP CONSTRAINT IF EXISTS "ForestCubicacionTrozas_origen_chk"
--   ALTER TABLE "ForestCubicacionTrozas" DROP CONSTRAINT IF EXISTS "ForestCubicacionTrozas_modo_chk"
--   ALTER TABLE "ForestCubicacionTrozas" DROP CONSTRAINT IF EXISTS "ForestCubicacionTrozas_material_chk"
--   (sólo si no hay ninguna fila 'tablar')
--   ALTER TABLE "ForestCubicacionTrozas" DROP CONSTRAINT IF EXISTS "ForestCubicacionTrozas_formula_v2_chk"
--   ALTER TABLE "ForestCubicacionTrozas" ADD CONSTRAINT "ForestCubicacionTrozas_formula_chk" CHECK ("formula" IN ('smalian', 'oxapampina'))
--   DROP INDEX IF EXISTS "ForestCubicacionTrozas_tenantId_origen_origenId_idx"
--   ALTER TABLE "ForestCubicacionTrozas" DROP COLUMN IF EXISTS "material", DROP COLUMN IF EXISTS "origen", DROP COLUMN IF EXISTS "origenId", DROP COLUMN IF EXISTS "modo", DROP COLUMN IF EXISTS "volumenBruto", DROP COLUMN IF EXISTS "descuentos", DROP COLUMN IF EXISTS "referenciaSmalianM3", DROP COLUMN IF EXISTS "cubicacionRefId"

ALTER TABLE "ForestCubicacionTrozas" ADD COLUMN IF NOT EXISTS "material" TEXT NOT NULL DEFAULT 'troza';
ALTER TABLE "ForestCubicacionTrozas" ADD COLUMN IF NOT EXISTS "origen" TEXT;
ALTER TABLE "ForestCubicacionTrozas" ADD COLUMN IF NOT EXISTS "origenId" TEXT;
ALTER TABLE "ForestCubicacionTrozas" ADD COLUMN IF NOT EXISTS "modo" TEXT NOT NULL DEFAULT 'pieza';
ALTER TABLE "ForestCubicacionTrozas" ADD COLUMN IF NOT EXISTS "volumenBruto" DECIMAL(14,4);
ALTER TABLE "ForestCubicacionTrozas" ADD COLUMN IF NOT EXISTS "descuentos" JSONB;
ALTER TABLE "ForestCubicacionTrozas" ADD COLUMN IF NOT EXISTS "referenciaSmalianM3" DECIMAL(14,4);
ALTER TABLE "ForestCubicacionTrozas" ADD COLUMN IF NOT EXISTS "cubicacionRefId" TEXT;
CREATE INDEX IF NOT EXISTS "ForestCubicacionTrozas_tenantId_origen_origenId_idx" ON "ForestCubicacionTrozas" ("tenantId", "origen", "origenId");
ALTER TABLE "ForestCubicacionTrozas" DROP CONSTRAINT IF EXISTS "ForestCubicacionTrozas_formula_chk";
ALTER TABLE "ForestCubicacionTrozas" ADD CONSTRAINT "ForestCubicacionTrozas_formula_v2_chk" CHECK ("formula" IN ('smalian', 'oxapampina', 'tablar'));
ALTER TABLE "ForestCubicacionTrozas" ADD CONSTRAINT "ForestCubicacionTrozas_material_chk" CHECK ("material" IN ('troza', 'aserrada'));
ALTER TABLE "ForestCubicacionTrozas" ADD CONSTRAINT "ForestCubicacionTrozas_modo_chk" CHECK ("modo" IN ('pieza', 'total') AND ("modo" = 'pieza' OR "material" = 'aserrada'));
ALTER TABLE "ForestCubicacionTrozas" ADD CONSTRAINT "ForestCubicacionTrozas_origen_chk" CHECK ("origen" IS NULL OR "origen" IN ('libre', 'ctp', 'loth', 'despacho'));
ALTER TABLE "ForestCubicacionTrozas" ADD CONSTRAINT "ForestCubicacionTrozas_tablar_chk" CHECK (("formula" = 'tablar') = ("material" = 'aserrada'));
ALTER TABLE "ForestCubicacionTrozas" ADD CONSTRAINT "ForestCubicacionTrozas_volumen_neto_chk" CHECK ("volumen" >= 0 AND ("volumenBruto" IS NULL OR "volumenBruto" >= "volumen"));
