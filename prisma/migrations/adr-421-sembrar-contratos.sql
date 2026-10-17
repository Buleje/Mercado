-- ADR-421 · fase MIGRATE — sembrar los contratos desde el libro e imputar la
-- madera que YA declara su código.
--
-- NO es parte del EXPAND (`20260918190000_forest_contrato_eje/migration.sql`),
-- que no toca una sola fila. Esto se corre DESPUÉS, aparte, cuando Brandon mira
-- el preview y confirma — como dice la consecuencia del ADR: «el sembrado desde
-- los códigos existentes es un paso aparte, revisable».
--
-- ⚠️ ESTE ARCHIVO ESCRIBE DATOS (INSERT + UPDATE). Es idempotente y nunca pisa
-- una imputación hecha a mano (`WHERE "contratoId" IS NULL`), pero se aplica con
-- los ojos abiertos y sobre un solo tenant a la vez si hace falta (agregar
-- `AND "tenantId" = '<id>'`; sin filtro siembra todos los que tengan códigos).
--
-- ── PREVIEW obligatorio antes de aplicar (lectura pura) ──────────────────────
--   SELECT upper(btrim(regexp_replace(codigo, '\s+', ' ', 'g'))) AS norm,
--          count(*) AS filas, string_agg(DISTINCT fuente, ', ') AS fuentes
--     FROM (
--       SELECT "tenantId", "originCode" codigo, 'ingresos' fuente FROM "WoodEntry"
--        WHERE "originCode" IS NOT NULL AND btrim("originCode") <> ''
--       UNION ALL SELECT "tenantId", "originCode", 'produccion' FROM "ForestCtpEntry"
--        WHERE "originCode" IS NOT NULL AND btrim("originCode") <> ''
--       UNION ALL SELECT "tenantId", "permiso", 'lotes' FROM "ForestLoteAserrio"
--        WHERE "permiso" IS NOT NULL AND btrim("permiso") <> ''
--     ) s
--    WHERE "tenantId" = '<id del tenant>'
--    GROUP BY 1 ORDER BY 2 DESC;
--
--   Medido el 2026-09-18 en `inversiones-agroforestales-blas-sociedad-anonima`
--   (id `cmpxiv6p4000bohvzwl6bnfpv`): 7 códigos distintos sobre 36 filas.
--     10-HUA-PUE/PER-FMP-2026-007  22 filas  (ingresos + lotes)
--     19-SEC/REG-PLT-2018-020       6        (ingresos + produccion + lotes)
--     19-SEC/REG-PLT-2026-032       3        (produccion + lotes)
--     19-SEC/REG-PLT-2021-017       2        (ingresos)
--     19-SEC/REG-PLT-2025-096       1        (produccion)
--     19-SEC/REG-PLT-2026-033       1        (produccion)
--     99-XXX/NO-EXISTE-2026-999     1        (lotes)  ← basura de un typo
--   El último NO se filtra acá: borrarlo en silencio escondería que existe. Nace
--   como contrato con `notas` que dicen de dónde salió, se ve en pantalla y se
--   da de baja a mano (o se corrige el lote que lo escribió).
--
-- Uso: node scripts/apply-sql.mjs prisma/migrations/adr-421-sembrar-contratos.sql --dry-run
--      node scripts/apply-sql.mjs prisma/migrations/adr-421-sembrar-contratos.sql
--
-- Deshacer SÓLO este paso (deja el EXPAND en pie):
--   UPDATE "WoodEntry"         SET "contratoId" = NULL WHERE "contratoId" LIKE 'ctr\_%';
--   UPDATE "ForestCtpEntry"    SET "contratoId" = NULL WHERE "contratoId" LIKE 'ctr\_%';
--   UPDATE "ForestLoteAserrio" SET "contratoId" = NULL WHERE "contratoId" LIKE 'ctr\_%';
--   DELETE FROM "ForestContrato" WHERE id LIKE 'ctr\_%';

-- ─────────────────────────────────────────────────────────────────────────────
-- 1 · Un contrato por cada código distinto que ya está escrito en el libro
-- ─────────────────────────────────────────────────────────────────────────────
-- El `id` es DETERMINÍSTICO (`ctr_` + md5 de tenant|código normalizado): volver
-- a correr esto resuelve al mismo id, y `ctr_` distingue de un golpe lo sembrado
-- de lo cargado a mano (que nace con cuid desde Prisma). La columna es TEXT y
-- convive con las dos formas.
--
-- `titularNombre` es NOT NULL y el código no lo dice. Sale del `providerName`
-- de las guías que declaran ese código — el nombre que ya está escrito en el
-- libro, no uno inventado. Medido en el tenant real: los 3 códigos que aparecen
-- en ingresos tienen UN solo proveedor cada uno (21/1/2 guías), así que no hay
-- empate que resolver. Los que sólo aparecen en producción o en lotes no tienen
-- de dónde sacarlo y quedan en `(por confirmar)`: un titular inventado en un
-- papel que se muestra a una autoridad es peor que un campo que pide revisión.
INSERT INTO "ForestContrato" (
  "id", "tenantId", "codigo", "codigoNorm", "titularNombre", "tipo",
  "estado", "isActive", "createdBy", "createdAt", "updatedAt", "notas"
)
WITH codigos AS (
  SELECT "tenantId", "originCode" AS codigo FROM "WoodEntry"
   WHERE "originCode" IS NOT NULL AND btrim("originCode") <> ''
  UNION ALL
  SELECT "tenantId", "originCode" FROM "ForestCtpEntry"
   WHERE "originCode" IS NOT NULL AND btrim("originCode") <> ''
  UNION ALL
  SELECT "tenantId", "permiso" FROM "ForestLoteAserrio"
   WHERE "permiso" IS NOT NULL AND btrim("permiso") <> ''
),
normalizados AS (
  -- Brandon eligió sembrar sólo los permisos buenos (2026-09-18): el typo
  -- `99-XXX/NO-EXISTE-2026-999` y cualquier otro código de prueba quedan
  -- AFUERA. No se pierde nada: la fila que lo escribió sigue con su texto y
  -- aparece en `?candidatos=1` hasta que alguien corrija el código.
  SELECT "tenantId",
         upper(btrim(regexp_replace(codigo, '\s+', ' ', 'g'))) AS norm,
         -- El `codigo` que se muestra: la primera escritura, tal cual la tipearon.
         min(btrim(codigo)) AS codigo,
         count(*)           AS filas
    FROM codigos
   WHERE upper(btrim(codigo)) !~ '(TEST|PRUEBA|NO-EXISTE|XXX|DEMO|AUDIT|INVENTADO|FAKE|EJEMPLO|SAMPLE|DUMMY|BORRAR)'
     AND length(btrim(codigo)) >= 6
   GROUP BY 1, 2
),
titulares AS (
  SELECT DISTINCT ON ("tenantId", norm) "tenantId", norm, "providerName"
    FROM (
      SELECT "tenantId",
             upper(btrim(regexp_replace("originCode", '\s+', ' ', 'g'))) AS norm,
             "providerName",
             count(*) AS n
        FROM "WoodEntry"
       WHERE "originCode" IS NOT NULL AND btrim("originCode") <> ''
         AND "providerName" IS NOT NULL AND btrim("providerName") <> ''
       GROUP BY 1, 2, 3
    ) s
   ORDER BY "tenantId", norm, n DESC, "providerName"
)
SELECT
  'ctr_' || substr(md5(n."tenantId" || '|' || n.norm), 1, 22),
  n."tenantId",
  n.codigo,
  n.norm,
  COALESCE(t."providerName", '(por confirmar)'),
  -- El tipo se deduce del propio código y se corrige a mano si hace falta.
  CASE
    WHEN n.norm LIKE '%PER-FMP%'  THEN 'PER-FMP'
    WHEN n.norm LIKE '%REG-PLT%'  THEN 'REG-PLT'
    WHEN n.norm LIKE '%DEMA%'     THEN 'DEMA'
    WHEN n.norm LIKE '%CONTRATO%' THEN 'CONTRATO'
    ELSE NULL
  END,
  'vigente',
  true,
  'sistema',
  CURRENT_TIMESTAMP,
  -- `updatedAt` NO tiene DEFAULT en la tabla (Prisma lo pone desde el cliente
  -- por `@updatedAt`): en SQL crudo hay que escribirlo o el INSERT falla.
  CURRENT_TIMESTAMP,
  'Sembrado de los ' || n.filas || ' registros que ya declaraban este código en el libro (ADR-421). '
    || CASE WHEN t."providerName" IS NULL
            THEN 'Titular SIN confirmar: el código sólo aparece en producción o en lotes. '
            ELSE 'Titular tomado del proveedor de las guías. ' END
    || 'Revisar titular, resolución y vigencia antes de usarlo en el balance.'
  FROM normalizados n
  LEFT JOIN titulares t ON t."tenantId" = n."tenantId" AND t.norm = n.norm
-- El unique es PARCIAL (`WHERE "deletedAt" IS NULL`, ver la corrección del
-- 2026-09-18): un ON CONFLICT sin el mismo predicado no encuentra el índice y
-- Postgres corta con «no unique or exclusion constraint matching».
ON CONFLICT ("tenantId", "codigoNorm") WHERE "deletedAt" IS NULL DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2 · Imputar lo que ya declara su código — y SÓLO eso
-- ─────────────────────────────────────────────────────────────────────────────
-- `WHERE "contratoId" IS NULL`: una fila que ya tiene contrato elegido por una
-- persona no se pisa nunca, ni volviendo a correr esto. El texto original
-- (`originCode` / `permiso`) NO se toca: sigue siendo lo que se declara ante
-- SERFOR (ADR-421 §3); `contratoId` es el vínculo interno.
UPDATE "WoodEntry" w
   SET "contratoId" = c."id"
  FROM "ForestContrato" c
 WHERE w."contratoId" IS NULL
   AND w."originCode" IS NOT NULL AND btrim(w."originCode") <> ''
   AND c."tenantId" = w."tenantId"
   AND c."deletedAt" IS NULL
   AND c."codigoNorm" = upper(btrim(regexp_replace(w."originCode", '\s+', ' ', 'g')));

UPDATE "ForestCtpEntry" e
   SET "contratoId" = c."id"
  FROM "ForestContrato" c
 WHERE e."contratoId" IS NULL
   AND e."originCode" IS NOT NULL AND btrim(e."originCode") <> ''
   AND c."tenantId" = e."tenantId"
   AND c."deletedAt" IS NULL
   AND c."codigoNorm" = upper(btrim(regexp_replace(e."originCode", '\s+', ' ', 'g')));

UPDATE "ForestLoteAserrio" l
   SET "contratoId" = c."id"
  FROM "ForestContrato" c
 WHERE l."contratoId" IS NULL
   AND l."permiso" IS NOT NULL AND btrim(l."permiso") <> ''
   AND c."tenantId" = l."tenantId"
   AND c."deletedAt" IS NULL
   AND c."codigoNorm" = upper(btrim(regexp_replace(l."permiso", '\s+', ' ', 'g')));

-- `Expense`, `Adelanto`, `ForestFlete` y `ForestCuentaMov` NO se backfillean: no
-- tienen ningún campo donde el código del permiso esté escrito, así que
-- cualquier regla sería una suposición — y son justo la plata que hoy no se
-- puede atribuir a ningún papel (S/ 20 962 según el ADR). Se imputan desde la
-- pantalla; este contador mide el avance real:
--   SELECT 'Expense' t, count(*) FILTER (WHERE "contratoId" IS NULL) sin_contrato, count(*) total
--     FROM "Expense" WHERE "tenantId" = '<id>'
--   UNION ALL SELECT 'Adelanto',        count(*) FILTER (WHERE "contratoId" IS NULL), count(*) FROM "Adelanto"        WHERE "tenantId" = '<id>'
--   UNION ALL SELECT 'ForestFlete',     count(*) FILTER (WHERE "contratoId" IS NULL), count(*) FROM "ForestFlete"     WHERE "tenantId" = '<id>'
--   UNION ALL SELECT 'ForestCuentaMov', count(*) FILTER (WHERE "contratoId" IS NULL), count(*) FROM "ForestCuentaMov" WHERE "tenantId" = '<id>';
--
-- Verificación después de aplicar (los tres números tienen que cerrar):
--   SELECT count(*) FROM "ForestContrato" WHERE "tenantId" = '<id>';                       -- 7 en el tenant real
--   SELECT count(*) FROM "WoodEntry"      WHERE "tenantId" = '<id>' AND "contratoId" IS NOT NULL;  -- 24
--   SELECT c."codigoNorm", count(w.id) FROM "ForestContrato" c
--     LEFT JOIN "WoodEntry" w ON w."contratoId" = c."id"
--    WHERE c."tenantId" = '<id>' GROUP BY 1 ORDER BY 2 DESC;
