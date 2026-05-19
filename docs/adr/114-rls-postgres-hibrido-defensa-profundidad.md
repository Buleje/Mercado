# ADR-114 · RLS Postgres híbrido — defensa en profundidad multi-tenant

**Fecha:** 2026-05-18
**Estado:** Propuesto · pendiente implementación
**Autores:** Brandon Buleje + audit profundo arquitectura (Sprint 2)

## Contexto

Buleje aisla tenants a **nivel aplicación** vía:
- `tenantId` como 1er argumento obligatorio en toda query (CLAUDE.md regla #3)
- `prismaForTenant()` con extensión Prisma `$extends` que inyecta `tenantId` automático en findMany/findFirst/create/update (lib/tenant.ts)
- `lib/db/*.db.ts` (90 clases) como única vía de acceso a Prisma (CLAUDE.md regla #1)

**Problema detectado por audit (2026-05-18):** un solo bug en uno de los 90 archivos `*.db.ts` filtra datos cross-tenant. El audit Fase 1 encontró 1 caso real (`proof-url/route.ts` con `authTenantId=null`). Hay 47+ `// eslint-disable-next-line no-restricted-properties` documentados como `@prisma-direct ok` — son code smell aceptable hoy pero crecen con el tiempo.

**Trigger de decisión:** Brandon planea captar 50+ tenants pagos. La probabilidad de bug × volumen de tenants × multa Ley 29733 PE (S/50K+) = riesgo inaceptable.

## Decisión

Implementar **RLS Postgres híbrido** — Row Level Security en 5 tablas de mayor riesgo PII/dinero, dejando el resto con app-level guard. Filosofía: "no todo o nada, sí defensa en profundidad donde sangra el dinero."

### Tablas elegidas

1. **`Order`** — pedidos del marketplace + ERP (incluye `customerPhone`, `customerLocation`, `total`)
2. **`Customer`** — datos del cliente final (PII)
3. **`Sale`** — ventas POS (dinero + payment refs)
4. **`Payment`** — transacciones Yape/Stripe/MP (PII bancaria)
5. **`AuditLog`** — chain de auditoría (Ley 29733)

Razón de estas 5: cubren el 80% del riesgo legal/económico. Otras tablas (Product, Category, Settings) pueden esperar a Sprint 4.

### Estrategia técnica

```sql
-- Por cada tabla elegida:

ALTER TABLE "Order" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON "Order"
  USING ("tenantId" = current_setting('app.tenant_id', true));

-- (true = silent NULL si no está seteado, en lugar de error)
```

### Setear `app.tenant_id` por request

`lib/prisma.ts` ya tiene Pool extension. Agregar middleware que ejecute al inicio de cada transacción/query:

```ts
// lib/prisma-rls.ts (nuevo)
import { Prisma } from "@/lib/generated/prisma/client";

export function rlsExtension(tenantId: string) {
  return Prisma.defineExtension({
    name: "rls-tenant",
    query: {
      $allOperations: async ({ args, query }) => {
        // SET LOCAL solo dentro de la tx — vuelve al default al commit
        await prisma.$executeRaw`SET LOCAL app.tenant_id = ${tenantId}`;
        return query(args);
      },
    },
  });
}
```

Caller (route handler):

```ts
const auth = await requireAdmin(req);
const db = prisma.$extends(rlsExtension(auth.tenantId));
const orders = await db.order.findMany(); // RLS aplicado automáticamente
```

### Excepciones

- **Superadmin queries** — `app.tenant_id` no seteado → RLS bloquea. Workaround: superadmin queries usan `SET LOCAL app.tenant_id = '__superadmin__'` + policy que permite ese magic value.
- **Crons cross-tenant** — `app.tenant_id = '__system__'` + policy permite.
- **Webhooks externos** (Stripe/MP) — resuelven tenantId del payload, luego setean.

## Consecuencias

### Pros
- Defensa en profundidad: bug en `*.db.ts` no compromete a otros tenants
- Compliance Ley 29733 PE más fuerte
- Sentry/logs muestran rejection a nivel DB (no silent fail)
- RLS es estándar Postgres — auditable por external pentesters

### Contras
- Setup inicial: 5d (migración + RLS policies + middleware Prisma + tests)
- Costo runtime: +1 query `SET LOCAL` por request → ~1-2ms p99 latencia
- Caso edge: queries cross-tenant legítimas (admin global) requieren whitelist explícita
- Vendor lock-in marginal: Postgres-specific (no MySQL/MongoDB)

### Riesgos de migración

1. **Cron jobs olvidados** — si algún cron no setea `app.tenant_id` antes de query, RLS bloquea silenciosamente → no procesa nada. Mitigación: agregar test e2e que ejecute cada cron en CI.
2. **Migrations sin tenantId** — Prisma migrate genera ALTER que toca todas las rows. Necesita `BYPASSRLS` temporal en el usuario de migrations.

## Alternativas consideradas

| Opción | Por qué descartada |
|---|---|
| RLS completo (toda tabla con tenantId) | 5 sprints de trabajo, complejidad alta para tablas low-risk |
| Mantener solo app-level | El audit detectó 1 leak real → no es suficiente para 50+ tenants pagos |
| Migrar a Supabase RLS via JWT | Cambio de arquitectura mayor, requiere reescribir auth completo |
| Sharding tenant-per-schema | Premature optimization para volumen actual; reservar para 500+ tenants |

## Implementación

Plan paso-a-paso en `docs/security/rls-postgres-runbook.md`.

## Referencias

- audit profundo 2026-05-18 (Sprint 2 arquitectura)
- CLAUDE.md regla #1, #3
- ADR-014 proxy-middleware-split (tenant resolution chain)
- ADR-057 hub-spoke routing
- Postgres docs: https://www.postgresql.org/docs/current/ddl-rowsecurity.html
- Supabase RLS guide (referencia): https://supabase.com/docs/guides/auth/row-level-security
