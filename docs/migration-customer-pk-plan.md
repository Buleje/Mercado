# TD-040 — Customer.phone PK → surrogate id (expand-migrate-contract)

> Creado: 2026-05-09 | Estado: **FASE 1 EXPAND aplicada**

## Problema

`Customer.phone String @id` es un PK global: dos tenants no pueden registrar el mismo
número de teléfono. Esto bloquea el modelo multi-tenant real de Buleje.

---

## Fase 1 — EXPAND (esta tarea, DONE)

### Qué se hizo al schema

| Modelo | Cambio |
|---|---|
| `Customer` | `phone @id` → `id String @id @default(cuid())` + `phone @unique` (global, temporal) |
| `Customer` | Agrega comentario-objetivo: `@@unique([tenantId, phone])` para Fase 3 |
| `Customer` | `@@index([tenantId, phone])` reemplazado por `@@index([phone])` |
| `Order` | Agrega `customerId String?` (paralelo a `customerPhone`) |
| `Sale` | Agrega `customerId String?` (paralelo a `customerPhone`) |
| `SavedCart` | Agrega `customerId String?` (paralelo a `customerPhone`) |
| `SavedLocation` | Agrega `customerId String?` (paralelo a `customerPhone`) |
| `CustomerNotification` | Agrega `customerId String?` (paralelo a `customerPhone`) |

> Los modelos `LoyaltyTransaction`, `Fiado`, `Prestamo`, `Cotizacion` ya usan
> `customerId` como FK (apuntando al phone). Se migrarán junto a los anteriores en Fase 2.

### Por qué phone mantiene @unique (temporal)

Prisma exige que el campo referenciado en una FK sea `@id` o `@unique` (single-field).
`@@unique([tenantId, phone])` es composite y no puede servir como FK target.
`phone @unique` preserva el contrato de todas las relaciones `references: [phone]` existentes
mientras backfillamos `customerId` en Fase 2. En Fase 3 se relaja a `@@unique([tenantId, phone])`.

---

## Fase 2 — MIGRATE (sprint dedicado)

### SQL de backfill

Ejecutar con `DIRECT_URL` (no pgBouncer) dentro de una transacción:

```sql
-- Paso A: poblar customerId en Order
UPDATE "Order" o
SET "customerId" = c.id
FROM "Customer" c
WHERE o."customerPhone" = c.phone
  AND o."tenantId" = c."tenantId";

-- Paso B: poblar customerId en Sale
UPDATE "Sale" s
SET "customerId" = c.id
FROM "Customer" c
WHERE s."customerPhone" = c.phone
  AND s."tenantId" = c."tenantId";

-- Paso C: poblar customerId en SavedCart
UPDATE "SavedCart" sc
SET "customerId" = c.id
FROM "Customer" c
WHERE sc."customerPhone" = c.phone
  AND sc."tenantId" = c."tenantId";

-- Paso D: poblar customerId en SavedLocation
-- SavedLocation no tiene tenantId propio; join por customerPhone global
UPDATE "SavedLocation" sl
SET "customerId" = c.id
FROM "Customer" c
WHERE sl."customerPhone" = c.phone;
-- NOTA: si un phone existe en múltiples tenants (imposible en Fase 1 por @unique global),
-- este UPDATE asignaría un Customer arbitrario. Seguro mientras @unique global esté activo.

-- Paso E: poblar customerId en CustomerNotification
UPDATE "CustomerNotification" cn
SET "customerId" = c.id
FROM "Customer" c
WHERE cn."customerPhone" = c.phone
  AND cn."tenantId" = c."tenantId";

-- Paso F: re-apuntar LoyaltyTransaction.customerId (hoy almacena phone, debe almacenar id)
UPDATE "LoyaltyTransaction" lt
SET "customerId" = c.id
FROM "Customer" c
WHERE lt."customerId" = c.phone; -- lt.customerId hoy contiene el phone value

-- Paso G: re-apuntar Fiado.customerId
UPDATE "Fiado" f
SET "customerId" = c.id
FROM "Customer" c
WHERE f."customerId" = c.phone
  AND f."tenantId" = c."tenantId";

-- Paso H: re-apuntar Prestamo.customerId
UPDATE "Prestamo" p
SET "customerId" = c.id
FROM "Customer" c
WHERE p."customerId" = c.phone
  AND p."tenantId" = c."tenantId";

-- Paso I: re-apuntar Cotizacion.customerId
UPDATE "Cotizacion" cot
SET "customerId" = c.id
FROM "Customer" c
WHERE cot."customerId" = c.phone
  AND cot."tenantId" = c."tenantId";
```

### Cambios de schema en Fase 2

1. Cambiar todas las relaciones `references: [phone]` → `references: [id]`
2. En modelos con `customerPhone` como FK: cambiar la relación para usar `customerId`
3. Activar FK real en Prisma para los `customerId` campos
4. Dual-write en `lib/db/customers.db.ts`: al crear Order/Sale/etc, poblar ambos campos

---

## Fase 3 — CONTRACT (sprint posterior a Fase 2)

### Condición de entrada

- `customerId` NOT NULL en >99.9% de filas (verificar con `SELECT COUNT(*) WHERE customerId IS NULL`)
- Dual-write activo y estable en producción por ≥7 días

### Cambios de schema

```prisma
// Customer: relaja @unique en phone → composite constraint
phone  String  // quitar @unique
@@unique([tenantId, phone])  // activar como constraint real
```

### SQL de contract

```sql
-- Eliminar columnas legacy
ALTER TABLE "Order" DROP COLUMN "customerPhone";
ALTER TABLE "Sale" DROP COLUMN "customerPhone";
ALTER TABLE "SavedCart" DROP COLUMN "customerPhone";
ALTER TABLE "SavedLocation" DROP COLUMN "customerPhone";
ALTER TABLE "CustomerNotification" DROP COLUMN "customerPhone";

-- Hacer NOT NULL los customerId que eran nullable
ALTER TABLE "Order" ALTER COLUMN "customerId" SET NOT NULL;
-- (repetir para Sale, SavedCart, SavedLocation, CustomerNotification)

-- Activar @@unique([tenantId, phone]) como constraint
-- (Prisma generate lo emite; validar que no haya duplicados antes)
```

---

## Modelos con customerId? agregado en Fase 1

| Modelo | Campo agregado | FK actual (sigue vigente) |
|---|---|---|
| `Order` | `customerId String?` | `customerPhone → Customer.phone` |
| `Sale` | `customerId String?` | `customerPhone → Customer.phone` |
| `SavedCart` | `customerId String?` | `customerPhone → Customer.phone` |
| `SavedLocation` | `customerId String?` | `customerPhone → Customer.phone` |
| `CustomerNotification` | `customerId String?` | `customerPhone → Customer.phone` |

## Modelos con customerId que ya apuntaban a phone (Fase 2 los re-apunta)

| Modelo | Campo existente | Acción Fase 2 |
|---|---|---|
| `LoyaltyTransaction` | `customerId String` → `references: [phone]` | UPDATE + switch relation |
| `Fiado` | `customerId String` → `references: [phone]` | UPDATE + switch relation |
| `Prestamo` | `customerId String?` → `references: [phone]` | UPDATE + switch relation |
| `Cotizacion` | `customerId String?` → `references: [phone]` | UPDATE + switch relation |

---

## Modelos con customerPhone SIN FK a Customer (informativo)

No requieren migración urgente de FK, pero sus datos son inconsistentes si hay
duplicados de phone en multi-tenant. Cubrir en Fase 3 o sprint independiente:

`ReviewVote`, `ShoppingList`, `Return`, `ChatMessage`, `SurveyResponse`,
`ConversationThread`, `DeliveryRouteStop`, `MarketplaceAbandonedCart`, `PaymentApproval`

---

## Checklist de seguridad antes de Fase 2

- [ ] Verificar que `Customer.phone @unique` está en producción (sin duplicados en DB)
- [ ] Medir filas en cada tabla afectada para estimar tiempo de backfill
- [ ] Correr backfill SQL en staging primero
- [ ] Activar dual-write en lib/db/customers.db.ts antes de migrar
- [ ] Window de mantenimiento ≥30 min para Fases con ALTER NOT NULL en tablas grandes

---

*Backup pre-EXPAND: `/tmp/schema.prisma.before-customer-pk`*
