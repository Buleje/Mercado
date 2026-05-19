# Dry-run RLS Postgres — Resultados 2026-05-18

> Sprint Final Producción · ejecutado vía Supabase MCP `execute_sql` con
> `BEGIN; ... ROLLBACK;` (nada persistió en la DB).

## Resumen ejecutivo

| Item | Status |
|---|:-:|
| SQL de policies funciona | ✅ |
| Cross-tenant isolation efectivo | ✅ |
| Bypass `__system__` funciona | ✅ |
| **Listo para aplicar real** | ❌ — bloqueante: rol Prisma |

## Smoke tests (rol `authenticated`, sin BYPASSRLS)

| Test | Esperado | Real | OK |
|---|:-:|:-:|:-:|
| A1 — tenant real `cmoevpwfk...` ve sus orders | 28 | **28** | ✅ |
| A2 — tenant real ve sus customers | (variable) | 11 | ✅ |
| A3 — tenant real ve sus sales | (variable) | 1 | ✅ |
| B1 — fake tenant orders | 0 | **0** | ✅ |
| B2 — fake tenant customers | 0 | **0** | ✅ |
| C1 — empty context orders | 0 | **0** | ✅ |
| D1 — `__system__` bypass orders | 61 | **61** | ✅ |
| D2 — `__system__` bypass activity | 1,289 | **1,289** | ✅ |

## Baseline data (pre-RLS, producción)

```
Orders:       61 (en 5 tenants distintos)
Customers:    19
Sales:        19
Payments:     0 (tabla vacía)
ActivityLog:  1,289
```

Tenants con más volumen:

```
cmoevpwfk0000l4vzwq6revm5 — 28 orders
main                      — 19 orders
cmnl82b0h00007gvzs2aofny3 — 6 orders
cmnqegc5r0000p4vzb2cu0txq — 5 orders
cmom36x9100008xvz7x2hzhsn — 3 orders
```

## Hallazgos críticos detectados

### #1 — Migration SQL referencia tabla incorrecta

**Original** del agente database (`prisma/migrations/2026_05_18_add_rls_policies/migration.sql`):

```sql
ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
```

**Real en DB**: la tabla se llama `ActivityLog`, no `AuditLog`.

**Fix**: actualizar migration.sql para usar `ActivityLog`. Hecho en este reporte; pendiente actualizar el archivo SQL antes de aplicar.

### #2 — `Payment` no tiene columna `tenantId`

**Estructura real**:

```
id          text   NOT NULL (PK)
payableId   text   NOT NULL (FK → Order/Sale)
amount      numeric
method      text
date        timestamp
reference   text
```

Payment se vincula al tenant **indirectamente** vía `payableId → Order.tenantId`.

**Implicación**: no se puede aplicar policy directa con `tenantId = current_setting(...)`.

**Opciones**:
- A. Omitir Payment del RLS (la policy en Order/Sale ya lo protege en JOINs)
- B. Policy con subquery EXISTS (costosa en performance)
- C. Agregar columna `tenantId` a Payment (schema change zona peligro)

**Decisión inmediata**: **Opción A**. Documentado como TD.

### #3 — 🔴 **Prisma usa rol `postgres` con BYPASSRLS** — bloqueante

**Roles encontrados en la DB Supabase**:

| Rol | `rolbypassrls` | `rolsuper` |
|---|:-:|:-:|
| `postgres` | **true** 🔴 | false |
| `service_role` | true | false |
| `authenticator` | false | false |
| `authenticated` | false | false |
| `anon` | false | false |

Prisma se conecta por default como `postgres` (BYPASSRLS=true), lo cual significa que **CUALQUIER policy de RLS es ignorada** cuando la app consulta.

**Conclusión**: aplicar la migration ahora **NO mejora la seguridad de la app real**. Sólo bloquea queries de roles restringidos (que no usamos).

## Prerequisitos antes de aplicar real

| # | Acción | SQL/Config | Tiempo |
|---|---|---|:-:|
| 1 | Crear rol `app_user` sin BYPASSRLS | `CREATE ROLE app_user LOGIN PASSWORD '...';` | 5 min |
| 2 | GRANT permisos en schema y tablas | `GRANT USAGE ON SCHEMA public TO app_user; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO app_user; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO app_user;` | 5 min |
| 3 | Crear rol `prisma_migrator` con BYPASSRLS | `CREATE ROLE prisma_migrator LOGIN PASSWORD '...' BYPASSRLS;` | 5 min |
| 4 | Actualizar `DATABASE_URL` en Vercel → usuario `app_user` | env var redeploy | 15 min |
| 5 | Mantener `DIRECT_URL` con `prisma_migrator` | env var | 5 min |
| 6 | Smoke test prod 30 min — login, checkout, admin | manual + Sentry | 30 min |
| 7 | Aplicar migration RLS (ahora SÍ efectiva) | `apply_migration` MCP | 2 min |
| 8 | Smoke test cross-tenant final | dry-run repetido | 10 min |

**Tiempo total estimado**: ~1.5 horas con buen orden + ventana de baja actividad (madrugada PE).

## Plan de aplicación recomendado (canary)

1. **Día N (ahora)**: crear roles `app_user` + `prisma_migrator` en prod (con SQL directo, sin tocar app). No afecta nada.
2. **Día N+1 (madrugada)**: actualizar `DATABASE_URL` Vercel → canary deploy 5%. Monitor Sentry 30 min.
3. Si OK → canary 25% → 100% durante 1 hora.
4. **Día N+2**: aplicar migration RLS. Smoke test inmediato.
5. **Día N+3 a N+7**: monitor Sentry diario, validar 0 errors RLS bloqueando queries legítimas.

## Migration SQL corregida (lista para aplicar)

```sql
-- 4 tablas (sin Payment, que no tiene tenantId)
ALTER TABLE public."Order" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Order" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_order" ON public."Order"
  USING ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.tenant_id', true) IN ('__system__','__superadmin__'));

ALTER TABLE public."Customer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Customer" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_customer" ON public."Customer"
  USING ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.tenant_id', true) IN ('__system__','__superadmin__'));

ALTER TABLE public."Sale" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Sale" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_sale" ON public."Sale"
  USING ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.tenant_id', true) IN ('__system__','__superadmin__'));

ALTER TABLE public."ActivityLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ActivityLog" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_activitylog" ON public."ActivityLog"
  USING ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.tenant_id', true) IN ('__system__','__superadmin__'));

-- GRANTs a app_user (rol sin BYPASSRLS) — sólo se ejecuta DESPUÉS de crear el rol
GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON public."Order", public."Customer",
                                       public."Sale", public."ActivityLog" TO app_user;
```

## Rollback (si algo falla post-aplicación)

```sql
DROP POLICY IF EXISTS "tenant_isolation_order" ON public."Order";
ALTER TABLE public."Order" DISABLE ROW LEVEL SECURITY;
-- repetir para Customer, Sale, ActivityLog
```

## Veredicto

- ✅ **SQL validado** — pasa los 8 smoke tests
- ✅ **Cross-tenant isolation funciona** cuando el rol no bypassea
- ❌ **NO aplicar todavía** — falta crear rol `app_user` + cambiar `DATABASE_URL`
- 📝 **Migration SQL del agente** necesita 2 correcciones: rename `AuditLog → ActivityLog`, quitar Payment
