-- ADR-516 (2.ª parte) — El trigger del código de documento no se traba nunca.
--
-- Revisión de security (24-10) sobre 20261024a_documento_codigo_adr516:
--  · MEDIO: si el contador queda DEBAJO de un código que ya existe (su fila
--    borrada, un código explícito en un negocio sin contador, un cambio a mano),
--    `ultimo + 1` choca con "Document_tenantId_codigo_key", el INSERT falla y
--    deshace la suma → TODAS las altas siguientes del negocio fallan (también
--    las de la producción vieja). Ahora el siguiente es
--    GREATEST(ultimo, MAX(codigo) del negocio) + 1 (el MAX lo resuelve el índice
--    único), y el código explícito crea o sube el contador.
--  · BAJO: `tags` admite NULL y `NULL && ARRAY[…]` es NULL → `COALESCE`.
--  · BAJO: un alta en el mismo instante en que corre el relleno quedaba sin
--    código. El camino «negocio sin contador visible» y el relleno toman el mismo
--    candado consultivo por negocio: el alta espera a que el relleno confirme y
--    sale numerada a continuación.
--
-- Sólo reemplaza la función (el trigger ya la llama por nombre). Idempotente.
-- Aplicar: node -r dotenv/config scripts/aplicar-migracion-sesion.mjs <este .sql> [--ensayo] dotenv_config_path=.env.local
CREATE OR REPLACE FUNCTION "documento_asignar_codigo"() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  -- Código que ya viene (restaurar un respaldo): se respeta y el contador queda
  -- en él como mínimo. Crea el contador si no había: así el número no se
  -- reutiliza aunque ese papel se borre antes del relleno.
  IF NEW."codigo" IS NOT NULL THEN
    INSERT INTO "DocumentCodigoContador" ("tenantId", "ultimo")
    VALUES (NEW."tenantId", NEW."codigo")
    ON CONFLICT ("tenantId") DO UPDATE
       SET "ultimo" = GREATEST("DocumentCodigoContador"."ultimo", EXCLUDED."ultimo"),
           "updatedAt" = CURRENT_TIMESTAMP
     WHERE "DocumentCodigoContador"."ultimo" < EXCLUDED."ultimo";
    RETURN NEW;
  END IF;

  -- Fotos de máquina (= TAGS_FOTOS_DE_MAQUINA; un test fija que coincidan): sin código.
  IF COALESCE(NEW."tags", '{}') && ARRAY['personas', 'asistencia']::TEXT[] THEN
    RETURN NEW;
  END IF;

  -- Camino de todos los días: negocio con contador. El candado de su fila ordena
  -- las altas simultáneas; el MAX es el piso por si el contador quedó atrás.
  UPDATE "DocumentCodigoContador"
     SET "ultimo" = GREATEST(
           "ultimo",
           COALESCE((SELECT MAX(d."codigo") FROM "Document" d WHERE d."tenantId" = NEW."tenantId"), 0)
         ) + 1,
         "updatedAt" = CURRENT_TIMESTAMP
   WHERE "tenantId" = NEW."tenantId"
  RETURNING "ultimo" INTO NEW."codigo";
  IF FOUND THEN
    RETURN NEW;
  END IF;

  -- Sin contador visible: negocio nuevo, negocio viejo sin relleno, o el relleno
  -- corriendo ahora mismo (su contador todavía no está confirmado). Mismo candado
  -- que el relleno; después se mira de nuevo (cada sentencia ve lo confirmado).
  PERFORM pg_advisory_xact_lock(hashtextextended('documento_codigo:' || NEW."tenantId", 516));

  UPDATE "DocumentCodigoContador"
     SET "ultimo" = GREATEST(
           "ultimo",
           COALESCE((SELECT MAX(d."codigo") FROM "Document" d WHERE d."tenantId" = NEW."tenantId"), 0)
         ) + 1,
         "updatedAt" = CURRENT_TIMESTAMP
   WHERE "tenantId" = NEW."tenantId"
  RETURNING "ultimo" INTO NEW."codigo";
  IF FOUND THEN
    RETURN NEW;
  END IF;

  -- Negocio viejo con papeles sin numerar: espera al relleno (si numerara ya,
  -- lo nuevo quedaría antes que lo viejo).
  IF EXISTS (
    SELECT 1 FROM "Document" d
     WHERE d."tenantId" = NEW."tenantId"
       AND d."codigo" IS NULL
       AND NOT (COALESCE(d."tags", '{}') && ARRAY['personas', 'asistencia']::TEXT[])
  ) THEN
    RETURN NEW;
  END IF;

  -- Negocio nuevo (o contador perdido sin papeles pendientes): crea el contador
  -- y sigue desde el código más alto que exista.
  INSERT INTO "DocumentCodigoContador" ("tenantId", "ultimo")
  VALUES (NEW."tenantId", 0)
  ON CONFLICT ("tenantId") DO NOTHING;

  UPDATE "DocumentCodigoContador"
     SET "ultimo" = GREATEST(
           "ultimo",
           COALESCE((SELECT MAX(d."codigo") FROM "Document" d WHERE d."tenantId" = NEW."tenantId"), 0)
         ) + 1,
         "updatedAt" = CURRENT_TIMESTAMP
   WHERE "tenantId" = NEW."tenantId"
  RETURNING "ultimo" INTO NEW."codigo";
  RETURN NEW;
END;
$fn$;
