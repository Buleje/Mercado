# DB Hardening Plan — Buleje (DB 14 → 18)

> Generado: 2026-05-09 · Auditor: DB engineer agent · Branch: prod
> **REGLA**: no modificar schema.prisma, no ejecutar migrations. Solo plan + SQL copy-paste para Brandon.

---

## Secuencia recomendada (P0 primero, expand→contract)

| Orden | Item | Severidad | Tiempo |
|---|---|---|---|
| 1 | Waves 1+2 (24 índices CONCURRENTLY) | P0 performance | 5 min |
| 2 | May-2 migrations pendientes | P0 schema drift | 5 min |
| 3 | WholesaleOrder tenantId | P0 multi-tenant leak | 30 min |
| 4 | NewsletterSubscriber composite unique | P0 cross-tenant dup | 15 min |
| 5 | Float → Decimal financieros | P1 precision | 30 min |
| 6 | SavedCart composite unique | P1 data integrity | 15 min |
| 7 | Índices bare redundantes (23 modelos) | P2 write overhead | 20 min |
| 8 | Customer.phone PK expand→contract | TD-040 largo plazo | 4-6h sprint |

---

## 1. FK onDelete — Auditoría completa

**Totales reales (grep en schema.prisma):**
- Total relaciones `@relation`: **125**
- Con `onDelete` explícito: **77** (incluye back-references sin `fields:`)
- Relaciones con `fields:` (FK reales) SIN `onDelete`: **42** — estas son el riesgo real

### 42 relaciones FK sin onDelete explícito

> Regla de decisión: si el hijo no tiene sentido sin el padre → `Cascade`. Si el hijo puede sobrevivir sin el padre → `SetNull`. Si el padre nunca debe borrarse mientras haya hijos → `Restrict`.

| Linea | Modelo | Campo | Target | Recomendación | Justificación |
|---|---|---|---|---|---|
| 1277 | PageHero | tenant | Tenant | Restrict | Config de página depende de tenant activo |
| 1930 | DailySummary | tenant | Tenant | Restrict | Dato histórico, no borrar en cascada |
| 1958 | Fiado | tenant | Tenant | Restrict | Registro financiero |
| 1959 | Fiado | customer | Customer | SetNull | Fiado puede quedar huérfano (cliente bloqueado) |
| 2002 | Turno | tenant | Tenant | Restrict | Registro de caja |
| 2003 | Turno | adminUser | AdminUser | SetNull | Turno puede quedar sin admin asignado |
| 2031 | Receta | tenant | Tenant | Restrict | Config operativa |
| 2032 | Receta | producto | Product | SetNull | Receta puede existir sin producto en catálogo |
| 2046 | RecetaIngrediente | producto | Product | Restrict | Ingrediente sin producto = receta corrupta |
| 2059 | ProduccionLote | tenant | Tenant | Restrict | Registro productivo |
| 2060 | ProduccionLote | receta | Receta | Restrict | Lote sin receta = imposible trazabilidad |
| 2135 | Prestamo | tenant | Tenant | Restrict | Registro financiero |
| 2136 | Prestamo | customer | Customer | SetNull | Prestamo puede quedar sin cliente (cuenta cerrada) |
| 2222 | TreasuryCuenta | tenant | Tenant | Restrict | Cuenta contable |
| 2245 | TreasuryMovimiento | tenant | Tenant | Restrict | Movimiento contable |
| 2262 | TreasuryTransferencia | tenant | Tenant | Restrict | Movimiento contable |
| 2263 | TreasuryTransferencia | origen | TreasuryCuenta | Restrict | Transferencia sin cuenta origen = inconsistencia |
| 2264 | TreasuryTransferencia | destino | TreasuryCuenta | Restrict | Idem destino |
| 2298 | Cotizacion | tenant | Tenant | Restrict | Documento comercial |
| 2299 | Cotizacion | customer | Customer | SetNull | Cotización puede quedar sin cliente |
| 2358 | GuiaRemision | tenant | Tenant | Restrict | Documento tributario SUNAT |
| 2359 | GuiaRemision | order | Order | SetNull | Guía puede desvincularse del pedido |
| 2405 | NotaCredito | tenant | Tenant | Restrict | Documento tributario SUNAT |
| 2406 | NotaCredito | order | Order | SetNull | Nota de crédito puede existir post-anulación |
| 2428 | Notification | tenant | Tenant | Restrict | Notificación de admin |
| 2447 | ConteoFisico | tenant | Tenant | Restrict | Inventario físico |
| 2564 | Store | tenant | Tenant | Restrict | Tienda marketplace depende de tenant |
| 2620 | StoreProduct | store | Store | Cascade | Producto en tienda desaparece si tienda se elimina |
| 2622 | StoreProduct | product | Product | Cascade | Producto en tienda sin catálogo = huérfano |
| 2703 | DeliveryAssignment | order | Order | Restrict | No borrar pedido con asignación activa |
| 2705 | DeliveryAssignment | partner | DeliveryPartner | Restrict | No borrar partner con asignación activa |
| 2823 | DeliveryRouteStop | order | Order | SetNull | Parada puede quedar sin pedido (cancelado) |
| 2912 | WholesaleOrderItem | order | WholesaleOrder | Cascade | Item sin cabecera = huérfano |
| 2927 | StorePermission | store | Store | Cascade | Permisos de tienda eliminados con la tienda |
| 2962 | SupplierPortal | supplier | Supplier | Cascade | Portal sin proveedor = sin uso |
| 3043 | SunatInvoice | config | TenantSunatConfig | SetNull | Factura puede existir post-desvincular config |
| 3154 | CreditInstallment | creditProfile | CreditProfile | Cascade | Cuota sin perfil = huérfano |
| 3183 | CreditScoreHistory | creditProfile | CreditProfile | Cascade | Historial sin perfil = huérfano |
| 3370 | StockoutPrediction | product | Product | Cascade | Prediccion sin producto = sin valor |
| 3371 | StockoutPrediction | storeProduct | StoreProduct | Cascade | Idem |
| 3426 | SponsoredBoost | product | Product | Cascade | Boost sin producto = sin valor |
| 3500 | TenantFeatureFlag | tenant | Tenant | Cascade | Flag sin tenant = sin valor |

### Schema diff para aplicar (fragmento tipo — aplicar modelo por modelo)

```prisma
// Ejemplo: TreasuryCuenta
tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Restrict)

// Ejemplo: StoreProduct
store   Store   @relation(fields: [storeId], references: [id], onDelete: Cascade)
product Product @relation(fields: [productId], references: [id], onDelete: Cascade)

// Ejemplo: CreditInstallment
creditProfile CreditProfile @relation(fields: [creditProfileId], references: [id], onDelete: Cascade)
```

### Migration command

```bash
# Después de editar schema.prisma con los onDelete:
DATABASE_URL=$DIRECT_URL npx prisma migrate dev --name add_fk_on_delete_policies
```

### Rollback

```sql
-- Prisma genera el DDL de la migration — rollback = revertir la migration:
DATABASE_URL=$DIRECT_URL npx prisma migrate resolve --rolled-back <migration_name>
```

---

## 2. Índices bare redundantes

**Datos reales del audit:**
- Total `@@index([tenantId])` bare: **94** (no 22 como estimado en round 28)
- Con composite duplicado (REDUNDANTES): **23**
- Sin composite (NECESARIOS — no tocar): **71**

### Los 23 redundantes (eliminar bare, composite los cubre)

| Linea | Modelo | Composite existente que cubre |
|---|---|---|
| 126 | Product | `[tenantId, active]` + `[tenantId, category, active]` |
| 324 | Customer | `[tenantId, createdAt]` + `[tenantId, phone]` |
| 438 | Order | `[tenantId, status, createdAt]` + `[tenantId, createdAt]` |
| 497 | Review | `[tenantId, verified]` |
| 756 | PurchaseOrder | `[tenantId, status]` |
| 811 | Sale | `[tenantId, createdAt]` + `[tenantId, customerPhone]` |
| 869 | Payable | `[tenantId, status]` |
| 951 | InventoryMovement | `[tenantId, createdAt]` |
| 993 | Return | `[tenantId, createdAt]` |
| 1156 | ActivityLog | `[tenantId, createdAt]` |
| 1232 | NotificationLog | `[tenantId, createdAt DESC]` |
| 1933 | DailySummary | `[tenantId, fecha]` |
| 2671 | DeliveryPartner | `[tenantId, isOnline, currentOrderId]` |
| 2763 | DeliveryTracking | `[tenantId, status]` |
| 2792 | DeliveryRoute | `[tenantId, plannedStartAt DESC]` |
| 2861 | ConversationThread | `[tenantId, status]` + `[tenantId, lastMessageAt DESC]` |
| 2955 | CommissionLedger | `[tenantId, status]` |
| 2985 | SupportTicket | `[tenantId, createdAt]` + `[tenantId, status]` |
| 3046 | SunatInvoice | `[tenantId, type, series, number]` |
| 3343 | ProductAnalytics | `[tenantId, date]` |
| 3449 | SearchSuggestion | `[tenantId, normalizedQuery]` |
| 3582 | TenantPageProductOverride | `[tenantId, visible, featured]` |
| 3610 | TenantPagePromotion | `[tenantId, active, startAt, endAt]` |

> Nota: en PostgreSQL, un index sobre `(tenantId, status)` ya cubre queries `WHERE tenantId = ?` (prefix scan). El bare `(tenantId)` solo es necesario si no existe ningún composite.

### Schema diff

```prisma
// Eliminar en cada modelo — ejemplo para Order:
// BEFORE:
@@index([tenantId])                          // <-- eliminar esta línea
@@index([tenantId, status, createdAt])
@@index([tenantId, createdAt])

// AFTER (mantener solo los composite):
@@index([tenantId, status, createdAt])
@@index([tenantId, createdAt])
```

### Migration command

```bash
DATABASE_URL=$DIRECT_URL npx prisma migrate dev --name remove_redundant_bare_tenant_indexes
```

### Rollback SQL (si hay regresión de performance)

```sql
-- Recrear los 23 bare en producción con CONCURRENTLY:
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Product_tenantId_idx" ON "Product"("tenantId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Customer_tenantId_idx" ON "Customer"("tenantId");
-- ... (repetir para los 23 modelos)
```

---

## 3. Float → Decimal (financieros)

**5 campos identificados con precisión flotante en contextos monetarios o de volumen crítico:**

| Linea | Modelo | Campo | Tipo actual | Tipo correcto | Riesgo |
|---|---|---|---|---|---|
| 837 | Promotion | discountPercent | Float | Decimal(5,2) | Redondeo en descuentos |
| 1589 | Batch | quantity | Float | Decimal(10,3) | Medición FEFO |
| 2946 | CommissionLedger | rate | Float | Decimal(7,4) | Comisiones marketplace |
| 2912 area | WholesaleOrderItem | appliedDiscount | Float | Decimal(5,2) | Descuento por volumen |
| 3517 | MarketplaceAbandonedCart | total | Float | Decimal(12,2) | Total carrito |

> Campos Float que NO son financieros (lat/lng, ratings, targets de KPI) — NO migrar.

### Schema diff

```prisma
// Promotion.discountPercent
discountPercent Decimal @default(0) @db.Decimal(5, 2)

// Batch.quantity
quantity Decimal @db.Decimal(10, 3)

// CommissionLedger.rate
rate Decimal @db.Decimal(7, 4)

// WholesaleOrderItem.appliedDiscount
appliedDiscount Decimal @default(0) @db.Decimal(5, 2)

// MarketplaceAbandonedCart.total
total Decimal @db.Decimal(12, 2)
```

### Migration command

```bash
DATABASE_URL=$DIRECT_URL npx prisma migrate dev --name float_to_decimal_financials
```

### Backfill SQL (necesario para Batch.quantity que puede tener datos)

```sql
-- Verificar si hay valores que se truncarían:
SELECT id, quantity FROM "Batch" WHERE quantity != ROUND(quantity::numeric, 3);
-- Si hay 0 filas: migration segura. Si hay filas: revisar manualmente.

-- Prisma genera el ALTER TABLE automáticamente.
-- PostgreSQL convierte Float → Decimal sin pérdida para Decimal(10,3).
```

### Rollback

```sql
ALTER TABLE "Promotion" ALTER COLUMN "discountPercent" TYPE DOUBLE PRECISION;
ALTER TABLE "Batch" ALTER COLUMN "quantity" TYPE DOUBLE PRECISION;
ALTER TABLE "CommissionLedger" ALTER COLUMN "rate" TYPE DOUBLE PRECISION;
ALTER TABLE "WholesaleOrderItem" ALTER COLUMN "appliedDiscount" TYPE DOUBLE PRECISION;
ALTER TABLE "MarketplaceAbandonedCart" ALTER COLUMN "total" TYPE DOUBLE PRECISION;
```

---

## 4. WholesaleOrder — tenantId canónico (P0)

**Hallazgo:** `WholesaleOrder` (L2892) tiene `buyerTenantId` y `sellerTenantId` pero **NO un `tenantId` canónico**. Las DB classes filtran por `tenantId` — sin este campo, las queries de WholesaleOrder no aplican el filtro multi-tenant estándar, causando cross-tenant leak potencial en endpoints que asuman `tenantId`.

**Schema actual (L2892):**

```prisma
model WholesaleOrder {
  id             String @id @default(cuid())
  buyerTenantId  String
  sellerTenantId String
  // ... sin tenantId canónico
  @@index([buyerTenantId])
  @@index([sellerTenantId])
}
```

### Schema diff

```prisma
model WholesaleOrder {
  id             String               @id @default(cuid())
  buyerTenantId  String
  sellerTenantId String
  tenantId       String               // NUEVO — alias de buyerTenantId para compatibilidad con DB classes
  // resto sin cambios...

  @@index([buyerTenantId])
  @@index([sellerTenantId])
  @@index([tenantId])                  // NUEVO
}
```

### Migration command

```bash
DATABASE_URL=$DIRECT_URL npx prisma migrate dev --name add_wholesale_order_tenant_id
```

### Backfill SQL (OBLIGATORIO post-migration)

```sql
-- Rellenar tenantId = buyerTenantId para filas existentes:
UPDATE "WholesaleOrder" SET "tenantId" = "buyerTenantId" WHERE "tenantId" IS NULL;

-- Verificar:
SELECT COUNT(*) FROM "WholesaleOrder" WHERE "tenantId" IS NULL;
-- Debe retornar 0.
```

### Rollback SQL

```sql
ALTER TABLE "WholesaleOrder" DROP COLUMN IF EXISTS "tenantId";
DROP INDEX CONCURRENTLY IF EXISTS "WholesaleOrder_tenantId_idx";
```

---

## 5. NewsletterSubscriber — composite unique (P0)

**Hallazgo (L1725):** `email @unique` es un unique global. En multi-tenant, un mismo email de cliente puede estar suscrito a múltiples tenants. La constraint actual impide esto y causa errores si dos tenants intentan registrar el mismo email.

**Schema actual:**

```prisma
model NewsletterSubscriber {
  id        String   @id @default(cuid())
  email     String   @unique        // <-- global, incorrecto para multi-tenant
  tenantId  String
  // ...
}
```

### Schema diff (expand → contract)

```prisma
model NewsletterSubscriber {
  id        String   @id @default(cuid())
  email     String                        // eliminar @unique global
  tenantId  String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([tenantId, email])             // NUEVO composite
  @@index([tenantId])
}
```

### Migration command

```bash
DATABASE_URL=$DIRECT_URL npx prisma migrate dev --name newsletter_composite_unique
```

### Backfill SQL (detectar duplicados antes de migrar)

```sql
-- Verificar duplicados cross-tenant (debe retornar 0 para migration limpia):
SELECT email, COUNT(DISTINCT "tenantId") as tenants
FROM "NewsletterSubscriber"
GROUP BY email
HAVING COUNT(DISTINCT "tenantId") > 1;

-- Si hay duplicados: ya son válidos (un email en 2 tenants = correcto).
-- La migration puede proceder sin borrar filas.
```

### Rollback SQL

```sql
ALTER TABLE "NewsletterSubscriber" DROP CONSTRAINT IF EXISTS "NewsletterSubscriber_tenantId_email_key";
ALTER TABLE "NewsletterSubscriber" ADD CONSTRAINT "NewsletterSubscriber_email_key" UNIQUE ("email");
```

---

## 6. SavedCart — composite unique (P1)

**Hallazgo (L354):** `customerPhone @unique` es global. En multi-tenant, un customer puede tener un carrito en cada tenant. La constraint actual impide guardar el carrito de un customer en un segundo tenant.

**Schema actual:**

```prisma
model SavedCart {
  customerPhone String   @unique    // <-- global, incorrecto
  tenantId      String
  // ...
}
```

### Schema diff

```prisma
model SavedCart {
  id            String   @id @default(cuid())
  customerPhone String                          // eliminar @unique global
  tenantId      String
  itemsJson     String
  updatedAt     DateTime @updatedAt

  customer Customer @relation(fields: [customerPhone], references: [phone], onDelete: Cascade)

  @@unique([customerPhone, tenantId])          // NUEVO composite
  @@index([tenantId])
}
```

### Migration command

```bash
DATABASE_URL=$DIRECT_URL npx prisma migrate dev --name saved_cart_composite_unique
```

### Backfill SQL

```sql
-- Verificar que no hay duplicados (customerPhone + tenantId):
SELECT "customerPhone", "tenantId", COUNT(*)
FROM "SavedCart"
GROUP BY "customerPhone", "tenantId"
HAVING COUNT(*) > 1;
-- Si retorna filas: eliminar duplicados manualmente antes de la migration.
```

### Rollback SQL

```sql
ALTER TABLE "SavedCart" DROP CONSTRAINT IF EXISTS "SavedCart_customerPhone_tenantId_key";
ALTER TABLE "SavedCart" ADD CONSTRAINT "SavedCart_customerPhone_key" UNIQUE ("customerPhone");
```

---

## 7. Customer.phone — PK composite (TD-040)

**Problema:** `Customer.phone String @id` es un PK global. No hay `tenantId` en el PK, lo que significa que el mismo número de teléfono no puede existir en dos tenants. Viola el modelo multi-tenant fundamental.

**Impacto:** alto — Customer tiene ~15 relaciones FK que apuntan a `phone`. Requiere pattern expand→migrate→contract.

### Plan expand → contract (4-6h sprint dedicado)

**FASE 1 — Expand (sin romper nada):**
```prisma
model Customer {
  phone    String           // quitar @id
  id       String  @id @default(cuid())   // NUEVO PK surrogate
  tenantId String                         // ya existe — agregar a PK lógico
  // ...
  @@unique([tenantId, phone])             // constraint de negocio
}
```

**FASE 2 — Migrate FK dependientes:**
Todos los modelos que usan `customerPhone String` como FK deben migrar a `customerId String` apuntando al nuevo `id`.

Modelos afectados (FK a Customer.phone):
- `SavedCart.customerPhone`
- `SavedLocation.customerPhone`
- `Order.customerPhone`
- `Sale.customerPhone`
- `Fiado.customerPhone`
- `Prestamo.customerId` (ya usa este patrón — revisar)
- `Cotizacion.customerId`
- `LoyaltyTransaction.customerId`
- `CustomerNotification.customerPhone`

**FASE 3 — Contract:**
```sql
-- Una vez migradas todas las FK:
ALTER TABLE "Customer" DROP CONSTRAINT "Customer_pkey";
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_pkey" PRIMARY KEY ("id");
ALTER TABLE "Customer" DROP COLUMN "phone"; -- SOLO si phone ya no es FK en ningún lado
```

**Migration command (fase 1):**

```bash
DATABASE_URL=$DIRECT_URL npx prisma migrate dev --name customer_phone_expand_add_id
```

**Backfill SQL (fase 1):**

```sql
-- Rellenar id para clientes existentes:
UPDATE "Customer" SET id = gen_random_uuid()::text WHERE id IS NULL;
```

> NOTA: este sprint es el mas riesgoso del plan. Hacerlo solo cuando waves 1-2 y los P0 anteriores estén aplicados y verificados.

---

## 8. DB Index Waves 1+2 (TD-042)

**Estado actual:**
- `prisma/migrations/proposed-db-indexes-wave-1.sql` — 12 índices (confirmado)
- `prisma/migrations/proposed-db-indexes-wave-2.sql` — 11 índices (confirmado)
- Script wrapper: `scripts/apply-db-waves.sh`
- **Bloqueados desde round 7 por DNS WSL → Supabase**

### Solapamiento wave-1 vs schema (índices potencialmente ya aplicados en DB)

Los siguientes 2 índices de wave-1 podrían ya estar cubiertos por el schema de Prisma si las migrations se aplicaron correctamente:

| Índice wave-1 | Schema @@index equivalente |
|---|---|
| `idx_order_tenant_created` | `@@index([tenantId, createdAt])` en Order (L443) |
| `idx_order_tenant_status` | `@@index([tenantId, status, createdAt])` en Order (L442) — este cubre status queries |

**Acción:** usar `CREATE INDEX CONCURRENTLY IF NOT EXISTS` — ya lo hace el script, por lo que no hay riesgo de duplicar. Verificar post-aplicación con la query del script.

### Comandos de aplicación

**Opción A — Script bash (recomendada si tienes psql instalado):**

```bash
export DIRECT_URL='postgresql://postgres:PASSWORD@db.<ref>.supabase.co:5432/postgres'
chmod +x scripts/apply-db-waves.sh
./scripts/apply-db-waves.sh
```

**Opción B — Supabase SQL Editor (sin psql local):**

1. Ir a `https://supabase.com/dashboard/project/sofkgguriggocouiuamx/sql/new`
2. Pegar el contenido de `prisma/migrations/proposed-db-indexes-wave-1.sql`
3. Ejecutar. Esperar mensaje `CREATE INDEX`.
4. Repetir con `prisma/migrations/proposed-db-indexes-wave-2.sql`.

**Opción C — Script Node.js (WSL con workaround IPv4):**

```bash
node -r dotenv/config scripts/apply-wave-1-indexes.mjs dotenv_config_path=.env.local
# Si DNS falla, exportar USE_POOLER=1:
USE_POOLER=1 node -r dotenv/config scripts/apply-wave-1-indexes.mjs
```

### Verificación post-aplicación

```sql
-- En Supabase SQL Editor:
SELECT indexname, tablename
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;
-- Debe mostrar 23 filas (12 wave-1 + 11 wave-2).

-- Verificar ninguno quedó INVALID:
SELECT c.relname AS indexname
FROM pg_index i
JOIN pg_class c ON c.oid = i.indexrelid
WHERE i.indisvalid = false AND c.relname LIKE 'idx_%';
-- Debe retornar 0 filas.
```

### Rollback (si se detecta regresión)

```sql
-- Rollback wave-1 (12 índices):
DROP INDEX CONCURRENTLY IF EXISTS idx_order_tenant_created;
DROP INDEX CONCURRENTLY IF EXISTS idx_order_tenant_status;
DROP INDEX CONCURRENTLY IF EXISTS idx_orderitem_product;
DROP INDEX CONCURRENTLY IF EXISTS idx_product_tenant_active;
DROP INDEX CONCURRENTLY IF EXISTS idx_product_tenant_category;
DROP INDEX CONCURRENTLY IF EXISTS idx_activitylog_tenant_entity_created;
DROP INDEX CONCURRENTLY IF EXISTS idx_customer_tenant_phone;
DROP INDEX CONCURRENTLY IF EXISTS idx_loyaltytxn_tenant_customer_created;
DROP INDEX CONCURRENTLY IF EXISTS idx_sale_tenant_created;
DROP INDEX CONCURRENTLY IF EXISTS idx_review_tenant_product_date;
DROP INDEX CONCURRENTLY IF EXISTS idx_settings_tenant;
DROP INDEX CONCURRENTLY IF EXISTS idx_roadmapstatus_item;

-- Rollback wave-2 (11 índices):
DROP INDEX CONCURRENTLY IF EXISTS idx_waconv_tenant_expires_phone;
DROP INDEX CONCURRENTLY IF EXISTS idx_waconv_tenant_state_lastmsg;
DROP INDEX CONCURRENTLY IF EXISTS idx_orderitem_product_order;
DROP INDEX CONCURRENTLY IF EXISTS idx_customernotif_phone_read_created;
DROP INDEX CONCURRENTLY IF EXISTS idx_customernotif_tenant_read_created;
DROP INDEX CONCURRENTLY IF EXISTS idx_notification_tenant_severity_read;
DROP INDEX CONCURRENTLY IF EXISTS idx_stripequeue_pending_retry;
DROP INDEX CONCURRENTLY IF EXISTS idx_promotion_tenant_active_expires;
DROP INDEX CONCURRENTLY IF EXISTS idx_coupon_tenant_active_expires;
DROP INDEX CONCURRENTLY IF EXISTS idx_review_tenant_status_date;
DROP INDEX CONCURRENTLY IF EXISTS idx_saleitem_product;
```

---

## Comandos para Brandon — Copy-paste ready

### Paso 1: Waves de índices (5 min, zero downtime)

```bash
# Opción A — si tienes psql + DIRECT_URL:
export DIRECT_URL='postgresql://postgres:TU_PASSWORD@db.sofkgguriggocouiuamx.supabase.co:5432/postgres'
./scripts/apply-db-waves.sh

# Opción B — Supabase SQL Editor (sin instalar nada):
# Pegar contenido de prisma/migrations/proposed-db-indexes-wave-1.sql → Run
# Luego pegar contenido de prisma/migrations/proposed-db-indexes-wave-2.sql → Run
```

### Paso 2: May-2 migrations pendientes (5 min)

```bash
# Supabase SQL Editor:
# Pegar contenido de scripts/apply-may2-migrations.sql → Run
# Crea: DeliverySOSAlert, DeliveryPartner.score, PaymentApproval, Order.paymentApprovalId
```

### Paso 3: WholesaleOrder tenantId (30 min con DIRECT_URL)

```bash
# 1. Editar prisma/schema.prisma línea ~2892: agregar tenantId String
# 2. Migrar:
DATABASE_URL=$DIRECT_URL npx prisma migrate dev --name add_wholesale_order_tenant_id
# 3. Backfill:
psql "$DIRECT_URL" -c 'UPDATE "WholesaleOrder" SET "tenantId" = "buyerTenantId" WHERE "tenantId" IS NULL;'
# 4. Verificar:
psql "$DIRECT_URL" -c 'SELECT COUNT(*) FROM "WholesaleOrder" WHERE "tenantId" IS NULL;'
```

### Paso 4: NewsletterSubscriber (15 min)

```bash
# 1. Editar schema: quitar @unique de email, agregar @@unique([tenantId, email])
DATABASE_URL=$DIRECT_URL npx prisma migrate dev --name newsletter_composite_unique
# No requiere backfill — los datos existentes son válidos con el nuevo constraint.
```

### Paso 5: Float → Decimal (30 min)

```bash
# 1. Editar schema: 5 campos Float → Decimal (ver sección 3)
DATABASE_URL=$DIRECT_URL npx prisma migrate dev --name float_to_decimal_financials
# Verificar Batch.quantity antes:
psql "$DIRECT_URL" -c 'SELECT COUNT(*) FROM "Batch" WHERE quantity != ROUND(quantity::numeric, 3);'
```

### Paso 6: SavedCart composite unique (15 min)

```bash
# 1. Editar schema: quitar @unique de customerPhone, agregar @@unique([customerPhone, tenantId])
DATABASE_URL=$DIRECT_URL npx prisma migrate dev --name saved_cart_composite_unique
```

### Verificación final DB score

```sql
-- En Supabase SQL Editor — resumen de estado post-hardening:
SELECT
  (SELECT COUNT(*) FROM pg_indexes WHERE indexname LIKE 'idx_%' AND schemaname = 'public') AS wave_indexes,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'WholesaleOrder' AND column_name = 'tenantId') AS wholesale_tenant_id,
  (SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_name = 'NewsletterSubscriber_tenantId_email_key') AS newsletter_composite,
  (SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_name = 'SavedCart_customerPhone_tenantId_key') AS savedcart_composite;
-- Esperado: wave_indexes=23, wholesale_tenant_id=1, newsletter_composite=1, savedcart_composite=1
```

---

## Post-hardening: actualizar MEMORIA-PROYECTO.md

Una vez aplicado cada paso, marcar en MEMORIA-PROYECTO.md:
- TD-042 → "waves 1+2 aplicados YYYY-MM-DD"
- TD-040 → estado de Customer.phone expand
- Agregar nota de FK onDelete policies aplicadas
