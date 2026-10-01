-- ADR-311 — Línea de producción (casillero 7 del Cuadro Resumen 3 del LO-CTP):
-- LP = línea principal · LRE = línea de recuperación.
--
-- El Cuadro Resumen 3 se registra POR LOTE Y POR LÍNEA: sin este dato todas las
-- corridas caen en la línea principal y el balance de la línea de recuperación
-- (que es la que aprovecha los residuos) no se puede presentar.
--
-- Default 'LP' porque es lo que hace un aserradero salvo que active la línea de
-- recuperación; las corridas ya registradas son de la principal.
--
-- Idempotente. Aplicar vía scripts/apply-sql.mjs; luego `prisma generate` +
-- REINICIAR el dev server.
ALTER TABLE "ForestCtpEntry" ADD COLUMN IF NOT EXISTS "lineaProduccion" TEXT DEFAULT 'LP';

UPDATE "ForestCtpEntry"
   SET "lineaProduccion" = 'LP'
 WHERE section = 'produccion' AND "lineaProduccion" IS NULL;
