# ADR-093 — Cross-tenant guard pattern (Source 0 + tenantId column lookup)

- **Status:** Accepted
- **Date:** 2026-05-05
- **Deciders:** Brandon (owner), Architect agent
- **Tags:** multi-tenancy, security, IDOR, authorization

---

## Context

Buleje es multi-tenant **app-level** (no usamos RLS de Postgres — ADR-082).
Cada tabla per-tenant tiene una columna `tenantId` y el código es
responsable de incluirla en cada query. Falla cualquiera de los dos lados
y se abre un **IDOR cross-tenant**: tenant A puede leer/modificar
recursos de tenant B con sólo conocer el `id` (típicamente CUID/UUID,
pero también enteros incrementales en tablas legacy).

El audit del 2026-05-05 detectó **8+ endpoints vulnerables**:
- `app/api/delivery/me/assignments/[id]/route.ts` — `findUnique({ id })`
- `app/api/delivery/me/assignments/[id]/proof/route.ts`
- `app/api/sunat/comprobante/[id]/route.ts`
- `app/api/sales/[id]/route.ts`
- `app/api/invoices/boleta/[id]/route.ts`
- `app/api/orders/[id]/route.ts` (PATCH)
- `app/api/marketplace/payment-proof/[id]/route.ts`
- `app/api/sunat/anular/[id]/route.ts`

Causa raíz: `prisma.x.findUnique({ where: { id } })` por sí mismo NO
filtra por tenant. La sesión sí trae el `tenantId`, pero el query lo
ignoraba.

## Decision

Adoptamos el siguiente **patrón canónico** en todo endpoint per-tenant:

### 1. Resolución del `tenantId` (Source 0 path > JWT > cookie > Referer)

```ts
// lib/auth/tenant-resolution.ts (canonical)
export async function resolveTenantId(req: NextRequest, params?: { tenantSlug?: string }): Promise<string> {
  // Source 0: path-based (más confiable, no spoofeable)
  if (params?.tenantSlug) {
    const t = await TenantDb.bySlug(params.tenantSlug);
    if (t) return t.id;
  }
  // Source 1: JWT session
  const session = await getSession(req);
  if (session?.tenantId) return session.tenantId;
  // Source 2: cookie de tenant explícita
  const cookieTenant = req.cookies.get("buleje_tenant")?.value;
  if (cookieTenant) return cookieTenant;
  // Source 3: Referer (sólo lectura pública, nunca writes)
  // ...
  throw new UnauthorizedError("tenant_unresolvable");
}
```

**Regla:** las fuentes se prueban en orden. Las inferiores nunca
sobreescriben a las superiores. Para endpoints de **write**, sólo
Source 0 y Source 1 son aceptables.

### 2. Query con `findFirst` + `tenantId`

```ts
// ❌ MAL — IDOR cross-tenant
const order = await prisma.order.findUnique({ where: { id } });

// ✅ BIEN
const tenantId = await resolveTenantId(req, params);
const order = await prisma.order.findFirst({
  where: { id, tenantId },
  select: { /* ... */ },
});
if (!order) return NextResponse.json({ error: "not_found" }, { status: 404 });
```

**Notas:**

- Usamos `findFirst` en lugar de `findUnique` porque el `WHERE` deja de
  ser una clave única (la combinación `(id, tenantId)` no está
  declarada como unique en schema, aunque `id` por sí solo sí lo está).
- **Devolver `404`** en caso de no match (no `403`). Filtra información:
  no queremos que un atacante pueda confirmar la existencia del recurso
  en otro tenant.
- En tablas con FK indirecta (ej. `OrderItem` no tiene `tenantId`,
  hereda de `Order`), filtrar a través del padre:
  ```ts
  await prisma.orderItem.findFirst({
    where: { id, order: { tenantId } },
  });
  ```

### 3. Excepciones (tablas globales)

| Tabla | Razón | Tratamiento |
|---|---|---|
| `Customer` | `phone` es `@id` global cross-tenant (ADR-083) | Sin filtro de `tenantId`; pero los recursos hijos (Order, Address) sí lo tienen |
| `Tenant` | Es el tenant mismo | Sólo accesible a `superadmin` |
| `SuperadminUser`, `PlatformBrand` | Globales | Sin `tenantId` |
| `MpPendingPlan` | Pre-checkout, sin tenant aún | Filtrar por `externalRef === slug` |
| `WhatsAppConversation` | `from` global | El `tenantId` se asigna en el primer mensaje resuelto |
| `StripeWebhookQueue` | Idempotencia global | Sin filtro |

Estas excepciones quedan documentadas en
`lib/auth/tenant-resolution.ts` con la constante `GLOBAL_TABLES`.

### 4. Helpers en `lib/db/*.db.ts`

Toda DB class debe exponer métodos que reciban `tenantId` como **primer
argumento**:

```ts
export class OrderDb {
  static async byId(tenantId: string, id: string) {
    return prisma.order.findFirst({ where: { id, tenantId } });
  }
}
```

Llamadas que omitan `tenantId` deben dar error de tipos en compile-time.

## Trade-offs / Consequences

**Positivo:**
- Cierra el vector de IDOR cross-tenant en un patrón uniforme.
- Compatible con cache: la key incluye `tenantId` así que dos tenants
  no comparten entradas.
- Auditable por grep: cualquier `findUnique({ where: { id }` en
  `app/api/**/route.ts` es sospechoso.

**Negativo:**
- `findFirst` no garantiza unicidad a nivel de schema. Si por algún
  bug duplicáramos `id` (improbable con CUID), retornaría el primero.
  Aceptable.
- Hay que reescribir DB classes legacy. Migración gradual, con un
  `eslint-rule` custom (`no-prisma-without-tenant`) en el roadmap.
- Source 0 (path) requiere middleware que setee `params.tenantSlug` —
  ya está en place para `t/[tenantSlug]/...`.

## Alternatives considered

1. **Postgres RLS.** Más estricto y a prueba de bugs de código, pero
   incompatible con pgBouncer transaction mode (ADR-082) y con caché
   de Prisma. Reabriremos cuando movamos infra.
2. **Tenant en el JWT solamente.** Single source. Fallaría en endpoints
   donde el tenant viene del path (white-label) y la sesión es
   "platform" (superadmin viendo otro tenant).
3. **Wrapper genérico `withTenant(handler)`.** Útil pero esconde el
   filtrado, dificultando audit por grep. Decidimos preferir
   explicitud.
