# ADR-052 — Plan: activar Row Level Security como segunda capa

**Fecha:** 2026-04-10
**Estado:** 📋 PLANNED · Esfuerzo M · Bloque: Seguridad · #03 del backlog

## Contexto
El aislamiento multi-tenant hoy es **100% app-level** vía regla #3 de CLAUDE.md (`tenantId` como primer parámetro en toda query en `lib/db/*`). Funciona, pero:
- Un solo olvido en una query nueva → leak entre tenants
- Sin cinturón de seguridad de DB
- Las 137 tablas multi-tenant dependen de que 50+ archivos `*.db.ts` NO tengan ni un bug
- 22 TODOs/FIXMEs en `lib/db/*` sin revisar (hallazgo del LIBRO_ERP_BLAS.md)

RLS sería la **segunda capa** — si la app tiene un bug, Postgres mismo rechaza la query.

## Decisión tentativa
Activar RLS gradualmente con pattern `current_tenant_id()`:
1. Variable de sesión por conexión: `SET app.current_tenant_id = '<id>'`
2. Policy en cada tabla: `USING (tenantId = current_setting('app.current_tenant_id'))`
3. Middleware en `lib/prisma.ts` que hace `$executeRaw SET` al checkout de conexión
4. **Blocker**: Supabase pooler (Pgbouncer) no soporta `SET LOCAL` bien con transaction mode. Necesitamos session mode o bypass con `@prisma/adapter-pg` directo (ya usado).

## Plan de ejecución (estimado 3 sprints · ~24h)

### Sprint 1 — Probar el pattern en 1 tabla (6h)
- [ ] Script `scripts/rls-enable-products.sql`: activa RLS en `Product`
- [ ] Modificar `lib/db/products.db.ts` para SET session var antes de cada query
- [ ] Test: otro tenant NO puede leer productos aunque pida SQL directo
- [ ] Medir latencia: esperado +2-5ms por query (aceptable)

### Sprint 2 — Generar policies para 137 tablas (12h)
- [ ] Script `scripts/rls-generate-policies.ts` que lee `schema.prisma` y genera SQL:
  ```sql
  ALTER TABLE "Product" ENABLE ROW LEVEL SECURITY;
  CREATE POLICY tenant_isolation ON "Product"
    USING ("tenantId" = current_setting('app.current_tenant_id', true));
  ```
- [ ] 3 tablas globales NO reciben policy: `PlatformSetting`, `RoadmapItemStatus`, `CronDeadLetter`
- [ ] PR review tabla por tabla

### Sprint 3 — Rollout por tenant (6h)
- [ ] Feature flag `RLS_ENABLED` por tenant
- [ ] Habilitar en staging primero, verificar con DR drill
- [ ] Habilitar en prod tenant a tenant
- [ ] Cuando 100% está en RLS, borrar el flag

## Riesgos
| Riesgo | Mitigación |
|---|---|
| Query con JOIN cross-tenant falla silenciosa | Tests e2e específicos por tabla |
| Supabase pooler + SET LOCAL no funciona | Bypass con `@prisma/adapter-pg` session mode |
| Migraciones Prisma borran policies | Usar `prisma migrate dev --create-only` + editar SQL |
| Background jobs (BullMQ) sin session var | Crear helper `withTenantContext(tenantId, fn)` |

## Bloqueadores
- Confirmar que `@prisma/adapter-pg` + Supabase pooler permite SET per-request
- DRY run de policies en staging antes de prod

## Alternativas
- **Quedarse con app-level** — status quo. Más rápido pero frágil.
- **Esperar a Supabase Auth migration (ADR-051)** — RLS con `auth.uid()` es más idiomático. **Recomendación**: hacer ADR-051 primero, luego ADR-052.

## Referencias
- Supabase RLS docs
- PostgreSQL CREATE POLICY
- `lib/prisma.ts` (a modificar)
- ADR-051 Supabase Auth
