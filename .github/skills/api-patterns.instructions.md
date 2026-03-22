---
applyTo: "app/api/**"
---

# API Patterns — Bodega San Martín

## Estructura obligatoria de todo endpoint

```typescript
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { z } from "zod/v4";
import { SomeDB } from "@/lib/db";
import { logActivity } from "@/lib/activity-logger";

export const dynamic = "force-dynamic"; // SIEMPRE — evita cache stale

export async function GET(req: Request) {
  const auth = await requireAdmin(req, ["admin", "cajero"]); // Ajustar roles
  if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  // Zod para query params
  const url = new URL(req.url);
  const schema = z.object({ page: z.coerce.number().min(1).optional() });
  const parsed = schema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Parámetros inválidos", issues: parsed.error.issues }, { status: 400 });

  const data = await SomeDB.getAll(auth.tenantId); // tenantId SIEMPRE
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const auth = await requireAdmin(req, ["admin"]);
  if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = await req.json();
  const schema = z.object({ name: z.string().min(1) });
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues }, { status: 400 });

  const result = await SomeDB.create({ ...parsed.data, tenantId: auth.tenantId });

  // Fire-and-forget — no bloquear el response
  logActivity(auth.userId, "create", "resource", result.id).catch(() => {});

  return NextResponse.json(result, { status: 201 });
}
```

## Reglas de oro

1. **`export const dynamic = "force-dynamic"`** en TODOS los route handlers
2. **Nunca Prisma directo** — usar `lib/db/*.db.ts` (incluye cache invalidation + audit)
3. **`requireAdmin(req, roles)`** antes de cualquier lógica — early return si null
4. **`safeParse()` siempre** — nunca `.parse()`. Retornar 400 con `issues` en caso de error
5. **`tenantId` en toda query** — multi-tenant isolation
6. **`logActivity()` y `sendNotification()`** son fire-and-forget: `.catch(() => {})`
7. **No calcular totales en cliente** — recomputar server-side

## Roles disponibles (ALLOWED_ROLES en lib/auth/role-permissions.ts)

```typescript
import { ALLOWED_ROLES } from "@/lib/auth/role-permissions";
// Ejemplos:
requireAdmin(req, ALLOWED_ROLES.INVENTORY_WRITE)  // ["admin", "almacenero"]
requireAdmin(req, ALLOWED_ROLES.SALES)             // ["admin", "cajero"]
requireAdmin(req, ["admin"])                       // Solo admin
```

## Paginación estándar

```typescript
const { page = 1, limit = 20, search } = parsed.data;
const skip = (page - 1) * limit;
// Retornar: { data, total, page, limit, totalPages }
```

## Operaciones bulk

```typescript
// PATCH /api/products/bulk
const schema = z.object({
  ids: z.array(z.number()).min(1),
  update: z.object({ active: z.boolean().optional() })
});
```

## SSE (eventos en tiempo real)

```typescript
const stream = new ReadableStream({ start(controller) { /* enviar eventos */ } });
return new Response(stream, { headers: { "Content-Type": "text/event-stream" } });
```

## Estructura de carpetas API (90+ endpoints)

`app/api/orders/`, `products/`, `customers/`, `inventory-movements/`, `batches/`,
`sales/`, `purchases/`, `suppliers/`, `cash-registers/`, `analytics/`, `settings/`,
`promotions/`, `coupons/`, `loyalty/`, `notifications/`, `activity-log/`, etc.

## Gotchas

- **No usar `.parse()`** — lanza excepción no controlada → 500 en vez de 400
- **Olvidar `dynamic = "force-dynamic"`** → Next.js cacheará respuestas de API incorrectamente
- **Prisma directo en route** → rompe cache invalidation y audit trail de DB classes
- **No pasar `tenantId`** → datos de otros tenants visibles (bug de seguridad crítico)
- **Bloquear response con `logActivity(await ...)`** → latencia innecesaria, siempre fire-and-forget
