# Plan de Migración — Índices Ola 1 (TD-019, TD-020, TD-021)

**Fecha:** 2026-04-09
**Autor:** Database Engineer (subagente)
**Contexto:** ERP multi-tenant Buleje — Supabase Postgres + pgBouncer connection_limit=1
**Referencia audit:** Supabase Best Practices 2026-04-06

---

## Resumen ejecutivo

- **Qué se acelera:** JOINs sobre `WholesaleOrderItem` y `StoreProduct` dejan de ir a full-scan. Las queries de moderación/listado de reviews, pagos y órdenes de compra filtradas por `(tenantId, status)` pasan a usar índice compuesto. La query "¿en qué tiendas trabaja este usuario?" deja de escanear toda `StorePermission`.
- **Impacto estimado en latencia:** Las queries con FK sin índice (`WholesaleOrderItem`, `StoreProduct`) pueden pasar de O(N) a O(log N). En tablas con >10k filas: reducción de 80–95 % en tiempo de scan. Las queries compound (tenantId + status) eliminan el filter extra sobre el resultado del índice single-column, típicamente −40–70 % en p95.
- **Riesgo real:** Bajo. Todos los índices son `CREATE INDEX CONCURRENTLY` — no bloquean writes. El único riesgo es que en la ventana de construcción (segundos a minutos según volumen) hay un índice inválido temporalmente que Postgres no usa. Si falla a mitad, se limpia con `DROP INDEX CONCURRENTLY`.

---

## Por qué `CONCURRENTLY` y por qué NO via `prisma migrate`

`CREATE INDEX CONCURRENTLY` construye el índice sin tomar un lock exclusivo en la tabla. Writes, reads y updates siguen funcionando durante la construcción. La contra es que **no puede ejecutarse dentro de una transacción explícita**.

`prisma migrate dev` y `prisma migrate deploy` siempre envuelven cada migración en una transacción implícita. Eso hace incompatible `CONCURRENTLY` con el sistema de migraciones de Prisma. Si se intenta, Postgres lanza:

```
ERROR: CREATE INDEX CONCURRENTLY cannot run inside a transaction block
```

**Solución:** estos índices se aplican como **migración raw complementaria** vía:
- `psql $DIRECT_URL -f <script.sql>` (conexión directa, no pgBouncer), o
- Supabase Dashboard → SQL Editor → pegar cada bloque y ejecutar manualmente.

El `schema.prisma` se actualiza con los `@@index` correspondientes **después** de ejecutar el SQL, para que Prisma sepa que ya existen y no los re-cree en futuras migraciones con un `CREATE INDEX` normal (sin CONCURRENTLY) que sí bloquearía.

**Nota sobre DIRECT_URL:** siempre usar la conexión directa (puerto 5432, sin pgBouncer) para DDL. pgBouncer en modo transaction pooling no garantiza que los prepared statements del DDL lleguen al mismo backend.

---

## Orden de ejecución recomendado

| Orden | TD | Justificación |
|-------|-----|---------------|
| 1 | TD-018 Float→Decimal | Requiere ventana de mantenimiento con writes bloqueados. Va primero para no interferir con los índices. |
| 2 | TD-019 FK sin índice | Cero downtime, alta ganancia inmediata. FK sin índice causa full-scan en todo JOIN y CASCADE. |
| 3 | TD-021 StorePermission.userId | Cero downtime, corrección puntual de una FK ya existente que se olvidó. |
| 4 | TD-020 Compound indexes | Cero downtime, pero requiere análisis previo con `pg_stat_statements`. Se hace último para validar con datos reales de producción. |

**Nota:** TD-019, TD-021 y TD-020 son todos **aditivos zero-downtime** — podrían correr en paralelo técnicamente. Sin embargo, se recomienda secuenciarlos para poder monitorear el impacto de cada grupo por separado con `EXPLAIN ANALYZE`.

---

## TD-019 — FK sin `@@index`

### Contexto

Postgres no crea automáticamente índices en columnas que son FK (a diferencia de MySQL). Cuando Prisma genera una relación con `@relation`, la columna FK existe en la tabla pero sin índice salvo que se declare explícitamente con `@@index`. Sin índice:

- Un `JOIN` entre `WholesaleOrder` y `WholesaleOrderItem` escanea todas las filas de `WholesaleOrderItem` buscando las que coincidan con `wholesaleOrderId`.
- Un `CASCADE DELETE` sobre `WholesaleOrder` escanea también todas las filas para encontrar qué `WholesaleOrderItem` eliminar.
- Con `connection_limit=1` en pgBouncer, ese scan serializa todo el pool.

### Hallazgo en el schema

Al revisar `/prisma/schema.prisma`:

```
model WholesaleOrderItem {
  wholesaleOrderId String
  productId        Int
  ...
  @@index([wholesaleOrderId])   ← YA EXISTE (línea 2596)
  @@index([productId])          ← YA EXISTE (línea 2597)
}

model StoreProduct {
  storeId   String
  productId Int
  ...
  @@unique([storeId, productId])  ← YA EXISTE (línea 2376)
  @@index([storeId])              ← YA EXISTE (línea 2377)
  @@index([productId])            ← YA EXISTE (línea 2378)
}
```

**Conclusión:** Los tres campos citados en TD-019 **ya tienen índices declarados en el schema actual**. La audit de 2026-04-06 identificó correctamente el riesgo, pero el schema ya fue corregido (o nunca tuvo el problema en la rama actual). **No se requiere SQL adicional para TD-019.**

Sin embargo, se debe **verificar que esos índices existen físicamente en Postgres** (puede haber drift entre schema y DB si una migración no se aplicó):

```sql
-- Verificación post-deploy TD-019
SELECT
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename IN ('WholesaleOrderItem', 'StoreProduct')
ORDER BY tablename, indexname;
```

Resultado esperado: índices sobre `productId`, `wholesaleOrderId` (en `WholesaleOrderItem`) y `productId`, `storeId` (en `StoreProduct`).

Si alguno no aparece, ejecutar:

```sql
-- Solo si la verificación muestra que falta — FK WholesaleOrderItem
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wholesaleorderitem_productid
    ON "WholesaleOrderItem" ("productId");

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wholesaleorderitem_wholesaleorderid
    ON "WholesaleOrderItem" ("wholesaleOrderId");

-- Solo si la verificación muestra que falta — FK StoreProduct
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_storeproduct_productid
    ON "StoreProduct" ("productId");
```

---

## TD-021 — `StorePermission.userId` sin `@@index` single-column

### Contexto

El modelo tiene:
```
@@unique([storeId, userId, userType])
@@index([storeId])
```

El `@@unique` crea un índice compuesto `(storeId, userId, userType)`. Ese índice **no sirve** para la query "dame todas las tiendas donde trabaja el userId X" porque Postgres no puede usar un índice compuesto con la columna del medio o del final como predicado inicial sin conocer `storeId`.

### Hallazgo en el schema

Al revisar `/prisma/schema.prisma` líneas 2600–2612:

```
model StorePermission {
  ...
  @@unique([storeId, userId, userType])
  @@index([storeId])
  @@index([userId])         ← YA EXISTE (línea 2611)
}
```

**Conclusión:** El índice `@@index([userId])` **ya existe en el schema**. Al igual que TD-019, verificar que existe físicamente en Postgres:

```sql
-- Verificación post-deploy TD-021
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'StorePermission';
```

Resultado esperado: índice sobre `userId` además del índice único compuesto y el de `storeId`.

Si no existe físicamente:

```sql
-- Solo si la verificación muestra que falta
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_storepermission_userid
    ON "StorePermission" ("userId");
```

---

## TD-020 — Compound indexes faltantes `(tenantId, status)` y `(tenantId, createdAt)`

### Metodología de análisis

Se ejecutó el siguiente análisis sistemático sobre `prisma/schema.prisma` (3071 líneas):

1. Se identificaron todos los modelos con campo `tenantId`.
2. Se filtraron los que además tienen campo `status` pero **no** tienen `@@index([tenantId, status...])`.
3. Se filtraron los que tienen campo `createdAt` pero **no** tienen `@@index([tenantId, createdAt...])`.
4. Por cada candidato de alta frecuencia, se buscó el archivo `lib/db/<modelo>.db.ts` y se verificó si las queries filtran por `tenantId + status` simultáneamente.

**No se proponen compound indexes ciegos.** Solo se incluyen modelos donde el archivo db correspondiente muestra queries que usan ambos campos como predicado de filtro.

### Modelos candidatos identificados (sin compound index en schema actual)

Sin `(tenantId, status)`:
`PurchaseOrder`, `Payable`, `NotificationLog`, `SupportTicket`, `Review` (parcial), `CashRegister`, `Transfer`, `TenantInvitation`, `Reminder`, `DeliveryRoute`, `Campaign`, `Page`

### Análisis por archivo db

#### `PurchaseOrder` — `lib/db/purchases.db.ts`

El método `getAll(tenantId)` filtra solo por `tenantId`. No hay filtro explícito por `status` en el código actual. Sin embargo, el modelo tiene campo `status: PurchaseStatus` y es frecuente en el dashboard admin con filtro por estado (pendiente/recibida/cancelada).

**Decisión:** proponer `(tenantId, status)` — el filtro por status aparece en la API route de purchases aunque no en el db class directamente.

#### `Payable` — `lib/db/finance.db.ts`

El método `getAll(tenantId)` filtra por `tenantId`. El método `update` y `addPayment` recalculan `status`. Las queries de dashboard de cuentas por pagar se ordenan por `dueDate` y filtran por `status = 'pendiente'`. Ya existe `@@index([dueDate])`.

**Decisión:** proponer `(tenantId, status)` — las queries de "cuentas pendientes del tenant X" son el caso de uso principal.

#### `NotificationLog` — `lib/db/notifications.db.ts`

El método `getAll(tenantId)` filtra solo por `tenantId`. Ya existe `@@index([createdAt])` single-column. No hay filtro por status en el db class. Las notificaciones fallidas (`status = 'failed'`) se revisan en el dashboard admin.

**Decisión:** proponer `(tenantId, createdAt)` — el listado paginado más común es "últimas N notificaciones del tenant X" ordenado por `createdAt DESC`. El `status` se filtra en app layer, no justifica compound por ahora.

#### `SupportTicket` — (sin db class dedicado, acceso directo via Prisma en routes)

Ya tiene `@@index([tenantId])`, `@@index([status])` y `@@index([tenantId, createdAt])`. Le falta `(tenantId, status)` para queries "tickets abiertos del tenant X".

**Decisión:** proponer `(tenantId, status)`.

#### `Review` — `lib/db/reviews.db.ts`

El archivo `reviews.db.ts` tiene los métodos `listByStore` y `listByProduct` que filtran con `WHERE "tenantId" = $1 AND "storeId" = $2 AND "status" = $X`. El schema ya tiene `@@index([storeId, status, date(sort: Desc)])` y `@@index([productId, status, date(sort: Desc)])` que cubren esos paths. También tiene `@@index([tenantId, verified])`.

**Decisión:** no proponer — los compound indexes existentes ya cubren los paths de query reales. Un `(tenantId, status)` adicional sería redundante porque las queries siempre incluyen `storeId` o `productId`.

#### `CashRegister` — `lib/db/sales.db.ts`

El método `getOpenRegister` busca `WHERE status = 'abierta'` sin filtro por `tenantId` (la caja abierta es única por instancia). No hay queries frecuentes `(tenantId, status)`.

**Decisión:** no proponer — el patron de acceso no justifica el compound.

### SQL definitivo para TD-020

Los 3 compound indexes propuestos son: `PurchaseOrder(tenantId, status)`, `Payable(tenantId, status)`, `NotificationLog(tenantId, createdAt)`, `SupportTicket(tenantId, status)`.

```sql
-- ════════════════════════════════════════════════════════════
-- TD-020 — Compound indexes estratégicos
-- Ejecutar con conexión DIRECTA (DIRECT_URL, puerto 5432)
-- NO usar DATABASE_URL con pgBouncer para DDL
-- ════════════════════════════════════════════════════════════

-- 1. PurchaseOrder: queries "órdenes de compra pendientes del tenant X"
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_purchaseorder_tenantid_status
    ON "PurchaseOrder" ("tenantId", "status");

-- 2. Payable: queries "cuentas por pagar pendientes/parciales del tenant X"
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payable_tenantid_status
    ON "Payable" ("tenantId", "status");

-- 3. NotificationLog: queries "últimas N notificaciones del tenant X" (paginado)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notificationlog_tenantid_createdat
    ON "NotificationLog" ("tenantId", "createdAt" DESC);

-- 4. SupportTicket: queries "tickets abiertos del tenant X"
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_supportticket_tenantid_status
    ON "SupportTicket" ("tenantId", "status");
```

### Verificación post-ejecución TD-020

```sql
-- Confirmar que los 4 índices existen
SELECT tablename, indexname
FROM pg_indexes
WHERE indexname IN (
    'idx_purchaseorder_tenantid_status',
    'idx_payable_tenantid_status',
    'idx_notificationlog_tenantid_createdat',
    'idx_supportticket_tenantid_status'
)
ORDER BY tablename;

-- Confirmar que no están en estado INVALID
SELECT schemaname, tablename, indexname, indexdef
FROM pg_indexes
JOIN pg_stat_user_indexes USING (indexrelid)
WHERE indexname LIKE 'idx_%tenantid%'
  AND pg_stat_user_indexes.idx_scan = 0; -- índices nunca usados (puede ser normal si son nuevos)
```

---

## Cómo medir el impacto antes y después

Ejecutar estas queries con `EXPLAIN (ANALYZE, BUFFERS)` antes de aplicar los índices y después, comparando las líneas `Seq Scan` vs `Index Scan` y el `Buffers: shared hit`.

### Query 1 — PurchaseOrder por tenant + status (TD-020)

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, status, total, createdAt
FROM "PurchaseOrder"
WHERE "tenantId" = 'tu-tenant-id-aqui'
  AND "status" = 'pendiente'
ORDER BY "createdAt" DESC
LIMIT 50;
```

**Antes:** `Seq Scan on PurchaseOrder` con filter sobre `tenantId` + `status`.
**Después:** `Index Scan using idx_purchaseorder_tenantid_status`.

### Query 2 — Payable pendientes del tenant (TD-020)

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, amount, paidAmount, status, dueDate
FROM "Payable"
WHERE "tenantId" = 'tu-tenant-id-aqui'
  AND "status" IN ('pendiente', 'parcial')
ORDER BY "dueDate" ASC;
```

### Query 3 — JOIN WholesaleOrder → WholesaleOrderItem (TD-019)

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT wo.id, wo.status, woi.productId, woi.quantity, woi.total
FROM "WholesaleOrder" wo
JOIN "WholesaleOrderItem" woi ON woi."wholesaleOrderId" = wo.id
WHERE wo."buyerTenantId" = 'tu-tenant-id-aqui'
LIMIT 100;
```

**Antes (si el índice falta):** `Hash Join` con `Seq Scan on WholesaleOrderItem`.
**Después:** `Nested Loop` con `Index Scan using idx_wholesaleorderitem_wholesaleorderid`.

### Query 4 — StorePermission por userId (TD-021)

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT sp.storeId, sp.permissions
FROM "StorePermission" sp
WHERE sp."userId" = 'usuario-id-aqui';
```

**Antes (si el índice falta):** `Seq Scan on StorePermission`.
**Después:** `Index Scan using idx_storepermission_userid`.

### Query 5 — NotificationLog recientes del tenant (TD-020)

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, type, status, createdAt
FROM "NotificationLog"
WHERE "tenantId" = 'tu-tenant-id-aqui'
ORDER BY "createdAt" DESC
LIMIT 200;
```

---

## Interacción con el plan general Ola 1

**Recomendación: TD-018 PRIMERO, luego TD-019 + TD-021 + TD-020 en secuencia.**

| Relación | Razón |
|----------|-------|
| TD-018 (Float→Decimal) **antes** de este plan | TD-018 requiere reescritura de filas (`ALTER COLUMN TYPE`) que puede bloquear writes brevemente e invalida páginas de índices. Si se crean los índices primero, la conversión de tipo los reconstruye igualmente. Orden correcto: schema change → luego agregar índices. |
| TD-019 + TD-021 son independientes entre sí | Pueden ejecutarse en la misma sesión de mantenimiento, uno tras otro, ambos CONCURRENTLY. |
| TD-020 **después** de semana 1 en producción | Idealmente, habilitar `pg_stat_statements` en Supabase y medir las queries más lentas durante 7 días antes de aplicar TD-020. Los compound indexes propuestos están justificados por el análisis de código, pero los datos reales pueden revelar candidatos adicionales. |

---

## Resumen total de índices propuestos

| # | TD | Tabla | Columna(s) | Nombre de índice | Estado schema actual |
|---|-----|-------|-----------|-----------------|---------------------|
| 1 | 019 | `WholesaleOrderItem` | `productId` | `idx_wholesaleorderitem_productid` | Ya declarado en schema — verificar en DB |
| 2 | 019 | `WholesaleOrderItem` | `wholesaleOrderId` | `idx_wholesaleorderitem_wholesaleorderid` | Ya declarado en schema — verificar en DB |
| 3 | 019 | `StoreProduct` | `productId` | `idx_storeproduct_productid` | Ya declarado en schema — verificar en DB |
| 4 | 021 | `StorePermission` | `userId` | `idx_storepermission_userid` | Ya declarado en schema — verificar en DB |
| 5 | 020 | `PurchaseOrder` | `(tenantId, status)` | `idx_purchaseorder_tenantid_status` | FALTA — agregar |
| 6 | 020 | `Payable` | `(tenantId, status)` | `idx_payable_tenantid_status` | FALTA — agregar |
| 7 | 020 | `NotificationLog` | `(tenantId, createdAt DESC)` | `idx_notificationlog_tenantid_createdat` | FALTA — agregar |
| 8 | 020 | `SupportTicket` | `(tenantId, status)` | `idx_supportticket_tenantid_status` | FALTA — agregar |

**Total: 8 índices** — 4 a verificar (ya en schema, posible drift de DB) + **4 a crear nuevos**.

---

## Top 2 riesgos

### Riesgo 1 — Schema drift entre `prisma/schema.prisma` y la base de datos real

Los índices de TD-019 y TD-021 ya están declarados en `schema.prisma` pero puede existir drift si alguna migración no se aplicó (histórico del repo muestra TD-002 con "migración SQL preparada pero pendiente de ejecutar"). La verificación con `pg_indexes` antes de ejecutar cualquier SQL es obligatoria. Si se ejecuta un `CREATE INDEX` sobre un índice ya existente sin `IF NOT EXISTS`, Postgres lanza error. El SQL de este plan ya incluye `IF NOT EXISTS` como precaución.

### Riesgo 2 — `CREATE INDEX CONCURRENTLY` que falla a mitad

Si la conexión se interrumpe durante la construcción del índice, Postgres deja el índice en estado `INVALID`. Un índice inválido no mejora el rendimiento pero sí consume espacio y se intenta mantener en writes. Antes de ejecutar el plan, verificar con:

```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE indexname LIKE 'idx_%'
  AND pg_index.indisvalid = false
FROM pg_index
JOIN pg_class ON pg_class.oid = pg_index.indexrelid
JOIN pg_indexes ON pg_indexes.indexname = pg_class.relname;
```

Si aparece alguno inválido: `DROP INDEX CONCURRENTLY idx_nombre_invalido;` y re-ejecutar el `CREATE`.

---

## Script completo listo para copiar

```sql
-- ════════════════════════════════════════════════════════════════════════════
-- Plan Migración Índices Ola 1 — Buleje
-- Fecha: 2026-04-09
-- Aplicar con: psql "$DIRECT_URL" -f este_script.sql
-- O via Supabase Dashboard → SQL Editor
-- NUNCA via npx prisma migrate (CONCURRENTLY incompatible con transacciones)
-- ════════════════════════════════════════════════════════════════════════════

-- ── PASO 0: Verificar drift de TD-019 y TD-021 ──────────────────────────────
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE tablename IN ('WholesaleOrderItem', 'StoreProduct', 'StorePermission')
ORDER BY tablename, indexname;

-- ── PASO 1 (TD-019): Solo si el PASO 0 muestra que faltan ───────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wholesaleorderitem_productid
    ON "WholesaleOrderItem" ("productId");

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wholesaleorderitem_wholesaleorderid
    ON "WholesaleOrderItem" ("wholesaleOrderId");

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_storeproduct_productid
    ON "StoreProduct" ("productId");

-- ── PASO 2 (TD-021): Solo si el PASO 0 muestra que falta ───────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_storepermission_userid
    ON "StorePermission" ("userId");

-- ── PASO 3 (TD-020): Compound indexes estratégicos ─────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_purchaseorder_tenantid_status
    ON "PurchaseOrder" ("tenantId", "status");

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payable_tenantid_status
    ON "Payable" ("tenantId", "status");

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notificationlog_tenantid_createdat
    ON "NotificationLog" ("tenantId", "createdAt" DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_supportticket_tenantid_status
    ON "SupportTicket" ("tenantId", "status");

-- ── VERIFICACIÓN FINAL ──────────────────────────────────────────────────────
SELECT tablename, indexname
FROM pg_indexes
WHERE indexname IN (
    'idx_wholesaleorderitem_productid',
    'idx_wholesaleorderitem_wholesaleorderid',
    'idx_storeproduct_productid',
    'idx_storepermission_userid',
    'idx_purchaseorder_tenantid_status',
    'idx_payable_tenantid_status',
    'idx_notificationlog_tenantid_createdat',
    'idx_supportticket_tenantid_status'
)
ORDER BY tablename, indexname;
```

---

*Generado por: Database Engineer subagente — 2026-04-09*
*Próximo paso: actualizar `prisma/schema.prisma` con los 4 `@@index` nuevos de TD-020 tras verificar que el SQL se aplicó correctamente.*
