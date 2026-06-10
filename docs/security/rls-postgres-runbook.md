# RLS Postgres — Runbook implementación (Sprint 2)

> ADR-114. **Estado:** plan documentado, NO implementado.
> Tiempo estimado: 5 días dev + 2 días testing = **1 sprint**.

## Pre-requisitos

1. ✅ Supabase Pro plan (200 conns) — ver `sprint-1-arquitectura-runbook.md`
2. ✅ `DIRECT_URL` configurada en `.env` para migrations
3. ⏳ Branch `feat/rls-postgres` creado
4. ⏳ Test suite verde antes de empezar

## Fase 1 — Setup base (día 1)

### 1.1 Crear usuario DB con BYPASSRLS para migrations

```sql
-- Conectarse como postgres admin (Supabase dashboard SQL editor)
CREATE ROLE prisma_migrator WITH LOGIN PASSWORD '...' BYPASSRLS;
GRANT ALL PRIVILEGES ON DATABASE postgres TO prisma_migrator;
GRANT ALL ON SCHEMA public TO prisma_migrator;
```

Actualizar `.env`:
```
DIRECT_URL="postgresql://prisma_migrator:...@.../postgres"
DATABASE_URL="postgresql://postgres:...@.../postgres?pgbouncer=true"
```

### 1.2 Crear `lib/prisma-rls.ts` con extensión Prisma

```ts
// lib/prisma-rls.ts
import "server-only";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "./prisma";

const SYSTEM_TENANT = "__system__";
const SUPERADMIN_TENANT = "__superadmin__";

export function withRlsTenant(tenantId: string) {
  return prisma.$extends({
    name: "rls-tenant-extension",
    query: {
      $allOperations: async ({ args, query }) => {
        // SET LOCAL solo dentro de la conexión actual.
        // En pgBouncer transaction mode, SET LOCAL respeta el alcance de la tx.
        await prisma.$executeRawUnsafe(
          `SET LOCAL app.tenant_id = '${tenantId.replace(/'/g, "''")}'`
        );
        return query(args);
      },
    },
  });
}

export const rlsSystem = () => withRlsTenant(SYSTEM_TENANT);
export const rlsSuperadmin = () => withRlsTenant(SUPERADMIN_TENANT);
```

## Fase 2 — Habilitar RLS en 5 tablas (días 2-3)

### 2.1 Migration manual (SQL en Supabase SQL editor)

```sql
-- ─── Order ────────────────────────────────────────────────
ALTER TABLE "Order" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Order" FORCE ROW LEVEL SECURITY; -- aplica también al owner

CREATE POLICY "tenant_isolation_order" ON "Order"
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.tenant_id', true) IN ('__system__', '__superadmin__')
  );

-- ─── Customer ────────────────────────────────────────────
ALTER TABLE "Customer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Customer" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_customer" ON "Customer"
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.tenant_id', true) IN ('__system__', '__superadmin__')
  );

-- ─── Sale ────────────────────────────────────────────────
ALTER TABLE "Sale" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Sale" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_sale" ON "Sale"
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.tenant_id', true) IN ('__system__', '__superadmin__')
  );

-- ─── Payment ─────────────────────────────────────────────
ALTER TABLE "Payment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Payment" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_payment" ON "Payment"
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.tenant_id', true) IN ('__system__', '__superadmin__')
  );

-- ─── AuditLog ────────────────────────────────────────────
ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_auditlog" ON "AuditLog"
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.tenant_id', true) IN ('__system__', '__superadmin__')
  );
```

### 2.2 Migrar callers críticos a usar `withRlsTenant`

```ts
// app/api/marketplace/orders/route.ts (ejemplo)
import { withRlsTenant } from "@/lib/prisma-rls";

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  // ANTES: const orders = await prisma.order.findMany({ where: { tenantId: auth.tenantId } });
  // AHORA: el RLS lo aplica server-side
  const db = withRlsTenant(auth.tenantId);
  const orders = await db.order.findMany();
  // ...
}
```

## Fase 3 — Manejo de excepciones (día 4)

### 3.1 Crons cross-tenant

Todos los crons que tocan tablas con RLS necesitan setear `__system__`:

```ts
// app/api/cron/*/route.ts
import { rlsSystem } from "@/lib/prisma-rls";

async function handler() {
  const db = rlsSystem();
  // ahora db.order.findMany() ve TODOS los tenants
}
```

Lista de crons a migrar (de vercel.json, los que tocan Order/Customer/Sale/Payment/AuditLog):
- `/api/cron/abandoned-cart`
- `/api/cron/loyalty-anniversary`
- `/api/cron/credit-reminders`
- `/api/cron/churn-score`
- `/api/cron/audit-chain-integrity`
- (y otros — auditar lista completa)

### 3.2 Superadmin queries

`app/superadmin/**/page.tsx` usan datos cross-tenant. Migrar a `rlsSuperadmin()`:

```ts
import { rlsSuperadmin } from "@/lib/prisma-rls";

export default async function SuperadminTenantsPage() {
  await requirePlatformPage();
  const db = rlsSuperadmin();
  const allTenants = await db.tenant.findMany();
  // ...
}
```

### 3.3 Webhooks externos

Stripe/MP resuelven `tenantId` del payload (external_reference, customer mapping):

```ts
// Después de identificar el tenant via webhook payload:
const db = withRlsTenant(resolvedTenantId);
await db.order.updateMany({...});
```

## Fase 4 — Testing (día 5)

### 4.1 Test e2e cross-tenant leak

```ts
// __tests__/security/rls-cross-tenant.test.ts
describe("RLS cross-tenant isolation", () => {
  it("Order: tenant A no puede leer orders de tenant B", async () => {
    const dbA = withRlsTenant("tenant-A");
    const orderB = await prisma.order.create({ data: { tenantId: "tenant-B", ... } });
    const found = await dbA.order.findUnique({ where: { id: orderB.id } });
    expect(found).toBeNull(); // RLS bloquea
  });
  // ... 4 tests más (Customer, Sale, Payment, AuditLog)
});
```

### 4.2 Test smoke todos los crons en CI

Asegurar que cada cron setea `__system__` antes de queries.

### 4.3 Test que admin NO pierde acceso a sus propios datos

```ts
it("Admin del tenant A SÍ puede leer sus orders", async () => {
  const dbA = withRlsTenant("tenant-A");
  const order = await prisma.order.create({ data: { tenantId: "tenant-A", ... } });
  const found = await dbA.order.findUnique({ where: { id: order.id } });
  expect(found).not.toBeNull();
});
```

## Fase 5 — Rollout (día 5)

1. Deploy a staging
2. Smoke test manual del flujo crítico: checkout end-to-end + admin panel
3. Canary deploy 5% → 25% → 100% en producción
4. Monitor Sentry por 24h — alerta si aparecen errores `Cannot read property of undefined` (RLS bloqueando)
5. Si falla → rollback inmediato + revisar policies

## Rollback plan

```sql
-- Si algo se rompe, drop policies y disable RLS:
DROP POLICY "tenant_isolation_order" ON "Order";
ALTER TABLE "Order" DISABLE ROW LEVEL SECURITY;
-- (repetir para las 5 tablas)
```

`withRlsTenant()` callers seguirán funcionando porque `SET LOCAL` con RLS disabled es no-op.

## Métricas post-rollout

- **Latencia p99**: medir antes/después. Esperado: +1-2ms (1 query SET LOCAL por request).
- **Errores Sentry**: 0 nuevos `PostgresError: row violates row-level security policy` (significaría que algún caller no setea el contexto).
- **Logs MP/Stripe webhook**: confirmar que resolvedTenantId es correcto en todos los eventos.

## TODO bloqueante para Brandon

| # | Tarea | Tiempo | Bloquea |
|---|---|---|---|
| 1 | Aprobar este ADR | 15min | Sprint kickoff |
| 2 | Crear branch `feat/rls-postgres` | 2min | Implementación |
| 3 | Aceptar +1-2ms latencia p99 vs leak protection | Decision | Rollout |
| 4 | Disponibilidad para validar smoke test staging | 1h | Rollout |

---

## ⚠️ Resultado del piloto 2026-06-10 (audit P2) — LEER ANTES DE MIGRAR ENDPOINTS

**Verificado contra prod con psql:**

| Check | Resultado |
|---|---|
| Políticas creadas (`pg_policies`) | ✅ `tenant_isolation_*` en Order/Sale/Customer/ActivityLog |
| `relrowsecurity` + `relforcerowsecurity` | ✅ `t`/`t` en las 4 tablas core |
| Política filtra con `SET LOCAL app.tenant_id` | ❌ **NO** — devuelve todas las filas |
| Causa raíz | `postgres` (rol de la app) tiene **`rolbypassrls = true`** en Supabase |

**Conclusión:** adoptar `withRlsTenant()` en endpoints (TD-116) es **no-op** mientras la
app conecte como `postgres`. El orden correcto es:

1. Crear rol runtime sin bypass: `CREATE ROLE buleje_app LOGIN PASSWORD '...' NOBYPASSRLS;`
   + GRANT USAGE/SELECT/INSERT/UPDATE/DELETE sobre schema public + sequences.
2. `DATABASE_URL` → `buleje_app` en **canary** (validar permisos sobre 195 tablas,
   funciones y extensiones — alto riesgo de 42501 permission denied).
3. Smoke completo (checkout, POS, crons con `rlsSystem()`).
4. RECIÉN entonces migrar endpoints a `withRlsTenant()` (TD-116).

Pitfall adicional pendiente de validar en (2): `SET LOCAL` fuera de transacción es
no-op — la extensión `$allOperations` ejecuta `SET LOCAL` y la query como round-trips
separados; con pgBouncer transaction-mode pueden caer en conexiones distintas.
Validar con test de aislamiento real antes del rollout.
