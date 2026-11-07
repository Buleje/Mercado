-- ADR-336 · La recepción, pieza por pieza + los datos del documento que ampara
-- el ingreso (propietario del producto, destinatario, transportista). Idempotente.

-- Cuándo bajó ESTA pieza del camión. El ingreso ya tiene su `fechaRecepcion`
-- (ADR-335), pero una guía de 60 trozas se descarga en dos viajes: el saldo del
-- patio del lunes no puede incluir la madera que llegó el miércoles.
ALTER TABLE "WoodEntryTroza" ADD COLUMN IF NOT EXISTS "fechaRecepcion" TIMESTAMP(3);

-- El cuerpo de la GTF que trajo la madera: propietario del producto (13-21),
-- destinatario (22-28), transportista y vehículo (29-34), comprobante y
-- casilleros sueltos. Misma forma que `ForestCtpEntry.gtfDatos` (la guía de
-- salida) — un solo esquema Zod para los dos lados del libro.
ALTER TABLE "WoodEntry" ADD COLUMN IF NOT EXISTS "gtfDatos" JSONB;

-- Un código de planta es la marca física que se pinta sobre la troza: dos
-- piezas con el mismo número son dos piezas que el patio no puede distinguir.
-- El índice se crea SÓLO si los datos ya lo permiten: renumerar a ciegas una
-- troza cuyo código está pintado en la madera rompería la correspondencia con
-- la pila. Mientras haya duplicados históricos manda el guard app-level
-- (WoodEntriesDB.create / actualizarRecepcion), que impide crear nuevos.
DO $$
DECLARE repetidos INT;
BEGIN
  SELECT COUNT(*) INTO repetidos FROM (
    SELECT "tenantId", "codigoPlanta"
    FROM "WoodEntryTroza"
    WHERE "codigoPlanta" IS NOT NULL AND "codigoPlanta" <> ''
    GROUP BY 1, 2 HAVING COUNT(*) > 1
  ) x;

  IF repetidos = 0 THEN
    CREATE UNIQUE INDEX IF NOT EXISTS "WoodEntryTroza_tenant_codigoPlanta_key"
      ON "WoodEntryTroza" ("tenantId", "codigoPlanta")
      WHERE "codigoPlanta" IS NOT NULL AND "codigoPlanta" <> '';
    RAISE NOTICE 'Índice único de codigoPlanta creado.';
  ELSE
    RAISE NOTICE 'NO se creó el índice único: hay % código(s) de planta repetido(s). Limpialos y volvé a correr esta migración.', repetidos;
  END IF;
END $$;

-- El patio busca por código de planta y por fecha de recepción.
CREATE INDEX IF NOT EXISTS "WoodEntryTroza_tenant_fechaRecepcion_idx"
  ON "WoodEntryTroza" ("tenantId", "fechaRecepcion");
