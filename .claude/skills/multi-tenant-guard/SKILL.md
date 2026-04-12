---
name: multi-tenant-guard
description: Patron de aislamiento multi-tenant de Buleje. NO es Postgres RLS — es app-level via middleware + tenantId 1er param + Prisma extension. Usar ANTES de crear endpoints, DB classes o queries.
user-invocable: true
model: sonnet
allowed-tools: Read, Grep, Glob
argument-hint: "[check|audit|new-endpoint|new-db-class]"
---

# Multi-Tenant Guard — Patron Real de Aislamiento

## Arquitectura (3 capas)

```
Request → proxy.ts (resuelve tenant de Host/JWT/Cookie)
  → x-tenant-id header inyectado
    → requireAdmin() extrae tenantId del JWT (CANONICAL)
      → lib/db/*.db.ts recibe tenantId como 1er param
        → Prisma Extension auto-inyecta WHERE en 161 modelos
```

**Regla de oro:** JWT siempre gana sobre headers. El header puede tener slug, el JWT tiene CUID.

## Patron DB Class (obligatorio)

```typescript
// lib/db/ejemplo.db.ts
import "server-only";
import { prisma } from "@/lib/prisma";

export const EjemploDB = {
  // tenantId SIEMPRE es el primer parametro, NUNCA opcional
  async getAll(tenantId: string, limit = 200) {
    return prisma.ejemplo.findMany({
      where: { tenantId },  // SIEMPRE en WHERE
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  },

  async create(tenantId: string, data: CreateInput) {
    return prisma.ejemplo.create({
      data: { tenantId, ...data },  // SIEMPRE en data
    });
  },
};
```

## Patron API Route (obligatorio)

```typescript
// app/api/ejemplo/route.ts
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  // USAR auth.tenantId del JWT, nunca del header
  const data = await EjemploDB.getAll(auth.tenantId);
  return NextResponse.json(data);
}
```

## Prisma Extension automatica

`lib/tenant.ts` → `prismaForTenant(tenantId)` → auto-inyecta `WHERE { tenantId }` en 161 modelos.

**Modelos NO tenant-scoped (por diseno):** Tenant, SuperadminUser, AdminUser, Settings globales.
**Modelos indirectos:** OrderItem, SaleItem, BundleItem → aislados via FK del padre.

## Middleware chain (proxy.ts)

1. Slug routing `/t/[slug]/*`
2. Tenant resolution (Host → Cookie → JWT)
3. Cross-tenant header mismatch audit (fire-and-forget)
4. Header bundle: `x-tenant-id`, `x-request-id`, `x-nonce`
5. Rate limit (Redis)
6. CSRF double-submit
7. Auth guards (superadmin → admin → public)

## Gaps conocidos (vigilar)

| Gap | Riesgo | Donde |
|---|---|---|
| `tenantId = "main"` como default en algunos DB classes | Escritura accidental a tenant principal | customers.db, orders.db, notifications.db |
| OrderItem/SaleItem no estan en TENANT_MODELS | Leak si se consultan directo (sin pasar por OrdersDB) | Prisma queries directas |
| Slug vs CUID mismatch | Endpoints publicos sin requireAdmin podrian usar slug | Storefront endpoints |

## Checklist para nuevo codigo

Al crear un nuevo endpoint o DB class:

- [ ] `tenantId` es el 1er parametro de TODA funcion DB (no opcional, no default)
- [ ] API route usa `auth.tenantId` del JWT (via `requireAdmin`)
- [ ] Queries usan `where: { tenantId }` explicito
- [ ] Creates usan `data: { tenantId, ...data }`
- [ ] Updates/deletes incluyen `where: { tenantId, id }` (doble filtro)
- [ ] Endpoints publicos (sin auth) usan `getTenantIdFromRequest()`
- [ ] Audit trail: `logActivity()` con tenantId
- [ ] NO usar `prisma.model.findMany()` directo — usar DB class
