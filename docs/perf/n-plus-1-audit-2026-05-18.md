# Audit N+1 Queries — 2026-05-18

> Sprint Final Produccion — Dias 9-10 — Solo identificacion, NO aplicar todavia.
> Auditor: Performance Engineer (Buleje).

---

## Resumen ejecutivo

| Categoria | Cantidad |
|-----------|----------|
| N+1 confirmados en hot path | 4 |
| N+1 en crons (impacto diferido) | 5 |
| N+1 en admin path (no tiempo real) | 2 |
| Total detectados | 11 |

---

## N+1 Confirmados — Hot Path (Prioridad P0/P1)

### 1. [P0] `createFromCart` — stock lookup por item en transaccion

| Campo | Valor |
|-------|-------|
| Archivo | `lib/db/marketplace/orders.db.ts:273-312` |
| Contexto | Checkout marketplace — hot path critico |
| Queries por request | `2 x N` (findFirst + updateMany por cada item del carrito) |

**Query problematica:**
```ts
// orders.db.ts:281
for (const item of orderItems) {  // N items en el carrito
  const current = await tx.product.findFirst({
    where: { id: storeProduct.productId, tenantId: store.tenantId, deletedAt: null },
    select: { stock: true },
  });
  // ... luego:
  await tx.product.updateMany({ ... });  // otra query por item
}
```

**Impacto:** Un carrito con 5 productos genera 10 queries secuenciales dentro de la transaccion. En 3G Pucallpa (~20-50ms round-trip por query) esto suma +100-250ms de latencia extra en checkout.

**Fix propuesto:** Batch lookup antes de la transaccion, luego `Promise.all` de decrementos:
```ts
// Pre-fetch todos los stocks en UNA query
const productIds = orderItems
  .map(item => storeProducts.find(sp => sp.id === ...)?.productId)
  .filter(Boolean) as number[];

const stocks = await prisma.product.findMany({
  where: { id: { in: productIds }, tenantId: store.tenantId, deletedAt: null },
  select: { id: true, stock: true },
});
const stockMap = new Map(stocks.map(s => [s.id, s.stock]));

// Dentro de la tx: solo decrementos en paralelo
await Promise.all(
  itemsConStock.map(item =>
    tx.product.updateMany({
      where: { id: item.productId, tenantId: store.tenantId, stock: { gte: item.quantity } },
      data: { stock: { decrement: item.quantity } },
    })
  )
);
```

**Caveat:** La guard `stock: { gte: item.quantity }` en el updateMany ya maneja la race condition. Si `count === 0`, se lanza el error correctamente — igual que el patron actual.

---

### 2. [P0] `email-automation` — 3 queries secuenciales por orden en loop

| Campo | Valor |
|-------|-------|
| Archivo | `app/api/email-automation/route.ts:38-95` |
| Contexto | Cron cada hora — procesa N ordenes recientes |
| Queries por request | `3 x N` (order.count + customerNotif.findFirst + customerNotif.create) |

**Query problematica:**
```ts
for (const { customerPhone, tenantId } of recentOrders) {  // N ordenes
  const orderCount = await prisma.order.count({ where: { customerPhone, tenantId } });
  const existing = await prisma.customerNotification.findFirst({ ... });
  await prisma.customerNotification.create({ ... });
}
// Segunda seccion (ordenes entregadas):
for (const order of deliveredOrders) {  // N ordenes
  const customer = await prisma.customer.findUnique({ where: { phone: order.customerPhone } });
  const existing = await prisma.customerNotification.findFirst({ ... });
}
```

**Impacto:** 50 ordenes recientes = 150 queries secuenciales. Riesgo real de timeout en Vercel (10s).

**Fix propuesto:** Batch lookup con `groupBy` + `findMany` + `createMany`:
```ts
const phones = recentOrders.map(o => o.customerPhone).filter(Boolean);

const [countsByPhone, existingNotifs] = await Promise.all([
  prisma.order.groupBy({
    by: ['customerPhone', 'tenantId'],
    where: { customerPhone: { in: phones } },
    _count: { id: true },
  }),
  prisma.customerNotification.findMany({
    where: { customerPhone: { in: phones }, title: "Bienvenido a Buleje!" },
    select: { customerPhone: true },
  }),
]);

const countMap = new Map(countsByPhone.map(r => [`${r.customerPhone}:${r.tenantId}`, r._count.id]));
const notifiedSet = new Set(existingNotifs.map(n => n.customerPhone));

const toCreate = recentOrders.filter(o =>
  countMap.get(`${o.customerPhone}:${o.tenantId}`) === 1 && !notifiedSet.has(o.customerPhone)
);
await prisma.customerNotification.createMany({ data: toCreate.map(buildWelcomeNotif) });
```

---

### 3. [P1] `inactive-customers` cron — 3 queries secuenciales por candidato

| Campo | Valor |
|-------|-------|
| Archivo | `app/api/cron/inactive-customers/route.ts:65-104` |
| Contexto | Cron diario — hasta 100 candidatos |
| Queries por request | `3 x N` (notifLog.findFirst + order.findFirst + tenant.findFirst) |

**Query problematica:**
```ts
for (const candidate of candidates) {  // hasta 100
  const recentNotif = await prisma.notificationLog.findFirst({
    where: { recipient: phone, type: "inactive_reminder", createdAt: { gte: weekAgo } },
  });
  const lastOrder = await prisma.order.findFirst({
    where: { customerPhone: phone, deletedAt: null },
    orderBy: { createdAt: "desc" },
  });
  const tenant = await prisma.tenant.findFirst({ where: { slug: lastOrder.tenantId } });
}
```

**Impacto:** 100 candidatos = 300 queries secuenciales. La busqueda `tenant.findFirst({ where: { slug } })` es especialmente costosa — `slug` no tiene indice en el modelo Tenant (solo `id` y `customDomain`).

**Fix propuesto:** Pre-batch los tres lookups:
```ts
const phones = candidates.map(c => c.customerPhone).filter(Boolean);

const [recentNotifs, lastOrders] = await Promise.all([
  prisma.notificationLog.findMany({
    where: { recipient: { in: phones }, type: "inactive_reminder", createdAt: { gte: weekAgo } },
    select: { recipient: true },
  }),
  prisma.order.findMany({
    where: { customerPhone: { in: phones }, deletedAt: null },
    orderBy: { createdAt: "desc" },
    distinct: ['customerPhone'],
    select: { customerPhone: true, customerName: true, tenantId: true, items: { take: 3 } },
  }),
]);

const notifiedSet = new Set(recentNotifs.map(n => n.recipient));
const orderMap = new Map(lastOrders.map(o => [o.customerPhone, o]));

// Un solo batch para tenants unicos
const tenantIds = [...new Set(lastOrders.map(o => o.tenantId))];
const tenants = await prisma.tenant.findMany({
  where: { id: { in: tenantIds } },
  select: { id: true, name: true },
});
const tenantMap = new Map(tenants.map(t => [t.id, t]));
```

---

### 4. [P1] `store-page.db.ts` — upsert en loop por producto

| Campo | Valor |
|-------|-------|
| Archivo | `lib/db/store-page.db.ts:609-632` |
| Contexto | Admin: visibility toggle de productos en pagina de tienda |
| Queries por request | `2 x N` (findUnique + create/update por producto) |

**Query problematica:**
```ts
for (const productId of validIds) {  // N productos seleccionados
  const existing = await prisma.tenantPageProductOverride.findUnique({ ... });
  if (existing) {
    await prisma.tenantPageProductOverride.update({ ... });
  } else {
    await prisma.tenantPageProductOverride.create({ ... });
  }
}
```

**Fix propuesto:** `findMany` batch + `createMany` + `updateMany`:
```ts
const existing = await prisma.tenantPageProductOverride.findMany({
  where: { tenantId, productId: { in: [...validIds] } },
  select: { productId: true },
});
const existingSet = new Set(existing.map(e => e.productId));

await Promise.all([
  prisma.tenantPageProductOverride.createMany({
    data: [...validIds]
      .filter(id => !existingSet.has(id))
      .map(productId => ({ tenantId, productId, visible, featured: false, sortOrder: 0 })),
    skipDuplicates: true,
  }),
  prisma.tenantPageProductOverride.updateMany({
    where: { tenantId, productId: { in: [...validIds].filter(id => existingSet.has(id)) } },
    data: { visible },
  }),
]);
```

---

## N+1 en Admin/Crons (Prioridad P1/P2)

### 5. [P1] `fiados.db.ts:452` — segundo findFirst innecesario post-update

| Campo | Valor |
|-------|-------|
| Archivo | `lib/db/fiados.db.ts:474` |
| Queries por request | `3 x N` en lugar de `2 x N` (findFirst + update + findFirst innecesario) |

**Fix propuesto:** El `prisma.update` puede retornar el registro actualizado directamente con `select`.
```ts
const updated = await tx.fiado.update({
  where: { id: payment.fiadoId, tenantId },
  data: { saldo: { decrement: paymentAmount } },
  select: { saldo: true, status: true },  // elimina el findFirst de linea 474
});
```

---

### 6. [P1] `recetas.db.ts:315` — findUnique + update por ingrediente en tx

| Campo | Valor |
|-------|-------|
| Archivo | `lib/db/recetas.db.ts:315-351` |
| Queries por request | `2 x N` (findUnique + update por ingrediente) |

**Fix propuesto:** Pre-fetch todos los productos de la receta en batch antes de la tx. La receta ya hace `include: { ingredientes: { include: { producto: true } } }` — aprovechar `ingrediente.producto` ya incluido en lugar de re-hacer `findUnique` dentro del loop.

---

### 7. [P2] `documents.db.ts:377` — update por documento en loop addTag

| Campo | Valor |
|-------|-------|
| Archivo | `lib/db/documents.db.ts:377-384` |
| Queries por request | `1 x N` (update por documento) |

**Fix propuesto:** `updateMany` no soporta mutar arrays JSON en Prisma. Usar `$executeRaw`:
```sql
UPDATE "Document"
SET tags = tags || $1::jsonb
WHERE id = ANY($2::text[]) AND tenantId = $3 AND NOT (tags @> $1::jsonb)
```

---

### 8. [P2] `supplier/catalog` — findFirst + create por producto en loop

| Campo | Valor |
|-------|-------|
| Archivo | `app/api/supplier/catalog/route.ts:122-148` |
| Queries por request | `2 x N` (findFirst + SupplierPriceVersionDB.create por producto) |

**Fix propuesto:** Batch lookup de todos los productos, `createMany` para el historial.

---

### 9. [P2] `bulkChangeStatus` — `orderStatusHistory.create` en loop

| Campo | Valor |
|-------|-------|
| Archivo | `lib/db/marketplace/orders.db.ts:921-941` |
| Queries por request | `1 x N` inserts de historial (fire-and-forget) |

**Fix propuesto:** Reemplazar el for-loop de creates individuales con `createMany`:
```ts
prisma.orderStatusHistory.createMany({
  data: updatable.map(id => ({
    id: crypto.randomUUID(),
    orderId: id,
    fromStatus: existingById.get(id)!.status,
    toStatus: newStatus as OrderStatus,
    changedBy: by,
    note: cancelReason ?? "bulk",
    tenantId,
  })),
}).catch(err => logger.warn("[bulkChangeStatus] history batch failed", { error: String(err) }));
```

---

## N+1 ya resueltos (para referencia)

| Patron | Estado | Archivo |
|--------|--------|---------|
| `resolveTenantAliases` | Resuelto con cache TTL 5min | `lib/db/product-variants.db.ts` |
| `getStoreLocationsBySlugs` | Resuelto con `Promise.all` + cache | `lib/db/marketplace-public.db.ts:115` |
| `review.findMany` 3x | Fan-out legitimo por tab distinto | `app/api/marketplace/` |
| `tenant.findFirst` billing 3x | Handlers independientes, no loop | `app/api/billing/webhook/route.ts` |

---

## Top 5 endpoints por latencia esperada de N+1

| Ranking | Endpoint | N+1 | Latencia extra estimada (3G Pucallpa) |
|---------|----------|-----|--------------------------------------|
| 1 | `POST /api/marketplace/orders` | 2xN stock items | +100-250ms (carrito de 5 items) |
| 2 | `POST /api/email-automation` | 3xN ordenes | +150ms x N ordenes procesadas |
| 3 | `GET /api/cron/inactive-customers` | 3xN candidatos | +200ms x N candidatos |
| 4 | `PATCH /api/marketplace/stores/my/products/bulk` | 2xN productos | +80ms x N productos |
| 5 | `POST /api/fiados/bulk-pay` | 3xN fiados | +100ms x N fiados |

---

## Estrategia general recomendada

| Patron | Cuando usar | Complejidad |
|--------|-------------|-------------|
| Prisma `include` relacional | Relaciones 1-nivel en `findMany` | Baja |
| Batch pre-fetch + Map | Lookups de ID por coleccion conocida | Media |
| `createMany` / `updateMany` | Inserts/updates masivos homogeneos | Baja |
| `prisma.groupBy` | Counts/sumas por grupo | Media |
| `Promise.all` de queries | Queries independientes dentro de loop | Baja |
| Dataloader externo | Fan-out complejo multi-nivel | Alta |

**Recomendacion:** No implementar Dataloader todavia. El 90% de los N+1 se resuelven con batch pre-fetch + Map o con `createMany/updateMany`. Dataloader seria overkill para el volumen actual de Buleje.

---

## Build errors bloqueantes detectados

Adicionalmente se detectaron 2 errores que impiden `npm run build`:

| Error | Archivo | Fix |
|-------|---------|-----|
| `export const dynamic = "force-dynamic"` incompatible con `cacheComponents` | `app/api/onboarding/industry/route.ts:10` | Remover la linea — usar `"use cache"` si aplica |
| `import { renderToStaticMarkup } from "react-dom/server"` en RSC | `lib/email/send.ts:2` | Mover a Server Action o separar en modulo server-only con dynamic import |
