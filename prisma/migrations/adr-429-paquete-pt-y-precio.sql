-- Declarar producción sin lote: el paquete guarda su PT y su precio de venta (ADR-429).
--
-- EXPAND puro: dos columnas NULLABLE, sin default. En Postgres es un cambio de
-- catálogo (no reescribe la tabla) y el código viejo no las lee: toda fila que
-- ya existe queda con NULL, que es exactamente «no se guardó» — el lector cae
-- al cálculo de siempre (PT desde el m³).
--
-- POR QUÉ:
--  · `pieTablar`: el servidor recalculaba el PT desde el m³ (`ptDesdeM3`) y el
--    redondeo del m³ a 3 decimales corría ±0,21 PT por paquete. Con el PT que
--    se midió al cubicar guardado, PT × precio cuadra con el importe del cargo.
--  · `precioVentaPt`: S/ por pie tablar de la madera PROPIA, por especie. Sirve
--    para valorizar lo producido y para proponerlo al despachar. NULL = sin
--    precio; nunca 0 («no sé» no es «vale cero»).
--
-- Sin CHECK (> 0) a propósito: `ADD CONSTRAINT` no admite IF NOT EXISTS y este
-- archivo tiene que poder correrse dos veces. El > 0 lo exige el Zod del pedido
-- (`produccionSinLoteSchema`) y la DB class.
--
-- Para revertir (contar primero qué se perdería):
--   SELECT count(*) FROM "ForestCtpPaquete" WHERE "pieTablar" IS NOT NULL OR "precioVentaPt" IS NOT NULL;
--   ALTER TABLE "ForestCtpPaquete" DROP COLUMN IF EXISTS "pieTablar", DROP COLUMN IF EXISTS "precioVentaPt";
--
-- Uso: node scripts/apply-sql.mjs prisma/migrations/adr-429-paquete-pt-y-precio.sql

ALTER TABLE "ForestCtpPaquete" ADD COLUMN IF NOT EXISTS "pieTablar" DECIMAL(12,2);
ALTER TABLE "ForestCtpPaquete" ADD COLUMN IF NOT EXISTS "precioVentaPt" DECIMAL(10,4);
