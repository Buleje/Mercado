---
applyTo: "**/supabase*,**/prisma.ts,**/prisma.config*"
---

# Supabase Integration — Buleje

## Conexión (2 URLs, propósitos distintos)

```bash
# Session Pooler (pgBouncer) — para RUNTIME (queries normales)
DATABASE_URL=postgresql://postgres.[ref]:[pass]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true

# Direct Connection — para MIGRACIONES (prisma migrate)
DIRECT_URL=postgresql://postgres.[ref]:[pass]@db.[ref].supabase.co:5432/postgres
```

## Singleton de Prisma (lib/prisma.ts)

```typescript
import { PrismaClient } from "@/lib/generated/prisma";

const globalForPrisma = global as typeof global & { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ??= new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["query", "error"] : ["error"],
});

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

## prisma.config.ts (configuración de Prisma 7)

```typescript
// Define qué URL usa para runtime vs migraciones
// DATABASE_URL → pgBouncer (runtime)
// DIRECT_URL → direct (migrations)
```

## Por qué dos URLs

| | DATABASE_URL (pooler) | DIRECT_URL (direct) |
|--|----------------------|---------------------|
| Puerto | 6543 | 5432 |
| pgBouncer | ✅ Sí | ❌ No |
| `prisma migrate` | ❌ NO soportado | ✅ Requerido |
| Queries normales | ✅ Óptimo | ✅ Funciona pero sin pooling |
| Conexiones simultáneas | Muchas (pooled) | Limitadas |

## RLS (Row Level Security) en Supabase

```sql
-- RLS habilitado en Supabase por defecto en tablas nuevas
-- Para este proyecto: RLS deshabilitado (auth manejado por la app)
-- Si alguna vez se activa RLS, las queries de Prisma fallarán silenciosamente

-- Verificar en Supabase Dashboard → Table Editor → [tabla] → RLS
```

## Multi-tenant con subdominios

```typescript
// proxy.ts resuelve tenantId desde el hostname:
// buleje.bodegasaas.com → tenantId = "buleje"
// localhost → tenantId = "main" (desarrollo)
const ROOT_DOMAIN = process.env.ROOT_DOMAIN ?? "localhost";
```

## Variables de entorno para Supabase

```bash
DATABASE_URL=        # Session pooler (pgBouncer) - RUNTIME
DIRECT_URL=          # Direct connection - MIGRATIONS ONLY
# Root domain para multi-tenant:
ROOT_DOMAIN=bodegasaas.com
```

## Gotchas

- **`pgbouncer=true` en DATABASE_URL** — requerido para que Prisma sepa que está detrás de pgBouncer
- **Prisma Migrate con DATABASE_URL (pgBouncer)** → error: "prepared statements not supported"
- **Supabase free tier** — se pausa después de 1 semana de inactividad; hay que reactivarlo manualmente
- **Connection limit** — plan free tiene 60 conexiones simultáneas; usar `?connection_limit=1` en serverless
- **SSL** — Supabase requiere SSL por defecto; si hay error de SSL, agregar `?sslmode=require`
- **Tablas generadas por Prisma** — están en schema `public` de Supabase

## Anti-patrones

- NO usar DIRECT_URL para queries de producción — no escala
- NO instanciar `PrismaClient` fuera del singleton — genera "too many connections"
- NO conectar desde el browser a Supabase directamente — toda comunicación va por la API
