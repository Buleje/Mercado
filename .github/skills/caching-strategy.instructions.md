---
applyTo: "**/cache*,**/lib/cache*,**/*.db.ts"
---

# Caching Strategy — Bodega San Martín

## lib/cache.ts — La capa de cache

```typescript
import { getOrSet, invalidate, invalidateByPrefix, cacheStore } from "@/lib/cache";

// Obtener o computar (patrón principal):
const products = await getOrSet(
  `products:${tenantId}`,   // Clave — siempre incluir tenantId
  300,                       // TTL en segundos (5 min)
  () => prisma.product.findMany({ where: { tenantId } })
);

// Invalidar una clave exacta (post-mutation):
invalidate(`products:${tenantId}`);

// Invalidar por prefijo (borrar todo un namespace):
invalidateByPrefix(`products:`);
```

## Backends automáticos

```typescript
// MemoryStore (default, sin configuración extra):
// - En proceso, no persiste entre instancias serverless
// - Ideal para dev y para datos de lectura frecuente

// RedisStore (si REDIS_URL está en env):
// - npm install ioredis + REDIS_URL=redis://...
// - Comparte cache entre instancias serverless
// - Write-through: escribe en Redis + memoria local
```

## Convención de claves (naming)

```typescript
// Patrón: `recurso:tenantId:id?`
`products:${tenantId}`              // Lista completa
`products:${tenantId}:${productId}` // Item específico
`settings:${tenantId}`             // Config del tenant
`orders:${tenantId}:active`        // Subset filtrado
`analytics:${tenantId}:daily`      // Agregados
```

## TTL recomendados por tipo de dato

| Tipo de dato | TTL | Justificación |
|-------------|-----|---------------|
| Productos (catálogo) | 300s (5min) | Cambia poco, alta demanda |
| Configuración (settings) | 600s (10min) | Muy estable |
| Órdenes activas | 60s (1min) | Cambia frecuente |
| Analytics/estadísticas | 300s (5min) | OK tener cierta imprecisión |
| Stock en tiempo real | 30s | Crítico para precisión |
| Precios | 300s | Moderado |

## Patrón en DB classes (cómo está implementado)

```typescript
// lib/db/products.db.ts — ejemplo de patrón:
export const ProductsDB = {
  async getAll(tenantId: string) {
    return getOrSet(`products:${tenantId}`, 300, async () => {
      return prisma.product.findMany({ where: { tenantId, deletedAt: null } });
    });
  },
  async update(id: number, data: Partial<Product>, tenantId: string) {
    const result = await prisma.product.update({ where: { id }, data });
    invalidate(`products:${tenantId}`);        // ← Siempre invalidar al mutar
    invalidate(`products:${tenantId}:${id}`);  // ← Y el item específico
    return result;
  }
};
```

## Next.js `unstable_cache` (para datos de servidor)

```typescript
import { unstable_cache } from "next/cache";

// Para datos que se cachean a nivel de route/componente:
const getCachedProducts = unstable_cache(
  async (tenantId: string) => ProductsDB.getAll(tenantId),
  ["products"],
  { revalidate: 300, tags: ["products"] }
);

// Invalidar desde Server Action:
import { revalidateTag } from "next/cache";
revalidateTag("products");
```

## Gotchas

- **Siempre incluir `tenantId` en la clave** — sin él, distintos tenants comparten cache (bug crítico)
- **Invalidar en mutations** — no invalidar → datos stale hasta que expire TTL
- **MemoryStore no persiste** — en serverless, cada instancia fría empieza con cache vacía
- **RedisStore es async bajo el hood** — `get()` sirve desde memoria local, Redis se actualiza en background
- **`getOrSet` crea race condition si TTL=0** — siempre usar TTL > 0
- **`delByPrefix` en MemoryStore itera el Map** — evitar prefijos muy genéricos en producción

## Anti-patrones

- NO cachear datos personales/sensibles sin considerar GDPR
- NO usar misma clave para distintos datos (sin tenantId como discriminador)
- NO olvidar invalidar al hacer mutations en la DB
- NO usar cache para datos de sesión de usuario — eso va en la cookie firmada
