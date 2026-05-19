# Audit DB + Prisma Schema — Buleje
**Fecha:** 2026-05-17 | **Schema:** 173 modelos | **DB classes:** ~100 | **Migrations:** 48 numeradas + 8 propuestas/manuales

---

## P0 — Crítico (riesgo de datos o seguridad activo)

| # | Hallazgo | Modelo / Archivo | Evidencia |
|---|---|---|---|
| P0-1 | **431 archivos API con `prisma.*` directo** — 1,106 llamadas `await prisma.*` sin pasar por DB classes. Violation masiva regla #1. Multi-tenant leak latente: si falta `where: { tenantId }` manual, un tenant ve datos de otro | `app/api/**` (431 archivos) | `grep -rn "await prisma\."` = 1,106 hits |
| P0-2 | **`proposed-db-indexes-wave-1.sql` no aplicado** — 12 índices críticos (Order, Product, Customer, Sale, Review, ActivityLog) declarados en SQL, pero NO en `schema.prisma`. Seq scans en tablas de producción | `prisma/migrations/proposed-db-indexes-wave-1.sql` | Los índices no tienen correspondiente `@@index` en schema |
| P0-3 | **`WholesaleOrder.tenantId` nullable** — campo marcado `String?` con comentario "EXPAND-PATTERN". Mientras no se backfille y haga NOT NULL, el filtro de tenant puede fallar silenciosamente | `schema.prisma:2929` | `tenantId String?` |
| P0-4 | **`Customer.phone` con `@unique` global** — TD-040 Phase 1 scaffold. Un mismo número de teléfono no puede existir en dos tenants. Bloquea onboarding de clientes compartidos entre bodegas | `schema.prisma:272` | `phone String @unique // temporary global unique; see TD-040 Phase 3` |

---

## P1 — Alto (degradación de performance o inconsistencia estructural)

| # | Hallazgo | Modelo / Archivo | Evidencia |
|---|---|---|---|
| P1-1 | **`Decimal(10,2)` vs `Decimal(12,2)` mezclados** — Modelos financieros usan ambas precisiones. `DailySummary`, `Fiado`, `Turno`, `ProduccionLote`, `Cotizacion` usan `Decimal(10,2)`; el estándar es `Decimal(12,2)`. Overflow en ventas >99,999,999.99 (poco probable hoy, problema en escala) | `schema.prisma:824,1946-1953,1982-2000,2025-2027` | `@db.Decimal(10, 2)` en 21 columnas |
| P1-2 | **`Float` en campos monetarios/cuantitativos** — `CommissionRule.rate`, `SupplierReturnItem.cantidad`, `CustomKpi.currentValue/target/changePercent`, `Store.commission`, `ForecastLog.predictedQty` usan `Float`. Float IEEE-754 causa errores de redondeo en cálculos de comisiones y forecasting | `schema.prisma:1929,2536,2571-2575,2610,3254` | 8 columnas Float no-geoespaciales |
| P1-3 | **8 migrations manuales/propuestas fuera del sistema Prisma** — `MANUAL-marketplace-bloque-*.sql` (5) + `proposed-*.sql` (8) viven en `/prisma/migrations/` pero no tienen prefijo numérico Prisma ni entrada en `migration_lock.toml`. Prisma migrate no las conoce: si alguien corre `migrate reset`, se pierden | `prisma/migrations/MANUAL-*`, `proposed-*` | `migration_lock.toml` no las referencia |
| P1-4 | **Soft-delete sin filtro consistente** — `Order.deletedAt` y `Review.deletedAt` existen, pero los índices compuestos `@@index([tenantId, status, createdAt])` y `@@index([tenantId, productId, status, deletedAt])` en Review sí filtran, pero en Order ninguno incluye `deletedAt`. Queries sin `where: { deletedAt: null }` retornan órdenes eliminadas | `schema.prisma:461-468`, `orders.db.ts` | `@@index([tenantId, status, createdAt])` no cubre deletedAt |
| P1-5 | **`TENANT_MODELS` desincronizado con schema real** — La extensión `prismaForTenant` tiene ~60 modelos registrados. El schema tiene 173. Modelos como `deliverySOSAlert`, `wholesaleOrderItem`, `storeProduct`, `blockTemplate`, `pageVersion`, `roadmapItemStatus`, `deliveryRouteStop` no están en TENANT_MODELS. Si se acceden sin `where: { tenantId }` manual, habrá cross-tenant leak | `lib/tenant.ts:74-260` | 173 modelos en schema vs ~60 en TENANT_MODELS |

---

## P2 — Medio (deuda técnica controlada)

| # | Hallazgo | Modelo / Archivo | Detalle |
|---|---|---|---|
| P2-1 | **`CronHealthLog` usa `@db.Uuid`** — PK con `@default(dbgenerated("gen_random_uuid()"))` y tipo `@db.Uuid`. El resto del schema usa `cuid()` como String. Inconsistencia que puede causar incompatibilidad en joins futuros | `schema.prisma:1778` | Único modelo con UUID nativo |
| P2-2 | **`SupplierReturnItem.cantidad` es Float** — Una cantidad de producto debería ser `Decimal(10,3)` o `Int`. Float puede generar valores tipo `2.9999999997` | `schema.prisma:2536` | `cantidad Float` |
| P2-3 | **`proposed-db-indexes-wave-2.sql` no revisado** — Existe un segundo archivo de índices propuestos sin aplicar ni documentar su estado | `prisma/migrations/proposed-db-indexes-wave-2.sql` | No revisado en este audit |
| P2-4 | **`prisma.ts` pool fijo en 5** — Vercel Fluid Compute puede tener >10 instancias warm × 5 conns = 50 conns. Supabase Hobby cap es 60. Sin circuit breaker en `createPrismaClient`, un spike puede agotar el pool | `lib/prisma.ts:26-35` | `max: 5` hardcodeado |
| P2-5 | **`lib/tenant.ts` usa `prisma.tenant.findFirst` sin `React.cache` en todos los paths** — `findTenantByIdOrSlug` está memoizado, pero varios helpers downstream re-ejecutan el query directamente | `lib/tenant.ts:18-23` | N+1 detectado en audit anterior |

---

## Estado de índices wave-1 (los 12 críticos)

| Índice | En `schema.prisma` | En DB (SQL propuesto) | Estado |
|---|---|---|---|
| `idx_order_tenant_created` | `@@index([tenantId, createdAt])` | SI | Parcial — schema si, CONCURRENTLY no |
| `idx_order_tenant_status` | `@@index([tenantId, status, createdAt])` | SI | Cubierto por compuesto |
| `idx_orderitem_product` | `@@index([orderId])` solo | NO productId | Faltante |
| `idx_product_tenant_active` | `@@index([tenantId, active])` | SI | OK en schema |
| `idx_product_tenant_category` | `@@index([tenantId, category, active])` | Parcial | Schema tiene 3-col, propuesto tiene 2-col |
| `idx_activitylog_tenant_entity_created` | `@@index([tenantId, createdAt])` solo | NO entity | Faltante compuesto |
| `idx_customer_tenant_phone` | `@@index([phone])` solo, global | NO tenantId | Bloqueado por P0-4 |
| `idx_loyaltytxn_tenant_customer_created` | `@@index([tenantId, createdAt])` | NO customerId | Faltante |
| `idx_sale_tenant_created` | `@@index([tenantId, createdAt])` | SI | OK en schema |
| `idx_review_tenant_product_date` | `@@index([tenantId, productId, status, deletedAt])` | SI | Cubierto |
| `idx_settings_tenant` | `@@index([tenantId])` via `@unique` | SI | OK |
| `idx_roadmapstatus_item` | No verificado | Propuesto | Pendiente |

**Resultado:** 4 de 12 índices wave-1 realmente faltantes en schema.

---

## Migration plan — P0 primero

```bash
# P0-2: Agregar índices faltantes al schema y migrar
# 1. Agregar a schema.prisma en OrderItem:
#    @@index([productId])   <- ya existe
# 2. Agregar a ActivityLog:
#    @@index([tenantId, entity, createdAt])
# 3. Agregar a LoyaltyTransaction:
#    @@index([tenantId, customerId, createdAt])
# Luego:
DATABASE_URL=$DIRECT_URL npx prisma migrate dev --name "add_missing_composite_indexes"

# P0-3: WholesaleOrder.tenantId NOT NULL
# Script de backfill: UPDATE "WholesaleOrder" SET "tenantId" = "buyerTenantId" WHERE "tenantId" IS NULL;
# Luego cambiar schema a tenantId String (no nullable)
DATABASE_URL=$DIRECT_URL npx prisma migrate dev --name "wholesaleorder_tenantid_notnull"

# P0-4: TD-040 Phase 3 — requiere backfill completo primero
# No ejecutar sin completar Phase 2 (backfill customerId en Order/Sale/etc.)
```

---

## Resumen ejecutivo

| Prioridad | Cantidad | Impacto principal |
|---|---|---|
| P0 | 4 | Multi-tenant leak, seq scans en prod, bloqueo de clientes multi-bodega |
| P1 | 5 | Pérdida de precisión financiera, migrations fantasma, soft-delete roto |
| P2 | 5 | Pool exhaustion, deuda estructural controlada |

**Lo más urgente:** resolver P0-1 (431 archivos con prisma directo) no es una sola tarea — es un programa. El riesgo real es P0-1 combinado con P0-3 y P1-5: rutas marketplace que usan `prisma.order.findMany` sin `tenantId` en un modelo cuyo `tenantId` es nullable.

**La deuda que más sorprende:** `proposed-db-indexes-wave-1.sql` lleva en el repo desde 2026-05-07 sin aplicarse. Son 12 índices `CONCURRENTLY` — zero-downtime. El costo de no aplicarlos es seq scan en `Order`, `Product`, `Customer` en cada dashboard load.
