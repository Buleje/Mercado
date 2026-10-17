-- 331 · El ubigeo de una persona, en columnas propias.
--
-- POR QUÉ. SUNAT devuelve departamento, provincia y distrito SEPARADOS y la
-- 330 los guardaba pegados dentro de `direccion`. Volver a partirlos después es
-- adivinar dónde termina la calle y empieza el distrito, y sin columnas propias
-- no se puede filtrar «los proveedores de Oxapampa» ni imprimir el ubigeo en el
-- lugar que le corresponde en un comprobante.
--
-- Todo NULLABLE e idempotente.

ALTER TABLE "AdelantoBeneficiario"
  ADD COLUMN IF NOT EXISTS "departamento" TEXT,
  ADD COLUMN IF NOT EXISTS "provincia" TEXT,
  ADD COLUMN IF NOT EXISTS "distrito" TEXT;
