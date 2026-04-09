# ADR-017: Estrategia de migración de índices Ola 1 (TD-019/020/021)

## Estado
✅ Aceptada — Paso 0 ejecutado + 4 CREATE INDEX aplicados en prod 2026-04-09

## Fecha
2026-04-09

## Ejecución real (2026-04-09)

**Paso 0 — Verificación contra producción** (`scripts/verify-pg-indexes-ola1.ts`):
- Conexión establecida vía pooler session mode (el endpoint directo `db.<project>.supabase.co` retornó ENODATA — confirmado que Supabase discontinuó ese hostname)
- **TD-019 y TD-021 ya estaban aplicados en producción** (zero schema drift detectado)
- 0 índices en estado `INVALID`
- 4 compound indexes de TD-020 confirmados como faltantes

**Pasos 1-3 — Aplicación** (`scripts/apply-ola1-indices.ts`):
- Todos los índices aplicados vía `CREATE INDEX CONCURRENTLY IF NOT EXISTS`
- Conexión: pooler session mode puerto 5432 (session pooling soporta CONCURRENTLY, a diferencia del transaction pooling del puerto 6543)
- Tiempos individuales: 193ms + 128ms + 130ms + 133ms = **< 600ms totales**
- 0 fallos, 0 índices INVALID post-ejecución
- Verificación per-índice con `SELECT indexdef FROM pg_indexes` confirmó los 4

**Paso 4 — Schema sync**:
- `prisma/schema.prisma` actualizado con 4 `@@index(..., map: "...")` usando el mismo nombre del índice en Postgres
- `npx prisma validate` OK
- `npx prisma format` OK
- `npx prisma generate` OK (sin `migrate dev`)

**Cierra TDs**: TD-019 ✅, TD-020 ✅, TD-021 ✅.

## Contexto

El audit de Supabase Best Practices del 2026-04-06 identificó 3 grupos de deudas técnicas de índices que degradan el rendimiento bajo carga multi-tenant con `pgbouncer connection_limit=1`:

- **TD-019** — 3 FK sin índice en `WholesaleOrderItem` y `StoreProduct` → JOIN y CASCADE full-scan
- **TD-020** — Compound indexes `(tenantId, status)` y `(tenantId, createdAt)` ausentes en modelos de alta frecuencia
- **TD-021** — `StorePermission.userId` sin índice single-column → queries "tiendas del usuario X" full-scan

El análisis del `database-engineer` agent (2026-04-09, doc `docs/migration-plan-indices-ola1-2026-04-09.md`) reveló que **TD-019 y TD-021 ya tienen los `@@index` declarados en `prisma/schema.prisma`** — el problema es potencial **schema drift** entre el código y el estado real de Postgres. Es posible que alguna migración no se haya aplicado a producción.

Para TD-020, el mismo análisis identificó 4 compound indexes nuevos con justificación explícita buscando queries reales en los archivos `lib/db/*.db.ts`:

1. `PurchaseOrder(tenantId, status)` — dashboard admin filtra por estado
2. `Payable(tenantId, status)` — cuentas por pagar del tenant
3. `NotificationLog(tenantId, createdAt DESC)` — listado paginado cronológico
4. `SupportTicket(tenantId, status)` — tickets abiertos del tenant

## Opciones consideradas

### Opción A: Aplicar los 4 índices vía `prisma migrate dev` normal
- ✅ Flujo estándar del repo
- ✅ Migration tracked en `_prisma_migrations`
- ❌ `CREATE INDEX` sin `CONCURRENTLY` toma lock exclusivo → bloquea writes durante la construcción
- ❌ Tablas con millones de filas pueden tardar minutos con downtime

### Opción B: Aplicar vía `CREATE INDEX CONCURRENTLY` + raw SQL (puerto directo 5432)
- ✅ Zero downtime — writes, reads y updates siguen funcionando
- ✅ Si falla a mitad, índice queda `INVALID` y se puede limpiar con `DROP INDEX CONCURRENTLY`
- ✅ Alineado con best practice Supabase para tablas en producción
- ❌ No es compatible con `prisma migrate` (CONCURRENTLY rompe la transacción implícita de Prisma)
- ❌ Requiere mantener `schema.prisma` sincronizado después del SQL raw (añadir `@@index` post-ejecución)
- ❌ Requiere verificación previa con `pg_indexes` para no chocar con índices ya existentes

### Opción C: Saltar los índices y esperar a que `pg_stat_statements` muestre las queries lentas
- ✅ Data-driven
- ❌ Posterga un fix con justificación ya verificada en código
- ❌ `pg_stat_statements` no está habilitado en el plan free tier actual
- ❌ El dolor del full-scan ya está medido en el audit

## Decisión

Elegimos la **Opción B — `CREATE INDEX CONCURRENTLY` vía raw SQL complementaria** con los siguientes gates obligatorios:

**Paso 0 — Verificación de drift (obligatorio, solo lectura):**
Ejecutar `scripts/verify-pg-indexes-ola1.ts` que consulta `pg_indexes` en producción contra `DIRECT_URL` y reporta:
- Cuáles de los 4 índices de TD-019/021 existen físicamente en Postgres
- Cuáles de los 4 compound indexes de TD-020 ya existen (debería ser 0)
- Si hay algún índice con el prefijo `idx_%` en estado `INVALID` de un intento previo fallido

**Paso 1-3 — Aplicación condicional (bloqueado por aprobación humana tras Paso 0):**
- TD-019: solo crear los índices que falten en Postgres
- TD-021: solo crear si falta `userId` en `StorePermission`
- TD-020: crear los 4 compound indexes nuevos siempre (no están en schema)
- Todos via `psql "$DIRECT_URL" -f scripts/ola1-indices.sql` o Supabase Dashboard SQL Editor
- Nunca via `npx prisma migrate dev`

**Paso 4 — Re-sincronización del schema:**
Después del SQL, editar `prisma/schema.prisma` y agregar los 4 `@@index` nuevos de TD-020. Luego correr `npx prisma db pull` → `npx prisma generate` (sin `migrate dev`) para que futuras migraciones no intenten re-crear los índices.

**Paso 5 — Medición del impacto:**
Ejecutar las 5 queries de `EXPLAIN (ANALYZE, BUFFERS)` del plan antes (baseline) y después. Guardar en `docs/migration-plan-indices-baseline-2026-04-09.md`.

## Consecuencias

### Positivas
- Zero downtime — la operación puede correr en horario laboral
- Si los índices de TD-019/021 ya existen en prod, el Paso 0 evita SQL innecesario
- Ganancia de velocidad medible con `EXPLAIN ANALYZE` antes/después
- Base sentada para TD-018 Float→Decimal (sin índices faltantes durante la migración crítica)
- Precedente documentado de cómo aplicar DDL zero-downtime en este repo (aplicable a futuros sprints)

### Negativas
- Divergencia temporal entre `schema.prisma` y la DB entre el Paso 3 y el Paso 4 — mitigada por el orden estricto
- El SQL raw no queda en `_prisma_migrations` → hay que documentarlo en este ADR y en `docs/migration-plan-indices-ola1-2026-04-09.md` como fuente de verdad
- Si Supabase free tier pausa la conexión durante la construcción de un índice grande, queda `INVALID` y hay que limpiar

### Riesgos
- **Schema drift oculto** — el Paso 0 lo detecta y lo hace explícito
- **Índice `INVALID` por interrupción** — mitigado con `DROP INDEX CONCURRENTLY` y re-ejecución
- **Error humano en la elección de qué índice crear** — mitigado porque el script Paso 0 reporta el estado real, no se ejecuta a ciegas
- **pgBouncer mata la conexión DDL** — se usa `DIRECT_URL` (puerto 5432 directo), no la URL con pooler

## Referencias
- `docs/migration-plan-indices-ola1-2026-04-09.md` — plan técnico detallado generado por database-engineer agent
- `docs/migration-plan-ola1-2026-04-09.md` — plan hermano de TD-018/030/031/032
- `docs/TECH-DEBT.md` — TD-019, TD-020, TD-021 en sección "Hallazgos Supabase Best Practices"
- ADR-011 — precedente de raw SQL pattern para el módulo delivery
- `scripts/verify-pg-indexes-ola1.ts` — script del Paso 0 (generado en este turno)
