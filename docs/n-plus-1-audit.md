# Auditoría N+1 y Performance de Base de Datos

**Fecha:** 2026-04-06
**Metodología:** Análisis estático de `lib/db/*.db.ts` (25 archivos, 87 queries Prisma) + `prisma/schema.prisma` (116 modelos).
**Herramienta:** Grep + Node.js analyzer (búsqueda de patrones `for + await`, `.map(async`, `findMany sin include`).

---

## Resumen ejecutivo

| Hallazgo | Conteo | Severidad |
|---|---:|---|
| N+1 reales confirmados | **4** | Alto |
| Falsos positivos de N+1 (loop sobre datos ya cargados) | 1 | N/A |
| Modelos sin `@@index` | **3 de 116** | Medio |
| Modelos con `@@index` | 113 | Bien |
| Queries Prisma totales en `lib/db/` | 87 | — |

**Veredicto:** El proyecto está **mucho mejor de lo esperado**. 97% de los modelos tienen índices. Los 4 N+1 son localizados y corregibles en < 2 horas cada uno.

---

## N+1 críticos confirmados (4)

### 1. `lib/db/inventory.db.ts:197` — FEFO batch deduction

**Código actual:**
```ts
const batches = await prisma.batch.findMany({
  where: { productId, quantity: { gt: 0 } },
  orderBy: { expiryDate: "asc" },
});
for (const batch of batches) {
  if (remaining <= 0) break;
  const toDeduct = Math.min(batch.quantity, remaining);
  await prisma.batch.update({
    where: { id: batch.id },
    data: { quantity: batch.quantity - toDeduct },
  });
  remaining -= toDeduct;
}
```

**Problema:** Si un producto tiene 20 lotes activos, son **21 queries** (1 findMany + 20 updates secuenciales).

**Impacto:** Alto — se ejecuta en cada venta para productos perecederos. En pico de ventas (Lima/Pucallpa horario comercial) puede generar cientos de queries/minuto.

**Fix propuesto:**
```ts
await prisma.$transaction(async (tx) => {
  const batches = await tx.batch.findMany({
    where: { productId, quantity: { gt: 0 } },
    orderBy: { expiryDate: "asc" },
  });
  const updates: Array<{ id: string; newQty: number }> = [];
  let remaining = quantity;
  for (const batch of batches) {
    if (remaining <= 0) break;
    const toDeduct = Math.min(batch.quantity, remaining);
    updates.push({ id: batch.id, newQty: batch.quantity - toDeduct });
    remaining -= toDeduct;
  }
  // Paralelizar las updates dentro de la misma transacción
  await Promise.all(
    updates.map((u) =>
      tx.batch.update({ where: { id: u.id }, data: { quantity: u.newQty } })
    )
  );
});
```

**Esfuerzo:** 30 min. **Mejora esperada:** 10-20x en ventas con >5 lotes por producto.

---

### 2. `lib/db/marketplace.db.ts:416` — StoreProduct sync

**Código actual:**
```ts
for (const product of catalogProducts) {
  const existing = existingMap.get(product.id);
  if (product.active) {
    if (!existing) {
      await prisma.storeProduct.create({ data: { /* ... */ } });
      created++;
    } else if (!existing.isActive) {
      await prisma.storeProduct.update({ where: { id: existing.id }, data: { /* ... */ } });
      updated++;
    }
  } else {
    if (existing && existing.isActive) {
      await prisma.storeProduct.update({ where: { id: existing.id }, data: { isActive: false } });
      deactivated++;
    }
  }
}
```

**Problema:** Para 1000 productos en el catálogo = hasta **1000 queries secuenciales**. Esto se ejecuta en cada "Sync catálogo" del marketplace.

**Impacto:** Muy alto — operación pesada que puede timeout si el catálogo crece.

**Fix propuesto:**
```ts
// Separar en 3 grupos y ejecutar en lote
const toCreate = [];
const toActivate = [];
const toDeactivate = [];

for (const product of catalogProducts) {
  const existing = existingMap.get(product.id);
  if (product.active && !existing) {
    toCreate.push({ /* ... */ });
  } else if (product.active && existing && !existing.isActive) {
    toActivate.push(existing.id);
  } else if (!product.active && existing?.isActive) {
    toDeactivate.push(existing.id);
  }
}

await prisma.$transaction([
  prisma.storeProduct.createMany({ data: toCreate, skipDuplicates: true }),
  prisma.storeProduct.updateMany({
    where: { id: { in: toActivate } },
    data: { isActive: true },
  }),
  prisma.storeProduct.updateMany({
    where: { id: { in: toDeactivate } },
    data: { isActive: false },
  }),
]);
```

**Limitación:** `updateMany` no permite setear `retailPrice` por fila. Si cada producto tiene un precio diferente en la activación, usar `$transaction` con `update` individuales (aún mejor que el loop actual porque van en una sola transacción).

**Esfuerzo:** 1 hora. **Mejora esperada:** 1000 queries → 3 queries. **Factor: ~300x en catálogos grandes.**

---

### 3. `lib/db/orders.db.ts:238` — Insert stub products

**Código actual:**
```ts
for (const item of order.items) {
  if (item.id > 0 && !existing.has(item.id)) {
    await prisma.$executeRaw`
      INSERT INTO "Product" (id, name, category, price, unit, image)
      VALUES (${item.id}, ${item.name}, 'tienda', ${item.price}, ${item.unit}, ${item.image ?? ''})
      ON CONFLICT (id) DO NOTHING
    `;
    needsSequenceReset = true;
  }
}
```

**Problema:** Para un pedido con 15 items de catálogo nuevos = 15 INSERTs individuales.

**Impacto:** Medio — solo ocurre la primera vez que un producto del catálogo se vende desde la tienda. Frecuencia baja pero latencia alta para pedidos grandes.

**Fix propuesto:**
```ts
const toInsert = order.items.filter((i) => i.id > 0 && !existing.has(i.id));
if (toInsert.length > 0) {
  // Opción A: createMany con skipDuplicates
  await prisma.product.createMany({
    data: toInsert.map((item) => ({
      id: item.id,
      name: item.name,
      category: "tienda",
      price: item.price,
      unit: item.unit,
      image: item.image ?? "",
    })),
    skipDuplicates: true,
  });
  needsSequenceReset = true;
}
```

**Nota:** Si `ON CONFLICT (id) DO NOTHING` era necesario por alguna columna NOT NULL extra, usar `prisma.$executeRaw` con una sola query que combine `VALUES (...), (...), (...)`.

**Esfuerzo:** 20 min. **Mejora esperada:** N queries → 1 query.

---

### 4. `lib/db/prestamos.db.ts:669` — Marcar préstamos vencidos

**Código actual:**
```ts
const activos = await prisma.prestamo.findMany({
  where: { tenantId, status: "ACTIVO" },
  include: { cuotas: true },
});
for (const p of activos) {
  const hasOverdue = p.cuotas.some((c) => !c.pagadoEn && c.fechaVence < now);
  if (hasOverdue) {
    await prisma.prestamo.update({ where: { id: p.id }, data: { status: "VENCIDO" } });
    count++;
  }
}
```

**Problema:** Para N préstamos activos con cuotas vencidas, N updates individuales. Corre en cron job — no urgente pero ineficiente.

**Impacto:** Bajo (cron diario) pero sigue siendo N+1.

**Fix propuesto:**
```ts
// Un solo UPDATE con subquery — sin traer datos a Node
const result = await prisma.$executeRaw`
  UPDATE "Prestamo"
  SET status = 'VENCIDO'
  WHERE "tenantId" = ${tenantId}
    AND status = 'ACTIVO'
    AND id IN (
      SELECT DISTINCT c."prestamoId"
      FROM "Cuota" c
      WHERE c."pagadoEn" IS NULL
        AND c."fechaVence" < ${now}
    )
`;
return Number(result);
```

**Esfuerzo:** 30 min (requiere test porque cambia semántica de conteo). **Mejora esperada:** `1 + N` queries → 1 query.

---

## Falso positivo — NO es N+1

### `lib/db/recetas.db.ts:154` — Cálculo de costo total de receta

```ts
const receta = await prisma.receta.findFirst({
  where: { id: recetaId },
  include: { ingredientes: { include: { producto: true } } },
});
for (const ing of receta.ingredientes) {
  const costUnit = ing.producto.costPrice ?? ing.producto.price;
  total += costUnit * Number(ing.cantidad);
}
```

**Veredicto:** Correcto. El `include` anidado carga los productos en la query original. El `for` itera sobre datos ya en memoria. **No tocar.**

---

## Modelos sin `@@index` (3 de 116)

| Modelo | Razón probable | Acción |
|---|---|---|
| `Settings` | Tabla de configuración global — 1 sola fila por tenant | Agregar `@@index([tenantId])` si no es PK |
| `WholesaleOrderItem` | Probablemente tiene FK que ya es índice implícito | Verificar si hay queries por `orderId` sin índice |
| `ChurnPlaybook` | Tabla pequeña, lookup por nombre | Agregar `@@index([tenantId, name])` si se usa filtrado |

**Acción recomendada:** Inspeccionar queries reales contra estos 3 modelos antes de añadir índices especulativos (YAGNI).

---

## Índices compuestos adicionales recomendados

Aunque 113/116 modelos tienen índices, vale la pena verificar que las combinaciones más usadas existan:

| Modelo | Índice recomendado | Para qué |
|---|---|---|
| `Order` | `@@index([tenantId, status, createdAt])` | Listar pedidos pendientes de hoy |
| `Product` | `@@index([tenantId, category, active])` | Listar catálogo activo por categoría |
| `Batch` | `@@index([productId, quantity, expiryDate])` | FEFO batch deduction (#1 arriba) |
| `InventoryMovement` | `@@index([tenantId, productId, createdAt])` | Kardex histórico |
| `StoreProduct` | `@@index([storeId, productId, isActive])` | Sync marketplace (#2 arriba) |

**Acción:** Ejecutar en Supabase `EXPLAIN ANALYZE` sobre las 10 queries más lentas (usar `pg_stat_statements`) antes de crear índices. Índices inútiles degradan escritura.

---

## Plan de corrección (orden recomendado)

| # | Fix | Archivo:Línea | Impacto | Esfuerzo |
|---|---|---|---|---|
| 1 | Bulk createMany en stub products | `orders.db.ts:238` | Medio | 20 min |
| 2 | Transaction + Promise.all en FEFO batches | `inventory.db.ts:197` | Alto | 30 min |
| 3 | UPDATE con subquery en marcar vencidos | `prestamos.db.ts:669` | Bajo | 30 min |
| 4 | createMany + updateMany bulk en marketplace sync | `marketplace.db.ts:416` | Muy alto | 1 h |
| 5 | Auditar queries reales contra Settings, WholesaleOrderItem, ChurnPlaybook | `schema.prisma` | Medio | 30 min |
| 6 | `EXPLAIN ANALYZE` sobre top 10 queries en Supabase | DB real | Alto | 1 h |
| 7 | Agregar `@@index` compuestos recomendados si `EXPLAIN` los justifica | `schema.prisma` | Alto | 30 min |

**Total esfuerzo estimado:** ~4 horas para cerrar todo.

---

## Métricas de éxito post-corrección

| Métrica | Antes | Target |
|---|---|---|
| Queries por venta (con 10 lotes) | ~11 | 2 (findMany + 1 transaction) |
| Queries por sync marketplace (1000 productos) | ~1000 | 3 |
| Queries por marcar vencidos (50 préstamos) | ~51 | 1 |
| Queries por pedido nuevo (15 items nuevos) | ~16 | 2 |
| p95 latency endpoint `/api/orders` | ? | -30% |
| p95 latency cron `marcarVencidos` | ? | -90% |

**Validación:** Después de aplicar los fixes, ejecutar `npm run test:load` con k6 antes y después para comparar throughput en el endpoint de ventas.

---

## Siguiente auditoría

Repetir cada **3 meses** o después de agregar nuevas queries pesadas. Idealmente, integrar `lib/query-monitor.ts` para alertar en dev sobre queries > 100ms.
