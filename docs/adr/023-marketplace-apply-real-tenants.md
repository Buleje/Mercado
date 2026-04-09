# ADR-023: Marketplace `apply` debe crear Tenants reales (no fantasmas)

## Estado
✅ Aceptada — hotfix aplicado 2026-04-09 por AGENT FIX-TENANTS

## Fecha
2026-04-09

## Contexto

El endpoint público `POST /api/marketplace/stores/apply` permite que un dueño de bodega se registre en el marketplace sin auth. Internamente creaba el row `Store` con un `tenantId` **sintético**:

```ts
// app/api/marketplace/stores/apply/route.ts (antes del fix)
const store = await MarketplaceStoresDB.register({
  tenantId: `store-${ownerPhone.replace(/\D/g, "")}`,
  // ...
});
```

Ese string nunca existía como row real en la tabla `Tenant`. El FK `Store.tenantId` en Prisma apunta a `Tenant.id` vía `@relation`, pero la migración histórica dejó el constraint como soft — no había un `ON DELETE CASCADE` real validando la existencia. Consecuencias medidas:

1. **Multi-tenant roto** — el store quedaba huérfano: no tenía un Tenant matching en la BD.
2. **Login del dueño bloqueado** — cuando el superadmin intentaba aprobar la tienda y asignar un admin al tenant, `requireAdmin()` fallaba porque la sesión no matcheaba ningún `Tenant.id` real.
3. **`tenant-resolver` roto** — `lib/auth/tenant-resolver.ts` no podía resolver el tenant desde slug al intentar loguearse.
4. **Data-leak potencial** — dos bodegas distintas podían escribir con el mismo `store-51987654321` si compartían un subset de dígitos (ej: `+51987654321` vs `51987654321` normalizan igual).
5. **Pattern-match quebradizo** — la dedup check original (`tenantId === "store-" + digits`) dependía del string format exacto; cualquier cambio rompía duplicate detection.

El bug se verificó en producción: 1 tenant fantasma del tipo `store-51987654321` detectado via `scripts/check-tenants.mjs`.

## Opciones consideradas

### Opción A: Seguir con `tenantId` sintético + crear el Tenant real en la aprobación
- ✅ No toca el endpoint público
- ❌ Durante el periodo "pendiente" el store sigue huérfano (data leak potencial)
- ❌ El flujo de aprobación se complica: el superadmin tiene que adivinar el `ownerPhone` para regenerar el tenantId fantasma
- ❌ No resuelve el problema de raíz

### Opción B: Crear el Tenant REAL dentro del mismo `$transaction` que el Store
- ✅ Aislamiento multi-tenant garantizado desde el segundo 0
- ✅ `requireAdmin()` funciona inmediatamente cuando el superadmin aprueba
- ✅ `tenant-resolver.ts` puede encontrar el tenant por slug desde el día 1
- ✅ Campo `active: false` en Tenant refleja correctamente el estado "pendiente de aprobación"
- ✅ Dedup por `Tenant.ownerPhone` (un campo real del schema, ya existente) en lugar de pattern-match frágil
- ❌ Requiere migración de datos de stores pre-existentes (`scripts/cleanup-fake-tenants.ts`)
- ❌ Añade 1 INSERT más por apply

### Opción C: Usar un único Tenant "marketplace-pending" compartido por todos los stores pendientes
- ✅ Muy simple
- ❌ Viola la regla crítica #3 del CLAUDE.md: `tenantId` debe aislar datos por inquilino
- ❌ Cualquier query con `tenantId: "marketplace-pending"` mezclaría datos de N bodegas distintas
- ❌ Imposible auditar por tenant

## Decisión

Elegimos la **Opción B — crear el Tenant real en transaction**.

### Cambios aplicados

1. **`lib/db/marketplace.db.ts` — `MarketplaceStoresDB.register()` refactorizado:**
   - Ahora acepta `{ ownerName, ownerPhone, ownerEmail, storeName, description, category, zone, ... }` en lugar de un `tenantId` pre-calculado.
   - Helper `normalizePhone()` deja solo dígitos del teléfono (dedup key estable).
   - Dedup check: `prisma.tenant.findFirst({ where: { ownerPhone, type: "store" } })` — si ya existe, lanza `Error` con `code: "MKT_DUPLICATE_PHONE"` y `storeSlug` anterior.
   - Genera slugs únicos tanto para `Tenant.slug` como para `Store.slug` (ambos unique en schema) chequeando `findUnique` en paralelo antes de la transacción.
   - `prisma.$transaction` crea primero `tenant` (con `type: "store"`, `plan: "free"`, `active: false`, `ownerEmail`, `ownerPhone` normalizado) y después `store` apuntando a `tenant.id`.
   - Mantiene `invalidateByPrefix("marketplace:stores")` post-write.

2. **`app/api/marketplace/stores/apply/route.ts`:**
   - Remueve import de `prisma` (ya no hace queries directas).
   - Remueve la búsqueda manual `prisma.store.findMany` + match por pattern.
   - Llama directo a `MarketplaceStoresDB.register(...)` y traduce `MKT_DUPLICATE_PHONE` a HTTP 409 con `storeSlug`.

3. **`scripts/cleanup-fake-tenants.ts` (nuevo):**
   - Escanea toda la tabla `Store`. Detecta candidatos en dos buckets:
     - **Fantasma explícito**: `tenantId` matchea `/^store-\d+$/`
     - **Huérfano**: `tenantId` no existe como row real en `Tenant`
   - Para cada candidato: crea `Tenant` real con `name` derivado del store (evita duplicar "Bodega" si ya está en el name), actualiza `store.tenantId` → `tenant.id`, y migra referencias secundarias (`Order`, `StoreBanner`, `CommissionLedger`, `Review`) del tenantId viejo al nuevo — todo dentro de un `$transaction` por store.
   - Modo `--dry-run` por default. Flag `--apply` ejecuta.
   - Registrado en `package.json` como `"db:cleanup-fake-tenants": "tsx scripts/cleanup-fake-tenants.ts"`.

4. **`__tests__/api/marketplace-apply.test.ts` (nuevo):**
   - Test 1: `POST /apply` con datos válidos → invoca `$transaction` con tenant.create + store.create; el `tenantId` del store apunta al `id` del tenant recién creado.
   - Test 2: phone duplicado → HTTP 409, `$transaction` NUNCA se ejecuta.
   - Test 3: el tenantId retornado NO matchea el patrón fantasma `/^store-\d+$/`.
   - Test 4: datos inválidos → HTTP 400 via `safeParse`.

### Reglas del proyecto verificadas

- ✅ Regla #1 — route handler no llama Prisma directo. Todas las queries pasan por `MarketplaceStoresDB`.
- ✅ Regla #2 — `safeParse()` de Zod en el schema del body (ya estaba correcto).
- ✅ Regla #3 — `tenantId` en toda query nueva; el Tenant se crea antes del Store para que el `tenantId` sea un cuid real.
- ✅ Regla #5 — `invalidateByPrefix("marketplace:stores")` tras el write.
- ✅ Regla #7 — `logActivity(...)` sigue siendo fire-and-forget con `.catch(() => {})`.

## Consecuencias

### Positivas
- Los stores del marketplace son tenants reales desde el momento del apply.
- El superadmin puede aprobar un store y asignar un admin sin inventar tenantIds.
- `requireAdmin()` y `tenant-resolver.ts` funcionan uniformemente para stores del marketplace.
- La dedup key (`ownerPhone` normalizado sobre `Tenant.ownerPhone`) es más estable que el pattern-match anterior.
- `tenant.active = false` permite filtrar stores "pendientes" con una query real en lugar de inferir por el `isPublished` del store.
- Queda la puerta abierta para el flujo de aprobación: el superadmin solo tiene que flipear `tenant.active = true` + `store.isPublished = true`.

### Negativas
- Cada `apply` ahora hace 3 queries mínimas (`findFirst` tenant dedup + `findUnique × 2` slugs + `$transaction` con 2 inserts) vs la query flat anterior. Bajo el rate limit `STRICT` (5/hora/IP) es despreciable.
- Tenants pre-existentes con `tenantId` fantasma requieren el cleanup script antes del próximo deploy — bloqueante en producción, no en staging.
- Se debe correr `db:cleanup-fake-tenants --dry-run` en prod para verificar el alcance antes del `--apply`.

### Riesgos
- **Race condition en dedup**: si dos requests del mismo phone entran simultáneamente, la ventana entre `findFirst` y `$transaction.create` podría crear duplicados. Mitigación parcial: el rate limit `STRICT` (5/hora/IP) reduce la ventana a casos patológicos. **Futuro**: añadir un unique index en `Tenant.ownerPhone` (requiere migración Prisma + nueva ADR para manejar tenants legacy sin phone).
- **Cleanup script toca múltiples tablas**: se hace en `$transaction`, así que si falla algo se rollback. El modo `--dry-run` por default protege contra ejecución accidental.

## Migration path

1. Deploy del fix a staging (sin cleanup).
2. En staging: `npm run db:cleanup-fake-tenants` (dry-run) → verificar conteo de candidatos.
3. En staging: `npm run db:cleanup-fake-tenants -- --apply` → ejecutar.
4. Verificar que los tests e2e del marketplace siguen verdes en staging.
5. Deploy a producción.
6. En producción: `npm run db:cleanup-fake-tenants` (dry-run) → revisar output.
7. En producción: `npm run db:cleanup-fake-tenants -- --apply` → ejecutar en ventana de bajo tráfico.
8. Monitoreo post-apply: `scripts/check-tenants.mjs` para confirmar que no quedan `tenantId` fantasmas.

## Follow-ups pendientes

- [ ] Añadir unique index en `Tenant.ownerPhone` (nueva ADR + migración).
- [ ] Considerar soft-delete de tenants rechazados por el superadmin en lugar de hard-delete (ya está `active` como flag).
- [ ] Auditar `lib/db/marketplace.db.ts::syncInventory()` — crea stores con `tenantId` recibido del caller; verificar que siempre sea un cuid real, no un slug.
- [ ] Documentar en `docs/CLAUDE-EXTENDED.md` el flujo `apply → approve` del marketplace.

## Referencias

- `app/api/marketplace/stores/apply/route.ts` — route handler refactorizado
- `lib/db/marketplace.db.ts` — `MarketplaceStoresDB.register()` ahora crea Tenant real
- `scripts/cleanup-fake-tenants.ts` — data migration script
- `__tests__/api/marketplace-apply.test.ts` — cobertura del fix
- `prisma/schema.prisma:17` — modelo `Tenant` (ownerPhone, ownerEmail, type, plan, active)
- `prisma/schema.prisma:2333` — modelo `Store` (tenantId FK)
- ADR-001 — Multi-tenancy row-level (base histórica del aislamiento por tenantId)
- ADR-004 — Dual tenant resolution (contexto del tenant-resolver)
- CLAUDE.md reglas críticas #1, #3, #5
