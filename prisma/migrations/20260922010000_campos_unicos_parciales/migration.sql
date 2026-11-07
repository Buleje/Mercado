-- ADR-427 · La misma pregunta no se repite: índices únicos PARCIALES.
--
-- El `@@unique(tenantId, formulario, clave, soloParaRegistroId)` NO alcanzaba:
-- en los campos permanentes esa columna es NULL y Postgres trata **cada NULL
-- como distinto**, así que dos permanentes con la misma clave entraban los dos
-- (verificado creando dos `fecha-de-descarga` vivas por API). Mismo caso que
-- `ForestLoteAserrio` (ADR-396) y `ForestContrato` (ADR-421): el unique real es
-- parcial y Prisma no sabe expresarlo, así que vive acá.
--
-- Además excluyen lo dado de baja: un campo apagado no puede dejar su clave
-- bloqueada para siempre.
CREATE UNIQUE INDEX IF NOT EXISTS "CampoPersonalizado_permanente_unico"
  ON "CampoPersonalizado"("tenantId", "formulario", "clave")
  WHERE "soloParaRegistroId" IS NULL AND "deletedAt" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "CampoPersonalizado_temporal_unico"
  ON "CampoPersonalizado"("tenantId", "formulario", "clave", "soloParaRegistroId")
  WHERE "soloParaRegistroId" IS NOT NULL AND "deletedAt" IS NULL;

-- El `@@unique` total que ya existía se DEJA: no molesta (los parciales son más
-- estrictos) y sacarlo pediría un DROP que el guard del repo bloquea con razón.
-- Lo que manda es lo de arriba.
