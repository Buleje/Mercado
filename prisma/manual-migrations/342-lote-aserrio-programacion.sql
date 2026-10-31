-- ADR-342 · El lote de aserrío se PROGRAMA con los campos del formulario oficial
-- («Programar producción» del SNIFFS): orden, tipo de producto a consumir y la
-- ventana del proceso. Idempotente.

-- N° de orden de producción del centro. Texto libre: cada planta lo numera a su
-- manera y el SNIFFS lo acepta así.
ALTER TABLE "ForestLoteAserrio" ADD COLUMN IF NOT EXISTS "ordenProduccion" TEXT;

-- Qué materia prima se va a consumir (rolliza, aserrada, tablones…). Es lo que
-- el formulario oficial pide como «Tipo de producto a consumir» y lo que decide
-- qué piezas del patio se pueden meter en este lote.
ALTER TABLE "ForestLoteAserrio" ADD COLUMN IF NOT EXISTS "tipoProductoConsumir" TEXT;

-- La ventana del proceso: cuándo empieza y cuándo termina de aserrarse el lote.
-- Distinta de `fechaApertura` (cuándo se creó el registro) y de `fechaConsumo`
-- (cuándo entró de verdad a la sierra).
ALTER TABLE "ForestLoteAserrio" ADD COLUMN IF NOT EXISTS "inicioProceso" TIMESTAMP(3);
ALTER TABLE "ForestLoteAserrio" ADD COLUMN IF NOT EXISTS "finProceso" TIMESTAMP(3);

-- Buscar los lotes por su orden de producción es la consulta del jefe de planta.
CREATE INDEX IF NOT EXISTS "ForestLoteAserrio_tenant_orden_idx"
  ON "ForestLoteAserrio" ("tenantId", "ordenProduccion");
