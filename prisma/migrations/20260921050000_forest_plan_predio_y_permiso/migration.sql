-- ADR-426 · el plan dice CÓMO SE LE DICE, DE QUÉ PREDIO habla y CON QUÉ PERMISO.
--
-- Nueve columnas sobre `ForestPlan`, todas nullable y todas sin DEFAULT:
--
--   alias                  cómo lo llama Brandon («el PO del Aguajal»). El
--                          número oficial no se toca; esto es para reconocerlo
--                          en un selector (mismo criterio que ForestContrato.alias).
--   propietarioNombre      dueño del PREDIO, que no siempre es el titular del
--   propietarioDocTipo     título: en un PMFI sobre predio privado son dos
--   propietarioDoc         personas distintas. Nombres calcados de
--                          `ForestContrato.titularDoc/titularDocTipo`.
--   provincia / distrito   dónde cae el área de manejo. La carátula del libro
--                          (`ForestLothCaratula`) guarda el domicilio del
--                          TITULAR, que es otra cosa.
--   sector                 zona dentro del distrito. Hoy vive en el KV
--                          `loth-cartografia:{tenantId}` (`LothPredio.sector`),
--                          que es UNO POR TENANT: con dos planes en el mismo
--                          tenant (Blas tiene 2, main tiene 2) el segundo pisa
--                          al primero. Acá queda por plan, que es como se declara.
--   cuenca                 cuenca hidrográfica del área. No existía en ningún
--                          modelo del repo (grep sobre las 189 tablas: 0 hits).
--   contratoId             el permiso bajo el que se aprovecha (ADR-421). El
--                          vínculo inverso (`ForestContrato.planId`, ADR-425)
--                          es 1:1 y la cardinalidad real es 1 permiso : N
--                          planes —un permiso plurianual tiene un PO por año—,
--                          así que el lado bueno del vínculo es éste.
--
-- FASE: EXPAND puro. En PostgreSQL 11+ un ADD COLUMN nullable SIN default es
-- metadata-only: no reescribe la tabla y el AccessExclusiveLock dura
-- microsegundos. Medido antes de escribir esto: `ForestPlan` son 6 filas vivas
-- en 4 tenants y 64 kB en total, y no había ninguna transacción colgada
-- (`idle in transaction` = 0). El código viejo sigue andando porque ninguna
-- columna cambia de significado: NULL = «no se cargó».
--
-- NOT NULL: ninguna, ni después. `propietarioNombre` vacío no es «no tiene
-- dueño», es «no se preguntó»; y `cuenca` no la sabe nadie de memoria.
--
-- POR QUÉ sin `CREATE INDEX CONCURRENTLY`: 6 filas. El índice tarda
-- milisegundos y `CONCURRENTLY` obligaría a `--no-tx`, perdiendo la atomicidad
-- del archivo entero (mismo razonamiento que ADR-421). Revisar si pasa de ~100k.
--
-- Idempotente: se puede correr dos veces sin romper nada.
--
-- Aplicar:  node scripts/apply-sql.mjs prisma/migrations/20260921050000_forest_plan_predio_y_permiso/migration.sql --dry-run
--           node scripts/apply-sql.mjs prisma/migrations/20260921050000_forest_plan_predio_y_permiso/migration.sql
--           node scripts/prisma-session.mjs migrate resolve --applied 20260921050000_forest_plan_predio_y_permiso
--           npx prisma generate   # y REINICIAR el dev server (memoria prisma-generate-restart-dev)
--
-- ⚠️ `migrate deploy` NO se corre en este repo: el pooler en :6543 mata al
--    schema engine y hay 8 migraciones ajenas aplicadas a mano sin registrar
--    (verificado hoy contra `_prisma_migrations`: 74 carpetas, 69 registros).
--    Memoria `migracion-pooler-y-resolve-quirurgico`.
--
-- ROLLBACK: `rollback.sql`, en esta misma carpeta.

ALTER TABLE "ForestPlan"
  ADD COLUMN IF NOT EXISTS "alias"              TEXT,
  ADD COLUMN IF NOT EXISTS "propietarioNombre"  TEXT,
  ADD COLUMN IF NOT EXISTS "propietarioDocTipo" TEXT,
  ADD COLUMN IF NOT EXISTS "propietarioDoc"     TEXT,
  ADD COLUMN IF NOT EXISTS "provincia"          TEXT,
  ADD COLUMN IF NOT EXISTS "distrito"           TEXT,
  ADD COLUMN IF NOT EXISTS "sector"             TEXT,
  ADD COLUMN IF NOT EXISTS "cuenca"             TEXT,
  ADD COLUMN IF NOT EXISTS "contratoId"         TEXT;

-- El plan se busca por permiso («qué documentos declaré bajo este papel»), y
-- siempre dentro de un tenant: por eso el índice es compuesto, como las otras
-- siete tablas que cuelgan del contrato.
CREATE INDEX IF NOT EXISTS "ForestPlan_tenantId_contratoId_idx" ON "ForestPlan"("tenantId", "contratoId");

-- SIN foreign key, a propósito. `prisma/schema.prisma` declara `contratoId`
-- como ref. app-level (igual que `caratulaId` y que `ForestContrato.planId`), y
-- una FK que el schema no declara es drift: el próximo `migrate diff` la
-- borraría sola. Se ensayó con ROLLBACK antes de decidirlo, y ahí quedó medido
-- lo que la FK NO daba: un plan del tenant A aceptaba un contrato del tenant B
-- (una FK compara ids, no tenants). El guard va en `ForestPlanDB`: el contrato
-- tiene que ser del MISMO tenantId y estar vivo.

-- ── Backfill del vínculo que ya existía, pero al revés ──────────────────────
-- ADR-425 ató plan↔permiso por `ForestContrato.planId`. Esa columna es 1:1 y
-- la cardinalidad real es 1 permiso : N planes (un permiso plurianual tiene un
-- PO por año), así que el lado correcto es éste. Medido hoy: 0 de 12 contratos
-- vivos tienen `planId` — el backfill es un no-op, y queda por si alguien ata
-- un plan entre este archivo y su aplicación.
-- Cruza SIEMPRE por tenantId: dos tenants pueden tener ids ajenos en la mano.
UPDATE "ForestPlan" p
   SET "contratoId" = c."id"
  FROM "ForestContrato" c
 WHERE c."planId" = p."id"
   AND c."tenantId" = p."tenantId"
   AND c."deletedAt" IS NULL
   AND p."contratoId" IS NULL;
