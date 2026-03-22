---
applyTo: "**/prisma/**,**/*.db.ts,**/db/**"
---

# Database Migrations — Bodega San Martín

## Regla #1: DIRECT_URL para migraciones

```bash
# pgBouncer (session pooler) NO soporta Prisma Migrate.
# Siempre usar DIRECT_URL para migraciones.

# .env local:
DATABASE_URL="postgresql://user:pass@db.supabase.co:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://user:pass@db.supabase.co:5432/postgres"
```

## Flujo seguro de migración

```bash
cd bodega-san-martin

# 1. SIEMPRE validar el schema antes de migrar
npx prisma validate

# 2. Crear migración (con DIRECT_URL configurado)
npm run db:migrate
# → Solicita nombre: "add_batch_location_field"

# 3. Regenerar cliente Prisma
npx prisma generate

# 4. Verificar build
npm run build
```

## Prisma config (prisma.config.ts)

```typescript
// Configurado en prisma.config.ts — no modificar sin entender
// Usa DATABASE_URL para runtime (pgBouncer)
// Usa DIRECT_URL para migrations
```

## DB Classes — capa de abstracción (NUNCA Prisma directo)

```
lib/db/
  products.db.ts      — ProductsDB: getAll, getById, create, update, delete + cache
  orders.db.ts        — OrdersDB: state machine, idempotency, getFiltered
  customers.db.ts     — CustomersDB: lookup por phone (PK)
  inventory.db.ts     — InventoryDB: decrementFEFO, refreshProductExpiresAt
  sales.db.ts         — SalesDB: POS ventas
  finance.db.ts       — FinanceDB: expenses, payables, cash registers
  promotions.db.ts    — PromotionsDB: cupones, promociones
  purchases.db.ts     — PurchasesDB: órdenes de compra
  settings.db.ts      — SettingsDB: configuración por tenant
  notifications.db.ts — NotificationsDB: push, in-app
  misc.db.ts          — tipos compartidos, normalizePhone
```

## Patrón de DB class con cache

```typescript
// CORRECTO — usando DB class (incluye cache + audit):
const products = await ProductsDB.getAll(tenantId);

// INCORRECTO — Prisma directo en route handler:
const products = await prisma.product.findMany(); // ← nunca
```

## Idempotency en órdenes

```typescript
// OrdersDB valida idempotencyKey antes de crear
// Si la key ya existe → retorna la orden existente (no duplica)
const order = await OrdersDB.create({ ...data, idempotencyKey: uuid });
```

## State machine de Order

```
pending → confirmed → preparing → ready → delivered
       ↓
    cancelled (desde cualquier estado antes de delivered)
```
Transiciones válidas definidas en `lib/db/orders.db.ts`. Intentar transición inválida lanza error.

## Patrones de schema seguros

```prisma
// Agregar campo nullable (backward compatible):
newField   String?   // ← seguro, no rompe registros existentes

// Agregar campo con default (backward compatible):
newField   Boolean   @default(false)  // ← seguro

// Renombrar campo → PELIGROSO: crear nuevo + migrar datos + borrar viejo
// NO usar @map en producción sin datos de respaldo
```

## Gotchas ⚠️

- **Usar DATABASE_URL para `migrate`** → error de pgBouncer: "prepared statements not supported"
- **`npm run db:migrate` sin DIRECT_URL** → falla silenciosamente o error de conexión
- **Prisma directo en route handler** → bypasea cache invalidation → datos stale
- **Renombrar campo en schema** → Prisma interpreta como drop + create → pérdida de datos
- **`generate` después de schema change** → sin `generate`, el cliente TypeScript no conoce los nuevos campos
- **Batch duplicado** — fue corregido. El schema tenía dos modelos Batch. Mantener solo el de línea ~969

## Checklist antes de migrar a producción

- [ ] `npx prisma validate` sin errores
- [ ] Migración probada en DB de desarrollo primero
- [ ] Campos nuevos son nullable o tienen default (no rompen registros existentes)
- [ ] `npm run build` pasa después de `generate`
- [ ] `npm run test` pasa
- [ ] Backup de DB de producción tomado
