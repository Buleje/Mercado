# ADR-083 — Migration plan: `Customer.@@id([tenantId, phone])`

**Status:** Proposed (NO ejecutar sin owner asignado + window de mantenimiento)
**Date:** 2026-04-29
**Authors:** Brandon Buleje + Claude (post-auditoría 2026-04-29)
**Depends on:** ADR-082 (multi-tenant-isolation)
**Risk:** ALTO — toca FKs en 9+ tablas, requiere zero-downtime expand-migrate-contract

---

## Contexto

ADR-082 cerró 15 vectores explotables del audit. **Pero la PK global `Customer.phone` sigue siendo el origen estructural de la categoría completa**: cualquier dev que escriba `prisma.customer.findUnique({ where: { phone } })` sin filtro `tenantId` leakea PII cross-tenant. Hoy lo previene la ESLint rule (`error` con allowlist 318) + ADR-082, pero **eliminarlo en schema es la única defensa que NO depende de disciplina humana**.

Este ADR diseña la migración a una PK compuesta `@@id([tenantId, phone])` con expand-migrate-contract para zero-downtime.

## Estado actual del schema

```prisma
model Customer {
  phone     String   @id          // PK GLOBAL — origen del riesgo
  tenantId  String
  name      String?
  email     String?
  documento String?
  // ...
  reviews              Review[]              @relation(...)
  loyaltyTransactions  LoyaltyTransaction[]  @relation(...)
  // ...
  @@index([tenantId])
}

model LoyaltyTransaction {
  id          String   @id @default(cuid())
  tenantId    String
  customerId  String   // referencia phone (no FK formal)
  // ...
}
```

**Problema:** dos tenants no pueden tener un cliente con el mismo phone. Y queries por phone leakean cross-tenant si el dev olvida `tenantId`.

## Estado objetivo

```prisma
model Customer {
  phone     String
  tenantId  String
  name      String?
  // ...
  @@id([tenantId, phone])    // PK compuesta — fix definitivo
  @@index([phone])           // para lookups marketplace cross-tenant intencionales
}

model LoyaltyTransaction {
  id          String   @id @default(cuid())
  tenantId    String
  customerPhone String  // explicitly named (no más "customerId")
  // ...
  customer Customer @relation(fields: [tenantId, customerPhone], references: [tenantId, phone])
  @@index([tenantId, customerPhone])
}
```

## Tablas afectadas (9 confirmadas)

| Tabla | Campo que referencia `Customer.phone` | Acción |
|---|---|---|
| `Review` | `phone` | renombrar → `customerPhone` + composite FK |
| `LoyaltyTransaction` | `customerId` (es phone) | renombrar → `customerPhone` + composite FK |
| `Order` | `customerPhone` | ya tiene tenantId ✅ |
| `MarketplaceAbandonedCart` | `customerPhone` | agregar `tenantId` (HOTFIX-C4 ya lo valida post-fetch) |
| `Reservation` | `customerPhone` | composite FK |
| `Subscription` (socio-buleje) | `customerPhone` | composite FK |
| `GiftCard` redemptions | `redeemedByPhone` | composite FK |
| `CouponUsage` | `customerPhone` | composite FK |
| `PaymentLink` | `customerPhone` | composite FK |

## Plan expand-migrate-contract (zero-downtime)

### FASE 1 — EXPAND (días 1-3, deploy único)

**Goal:** schema acepta el nuevo modelo sin romper el viejo.

1. Agregar columna `tenantId` a tablas que no la tengan (`MarketplaceAbandonedCart`).
2. Agregar índice compuesto `(tenantId, phone)` en `Customer`. NO cambiar PK aún.
3. Backfill: `UPDATE MarketplaceAbandonedCart SET tenantId = (SELECT tenantId FROM Store WHERE slug = storeSlug)` con batches de 1000 rows.
4. Generar nueva clase `CustomersDB.findByTenantPhone(tenantId, phone)` en `lib/db/customers.db.ts` que use el índice compuesto.
5. Deploy. Verifica `cron/isolation-monitor` reporta 0 cross-tenant.

**Rollback FASE 1:** drop del índice compuesto y de la columna nueva.

### FASE 2 — MIGRATE (días 4-10, código progresivo)

**Goal:** todo el código nuevo usa la API compuesta. Código viejo queda compatible.

1. Migrar los 318 archivos del allowlist progresivamente: cada PR convierte ≥10 archivos a `CustomersDB.findByTenantPhone()`. Quitar del allowlist.
2. Los handlers que filtran por phone agregan `where: { tenantId }` (la mayoría ya lo hace tras HOTFIX wave 1+2).
3. Tests E2E con dos tenants A/B + cliente compartido → verifica que cada API devuelve solo el customer del tenant correcto.
4. ADR-082 queda con allowlist en 0. ESLint rule sigue en `error` (sin allowlist).

**Rollback FASE 2:** los archivos migrados pueden volver al patrón viejo via `git revert`. La API compuesta convive con la global.

### FASE 3 — CONTRACT (días 11-14, deploy de schema breaking)

**Goal:** eliminar la PK global, fijar la compuesta como única.

1. Renombrar columnas FK en 9 tablas (`customerId → customerPhone`, `phone → customerPhone`) via migration con `prisma migrate dev` + manual SQL `ALTER TABLE ... RENAME COLUMN`.
2. Cambiar `Customer.@id(phone)` → `@@id([tenantId, phone])` en `prisma/schema.prisma`.
3. Eliminar índice global solo-phone (queda solo el compuesto + uno secundario `@@index([phone])` para lookups marketplace).
4. `prisma migrate deploy` con `DIRECT_URL` (NO via pgBouncer — DATABASE_URL).
5. Verificar `cron/isolation-monitor` 0 alerts × 24h.
6. Eliminar la clase legacy `findUnique({phone})` y forzar `findByTenantPhone`.

**Rollback FASE 3:** complejo. Backup pre-migration es **obligatorio**. El hook `pre-deploy-db-snapshot.mjs` ya genera snapshot antes de deploy.

## Validaciones obligatorias antes de cada fase

| Gate | Comando | Bloqueante |
|---|---|---|
| TypeScript clean | `npx tsc --noEmit` | sí |
| Tests vitest pasa | `npm test` | sí |
| Tests Playwright cross-tenant E2E | `npm run test:e2e -- multi-tenant` | sí |
| Cron isolation-monitor 0 alerts × 24h | manual via `app/api/cron/isolation-monitor/route.ts` log | sí |
| DB snapshot reciente (<2h) | `pre-deploy-db-snapshot.mjs` hook | sí |
| Canary 5%→25%→100% en Vercel | manual | sí |

## Estimación

| Fase | Tiempo | Owner | Riesgo |
|---|---|---|---|
| FASE 1 (expand) | 1-2 días | DB engineer | Bajo |
| FASE 2 (migrate) | 5-7 días | Backend team (rolling PRs) | Medio |
| FASE 3 (contract) | 2-3 días + 24h verify | DB engineer + DevOps | **Alto** (breaking schema) |
| **Total** | **2-3 semanas** | | |

## Por qué NO ejecutar inmediatamente

1. **Riesgo alto vs valor incremental:** ADR-082 + ESLint error + 67 tests YA bloquean los vectores explotables. La PK compuesta es la "última milla" del aislamiento — cierra la categoría por construcción, pero el riesgo de demanda Ley 29733 ya bajó a "bajo-medio" sin esta migration.
2. **Requiere window de mantenimiento:** la FASE 3 toca FKs en 9 tablas. Ventana sugerida: domingo 02:00-05:00 PE (tráfico mínimo).
3. **Owner necesario:** Brandon o un DB engineer asignado, NO un agente IA solo. El rollback de FASE 3 es manual y necesita decisión humana.

## Alternativa intermedia (recomendada): FASE 1 sola

**Si querés "más blindaje SIN migration completa":**
- Ejecutar FASE 1 (índice compuesto + backfill MarketplaceAbandonedCart): 1-2 días, riesgo bajo, **da defense-in-depth real** porque las queries por `(tenantId, phone)` son atómicas en DB.
- Posterga FASE 2/3 a sprint dedicado con owner.

## Referencias

- ADR-082 — Multi-tenant isolation (defensas actuales)
- `prisma/schema.prisma` líneas 215-250 (modelo Customer actual)
- Skill `migration-planner` — patrón expand-migrate-contract
- `.claude/hooks/pre-deploy-db-snapshot.mjs` — snapshot pre-deploy
- `app/api/cron/isolation-monitor/route.ts` — cron defense-in-depth

## Pendiente para aprobación de Brandon

| Pregunta | Respuesta sugerida |
|---|---|
| ¿Asignar owner ahora? | postpone — ningún vector explotable hoy lo requiere |
| ¿Ejecutar FASE 1 (intermedia)? | sí en próximo sprint si Brandon decide |
| ¿Programar FASE 2-3 para sprint X? | requiere planning de capacity |
| ¿Mantener ADR como "Proposed" hasta entonces? | sí |
