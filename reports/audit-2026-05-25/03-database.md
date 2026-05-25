# Auditoría Capa de Datos — Buleje 2026-05-25

> Scope: `prisma/schema.prisma` (172 modelos) + `lib/db/*.db.ts` (~90 clases).
> Metodología: lectura directa de archivos + grep de patrones + cruce con schema.
> Verificación: cada hallazgo tiene evidencia `archivo:línea` + snippet real.

---

## Resumen ejecutivo

| Severidad | Hallazgos |
|-----------|-----------|
| **P0** | 4 |
| **P1** | 7 |
| **P2** | 6 |
| **Total** | 17 |

---

## P0 — Crítico (impacto en seguridad o rendimiento de rutas calientes)

### P0-001 · RecommendationsDB.forPhone sin tenantId — cross-tenant data leak

**Archivo:** `lib/db/recommendations.db.ts:39`

```typescript
// lib/db/recommendations.db.ts:39-50
const allProducts = await prisma.product.findMany({
  where: { active: true },   // ← SIN tenantId — devuelve productos de TODOS los tenants
  select: { id: true, name: true, category: true, price: true, image: true, unit: true, stock: true },
});
```

El método `forPhone` carga en memoria el catálogo completo de la plataforma (todos los tenants). Un cliente de la bodega A puede recibir recomendaciones con productos de la bodega B. En producción multi-tenant esto es un leak de datos entre competidores. El endpoint `GET /api/recommendations` no pasa `tenantId` al método (confirmado en `app/api/recommendations/route.ts:23`).

**Impacto adicional:** en un sistema con 200 tenants × 500 productos = 100.000 filas cargadas en RAM por cada petición de recomendaciones.

**Fix:**
```typescript
// Agregar tenantId como primer parámetro obligatorio
async forPhone(tenantId: string, opts: RecommendOpts = {}): Promise<RecommendedProduct[]> {
  const allProducts = await prisma.product.findMany({
    where: { active: true, tenantId, deletedAt: null },  // ← AÑADIR tenantId
    ...
  });
  // También propagar tenantId a los orderItem/saleItem queries (líneas 58-112)
  // usando { order: { tenantId, customerPhone: phone, ... } }
}
```

---

### P0-002 · OrderItem sin índice en `productId` — analytics y co-purchase O(scan)

**Archivo:** `prisma/schema.prisma:471-487` (modelo `OrderItem`)

```prisma
model OrderItem {
  // ...
  orderId   String
  productId Int?
  // ...
  @@index([orderId])   // ← solo orderId; productId NO tiene índice
}
```

El recomendador colaborativo (`lib/db/recommendations.db.ts:75-112`) ejecuta hasta 4 queries sobre `OrderItem` filtrando por `productId IN (...)` y `order.customerPhone`. Sin índice en `productId`, cada query hace un seq scan de toda la tabla. Lo mismo aplica a los reportes de "top productos" y `groupBy` de best-sellers (línea 154).

Los archivos `proposed-db-indexes-wave-1.sql` y `proposed-db-indexes-wave-2.sql` proponen estos índices pero **no están aplicados al schema.prisma ni a la base**.

**Fix en schema.prisma:**
```prisma
model OrderItem {
  // ...
  @@index([orderId])
  @@index([productId])                        // ← AÑADIR (wave-1 pendiente)
  @@index([productId, orderId])               // ← composite para co-purchase join
}
```

**Fix SQL (DIRECT_URL, sin bloqueo):**
```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orderitem_product
  ON "OrderItem" ("productId") WHERE "productId" IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orderitem_product_order
  ON "OrderItem" ("productId", "orderId") WHERE "productId" IS NOT NULL;
```

---

### P0-003 · SaleItem sin índice en `productId` — KPI COGS O(scan)

**Archivo:** `prisma/schema.prisma:845-859` (modelo `SaleItem`)

```prisma
model SaleItem {
  saleId    String
  productId Int      // NOT NULL — a diferencia de OrderItem
  // ...
  @@index([saleId])   // ← solo saleId
}
```

`AnalyticsKpisV2DB.saleItemsForCogs` (línea 40-48 de `lib/db/analytics-kpis-v2.db.ts`) y la versión v1 en `lib/db/analytics-kpis.db.ts:55-66` hacen `findMany` sobre `SaleItem` con filtro `sale.tenantId`. Prisma genera un JOIN `SaleItem → Sale` donde el planner de PG debe escanear `SaleItem` completo para luego filtrar por `tenantId` en `Sale`. En una bodega activa con 10.000 ventas/mes × 3 ítems = 30.000 filas escaneadas en cada request de KPIs.

**Fix en schema.prisma:**
```prisma
model SaleItem {
  // ...
  @@index([saleId])
  @@index([productId])   // ← AÑADIR (wave-2 pendiente)
}
```

**Fix SQL:**
```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_saleitem_product
  ON "SaleItem" ("productId");
```

---

### P0-004 · RecommendationsDB — 6 a 8 queries secuenciales/condicionales por petición

**Archivo:** `lib/db/recommendations.db.ts:34-184`

El método `forPhone` ejecuta en el peor caso (usuario con historial + co-compradores disponibles):

| Paso | Query | Línea |
|------|-------|-------|
| 1 | `product.findMany` (ALL tenants, ver P0-001) | 39 |
| 2+3 | `orderItem.findMany` + `saleItem.findMany` (historial propio) | 58-65 |
| 4+5 | `orderItem.findMany` + `saleItem.findMany` (co-buyers) | 75-89 |
| 6+7 | `orderItem.findMany` + `saleItem.findMany` (productos de co-buyers) | 98-112 |
| 8 | `orderItem.groupBy` (best-sellers fallback) | 154-160 |

Los pasos 2-7 son 2 ó 4 queries secuenciales condicionadas al resultado anterior. No es un N+1 clásico (no hay loop sobre resultados individuales) sino un **query waterfall** de profundidad 3 sin cache. La ruta `GET /api/recommendations` no tiene `getOrSet` ni `cacheLife`.

**Fix:** añadir `getOrSet(cacheKey, 120, ...)` en el route handler. Adicionalmente colapsar el paso 2-7 en una sola consulta SQL analítica con CTEs:

```sql
WITH customer_items AS (
  SELECT oi."productId" FROM "OrderItem" oi
  JOIN "Order" o ON o.id = oi."orderId"
  WHERE o."tenantId" = $1 AND o."customerPhone" = $2 AND oi."productId" IS NOT NULL
),
co_buyers AS (
  SELECT DISTINCT o."customerPhone" FROM "OrderItem" oi
  JOIN "Order" o ON o.id = oi."orderId"
  WHERE oi."productId" IN (SELECT "productId" FROM customer_items)
    AND o."customerPhone" != $2 AND o."tenantId" = $1
),
co_items AS (
  SELECT oi."productId", COUNT(*) AS freq FROM "OrderItem" oi
  JOIN "Order" o ON o.id = oi."orderId"
  WHERE o."customerPhone" IN (SELECT "customerPhone" FROM co_buyers)
    AND oi."productId" NOT IN (SELECT "productId" FROM customer_items)
  GROUP BY oi."productId"
)
SELECT * FROM co_items ORDER BY freq DESC LIMIT $3;
```

---

## P1 — Alto (degradación de rendimiento observable o riesgo funcional)

### P1-001 · Customer sin índice compuesto `(tenantId, phone)` — checkout hot path

**Archivo:** `prisma/schema.prisma` (modelo `Customer`, línea ~343-345)

```prisma
model Customer {
  // ...
  @@index([customerPhone])   // ← phone sin tenantId
  @@index([createdAt])
  @@index([tenantId])        // ← tenantId sin phone
}
```

El checkout (`OrdersDB.add`, `orders.db.ts:248`) hace `customer.upsert({ where: { phone } })`. El `phone` es `@unique` a nivel aplicación pero el índice de lookup más frecuente en el dashboard de clientes es `WHERE tenantId = $1 AND phone = $2`. Con solo índices separados PG usa el de menor cardinalidad + filter.

**Fix:**
```prisma
@@index([tenantId, phone])   // ← AÑADIR (wave-1 pendiente)
```

---

### P1-002 · OrdersDB.getAll sin paginación — take:1000 en ruta de panel

**Archivo:** `lib/db/orders.db.ts:122`

```typescript
async getAll(tenantId: string): Promise<DbOrder[]> {
  return (await prisma.order.findMany({
    where, include: { items: true },
    orderBy: { createdAt: "desc" },
    take: 1000   // ← cap fijo, sin cursor ni offset
  })).map(mapOrder);
}
```

El método carga 1.000 órdenes con todos sus `items` (include). Con 10 ítems por orden = 10.000 filas hidratadas en cada llamado. `getByCustomerPhone` (línea 239-244) tiene el mismo patrón `take: 1000` sin cursor.

`getAllFiltered` (línea 151-156) tiene `take: opts?.limit ?? 5000` — cinco mil órdenes con items incluidos como default.

**Fix:** deprecar `getAll`. Los callers deben migrar a `getPage` (ya existe con cursor pagination en línea 163). Para `getByCustomerPhone` agregar `limit` con default 50.

---

### P1-003 · StoreProduct sin índice compuesto `(storeId, isActive)` — catálogo marketplace

**Archivo:** `prisma/schema.prisma:2648-2671` (modelo `StoreProduct`)

```prisma
model StoreProduct {
  // ...
  @@unique([storeId, productId])
  @@index([storeId])       // ← storeId solo
  @@index([productId])
  @@index([discountUntil])
}
```

`MarketplaceStoreProductsDB.list` (líneas 29-60 de `lib/db/marketplace/store-products.db.ts`) filtra `WHERE storeId = $1 AND isActive = true`. Con solo el índice en `storeId`, PG recupera todos los productos de la tienda (incluyendo inactivos) y filtra `isActive` en memoria.

**Fix:**
```prisma
@@index([storeId, isActive])   // ← AÑADIR
```

---

### P1-004 · CommissionLedger sin índice `(tenantId, storeId, type, createdAt)` — computeVendorTier

**Archivo:** `prisma/schema.prisma:2974-2992` + `lib/db/commissions.db.ts:212-221`

```typescript
// commissions.db.ts:212-221
await prisma.commissionLedger.findMany({
  where: {
    tenantId,
    storeId,
    type: "marketplace_fee",
    createdAt: { gte: cutoff },
    status: { not: "refunded" },
  },
});
```

El schema tiene `@@index([tenantId, status])` pero la query combina `tenantId + storeId + type + createdAt`. PG usará el índice `(tenantId, status)` y luego filtrará `storeId`, `type` y `createdAt` en memoria.

**Fix:**
```prisma
@@index([tenantId, storeId, type, createdAt])   // ← AÑADIR
```

---

### P1-005 · Fiado sin índice `(tenantId, status, fechaVence)` — KPI vencidos diario

**Archivo:** `prisma/schema.prisma:1978-1995` + `lib/db/analytics-kpis-v2.db.ts:74-78`

```typescript
// analytics-kpis-v2.db.ts:74-78
await prisma.fiado.count({
  where: { tenantId, status: "ACTIVO", fechaVence: { lt: now } },
});
```

Schema actual: `@@index([tenantId, status])`. El range filter en `fechaVence` no está cubierto por el índice compuesto.

**Fix:**
```prisma
model Fiado {
  // ...
  @@index([tenantId, status])
  @@index([tenantId, status, fechaVence])   // ← AÑADIR para range query
}
```

---

### P1-006 · overview.db.ts take:5000 sin SQL agregado — heatmap hora×día

**Archivo:** `lib/db/overview.db.ts:95-101`

```typescript
// overview.db.ts:95-101
// take:5000 cap defensivo para tenants muy activos. Migrar a SQL
// GROUP BY EXTRACT(...) cuando el cap se quede corto (P2 perf).
prisma.order.findMany({
  where: { tenantId, createdAt: { gte: startOf30dAgo, lte: rangeTo }, status: "entregado" },
  select: { createdAt: true },
  take: 5000,
}),
```

El comentario inline reconoce el problema. Se traen 5.000 filas a Node para calcular el heatmap hora×día en memoria. En tenants activos el cap corta datos y la agregación es incorrecta.

**Fix SQL:**
```sql
SELECT EXTRACT(HOUR FROM "createdAt") AS hora,
       EXTRACT(DOW  FROM "createdAt") AS dia,
       COUNT(*) AS total
  FROM "Order"
 WHERE "tenantId" = $1
   AND "createdAt" BETWEEN $2 AND $3
   AND "status" = 'entregado'
 GROUP BY 1, 2;
```

---

### P1-007 · ActivityLog sin índice compuesto `(tenantId, entity, createdAt)` — audit trail

**Archivo:** `prisma/schema.prisma:1171-1185` (modelo `ActivityLog`)

```prisma
model ActivityLog {
  // ...
  @@index([entity])
  @@index([user])
  @@index([tenantId])
  @@index([createdAt])
  @@index([tenantId, createdAt])
  @@index([phone])
}
```

Las queries de audit log filtran típicamente `WHERE tenantId = $1 AND entity = $2 ORDER BY createdAt DESC`. El índice `(tenantId, createdAt)` no incluye `entity`, por lo que PG filtra entity en memoria sobre el resultado ya ordenado. Con un log activo de 1M filas esto se siente.

**Fix:**
```prisma
@@index([tenantId, entity, createdAt])   // ← AÑADIR (wave-1 pendiente)
```

---

## P2 — Medio (mejoras de rendimiento o calidad de código)

### P2-001 · RecommendationsDB: orderItem/saleItem queries sin tenantId en nested filter

**Archivo:** `lib/db/recommendations.db.ts:58-112`

Las queries de historial del cliente y co-buyers usan `order: { customerPhone: phone, status: ... }` sin incluir `tenantId` en el filtro de `order`. Esto no es un leak (las órdenes de otros tenants son privadas y el engine no las expone directamente) pero sí aumenta el scope del scan innecesariamente.

**Fix:** agregar `tenantId` a todos los nested `order` filters (junto con el fix de P0-001).

---

### P2-002 · customers.db.ts: review.findMany take:1000 sin cache

**Archivo:** `lib/db/customers.db.ts:398,404`

```typescript
return (await prisma.review.findMany({
  where, orderBy: { date: "desc" }, take: 1000
})).map(mapReview);
```

1.000 reviews cargadas en RAM sin `getOrSet`. Las reviews cambian poco (moderación manual). Agregar cache 120s.

---

### P2-003 · store-page.db.ts: TenantPageVisit take:5000 en memoria

**Archivo:** `lib/db/store-page.db.ts:904`

```typescript
take: 5000,  // visitas del mes para calcular top referrers
```

Igual patrón que P1-006: agregación en memoria de 5.000 filas. Reemplazar con `groupBy` DB-level sobre `referrer`.

---

### P2-004 · Proposed wave-1 + wave-2 indexes NO aplicados al schema.prisma

**Archivo:** `prisma/migrations/proposed-db-indexes-wave-1.sql` + `proposed-db-indexes-wave-2.sql`

Los archivos SQL propuestos en roadmap items #69 y #70 contienen 21 índices válidos y verificados. Ninguno está reflejado en `schema.prisma` como `@@index(...)`. El riesgo es que un `prisma migrate reset` o `prisma db push` los eliminaría al no estar declarados en el schema.

**Fix:** añadir los `@@index` correspondientes en `schema.prisma` para cada índice de los wave files, luego ejecutar `prisma migrate dev` con `DIRECT_URL`.

Los más urgentes ya están cubiertos en P0-002, P0-003, P1-001, P1-007.

---

### P2-005 · ReviewVote sin índice compuesto `(reviewId, customerPhone)` — deduplication

**Archivo:** `prisma/schema.prisma` (modelo `ReviewVote`) + `lib/db/reviews.db.ts:518-527`

```typescript
// reviews.db.ts:518-527
`SELECT "id","voteType"
   FROM "ReviewVote"
  WHERE "reviewId" = $1 AND "customerPhone" = $2
  LIMIT 1`
```

```prisma
model ReviewVote {
  // ... (no hay @@index visible en el schema)
}
```

**Fix:**
```prisma
model ReviewVote {
  @@index([reviewId, customerPhone])
}
```

---

### P2-006 · OrdersDB.getByCustomerPhone: legacy path sin tenantId — DEPRECATED no removido

**Archivo:** `lib/db/orders.db.ts:231-245`

```typescript
async getByCustomerPhone(
  tenantIdOrPhone: string,
  phone?: string,
): Promise<DbOrder[]> {
  // Si phone es undefined → NO aplica tenantId filter (legacy cross-tenant)
  const where = phone !== undefined
    ? { tenantId: tenantIdOrPhone, customerPhone: ... }
    : { customerPhone: ... };  // ← SIN tenantId
```

El comentario dice `@deprecated, do not use in new code` pero el path legacy sigue activo. Cualquier caller que omita el segundo argumento hace una query cross-tenant. Verificar que ningún caller use el path legacy y eliminar el branch.

**Fix:** remover el overload legacy, forzar firma `(tenantId: string, phone: string)`.

---

## Índices consolidados pendientes de aplicar

Los siguientes `@@index` deben añadirse al `schema.prisma` y luego ejecutar `prisma migrate dev --name add-missing-indexes` con `DIRECT_URL`:

```prisma
// OrderItem
@@index([productId])
@@index([productId, orderId])

// SaleItem
@@index([productId])

// Customer
@@index([tenantId, phone])

// StoreProduct
@@index([storeId, isActive])

// CommissionLedger
@@index([tenantId, storeId, type, createdAt])

// Fiado
@@index([tenantId, status, fechaVence])

// ActivityLog
@@index([tenantId, entity, createdAt])

// ReviewVote
@@index([reviewId, customerPhone])
```

Para los índices ya en los wave SQL files pero no en schema.prisma, revisar `proposed-db-indexes-wave-1.sql` y `proposed-db-indexes-wave-2.sql` y migrar cada `CREATE INDEX` a su `@@index` correspondiente.

---

## Drift de schema verificado

No se detectó drift nuevo (columnas en código sin migración aplicada). Los archivos `MANUAL-*.sql` y `proposed-*.sql` son intencionales (expand-migrate-contract). El campo `hoursJson` en `Store` referenciado en `stores.db.ts:20` existe en la DB pero no en el schema Prisma (documentado en el comentario del archivo como expand-migrate-contract, no es drift accidental).

---

*Generado por Database Agent — 2026-05-25*
