-- Etiquetas QR de las trozas: el sello de impresión (ADR-436).
--
-- EXPAND puro, dos columnas:
--  · "etiquetadaEn" TIMESTAMP NULL — cuándo se imprimió por última vez la
--    etiqueta de la pieza. NULL = nunca. Cambio de catálogo, no reescribe.
--  · "etiquetasImpresas" INTEGER NOT NULL DEFAULT 0 — cuántas veces. Con un
--    DEFAULT constante Postgres 11+ tampoco reescribe la tabla (el default vive
--    en el catálogo), y el código viejo no la lee ni la escribe: un INSERT que
--    no la nombra recibe 0.
--
-- NO se crea el índice único (tenantId, codigoPlanta) del ADR-336: en `main`
-- el código «118» está en dos piezas y la decisión de cuál conserva la marca
-- es de Brandon. Lo crea `WoodEntriesDB.intentarCandadoCodigoPlanta` cuando no
-- quede ningún repetido.
--
-- Para revertir (contar primero qué se perdería):
--   SELECT count(*) FROM "WoodEntryTroza" WHERE "etiquetadaEn" IS NOT NULL OR "etiquetasImpresas" > 0;
--   ALTER TABLE "WoodEntryTroza" DROP COLUMN IF EXISTS "etiquetadaEn", DROP COLUMN IF EXISTS "etiquetasImpresas";
--
-- Uso: node scripts/prisma-session.mjs db execute --file prisma/migrations/adr-436-etiquetas-de-trozas.sql

ALTER TABLE "WoodEntryTroza" ADD COLUMN IF NOT EXISTS "etiquetadaEn" TIMESTAMP(3);
ALTER TABLE "WoodEntryTroza" ADD COLUMN IF NOT EXISTS "etiquetasImpresas" INTEGER NOT NULL DEFAULT 0;
