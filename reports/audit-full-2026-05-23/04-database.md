# Auditoría DB — Buleje | 2026-05-23

**Schema:** 172 modelos · 50 migraciones aplicadas · 13 archivos `proposed/MANUAL` fuera del flujo Prisma.

---

## Resumen ejecutivo — Top 10 acciones

| # | Acción | Prioridad | Impacto |
|---|---|---|---|
| 1 | `WholesaleOrder.tenantId` es nullable — backfill y hacer NOT NULL | P0 | Aislamiento multi-tenant roto |
| 2 | `CommissionRule.rate` y `Store.commission` son Float — migrar a Decimal | P0 | Errores de redondeo en dinero |
| 3 | `DeliverySOSAlert` sin tenantId — cualquier admin puede ver alertas de otro tenant | P0 | Fuga de datos cross-tenant |
| 4 | Aplicar `proposed-db-indexes-wave-1.sql` (12 índices CONCURRENTLY) | P1 | Queries lentas en prod |
| 5 | Aplicar `proposed-db-indexes-wave-2.sql` (índices WhatsApp + OrderItem) | P1 | Bot lento en peak |
| 6 | 8 FKs críticas sin índice (SavedCart, PurchaseItem, SaleItem, StockoutPrediction×2, DocumentShare, StoreProduct×2) | P1 | Seq scan en joins frecuentes |
| 7 | `Customer.phone` aún es `@unique` global — completar TD-040 Phase 3 | P1 | Bloquea clientes con mismo phone en 2 tiendas |
| 8 | 5 migraciones `proposed-*` y 5 `MANUAL-*` fuera del historial Prisma — documentar estado real | P1 | `prisma migrate status` miente |
| 9 | Ley 29733 / RLS ADR-114 aplicado solo en 5 tablas — extender a 15 tablas PII restantes | P2 | Cobertura RLS incompleta |
| 10 | `SavedFilter.tenantId` sin índice · `LoyaltyTransaction` cubre con `@@index([tenantId, reason])` pero falta bare | P2 | Perf menor |

---

## 1. Modelos sin tenantId (multi-tenant guard)

**Total modelos: 172 · Con tenantId: 130 · Sin tenantId: 42**

Los sin tenantId se dividen en 3 grupos:

### Grupo A — Global de plataforma (correcto, by design)
| Modelo | Razón |
|---|---|
| `Tenant`, `SuperadminUser`, `PlatformSetting` | Son del SaaS, no de un tenant |
| `VariantCatalogTemplate`, `VariantCatalogOption` | Catálogo global superadmin |
| `ABTest`, `ABTestEvent` | Tienen tenantId — falso positivo del parser |
| `RoadmapItemStatus` | Platform-level explicito en comentario |
| `StripeWebhookQueue`, `MpPendingPlan` | Webhooks globales |

### Grupo B — Hijos de entidades con tenantId (correcto por herencia)
| Modelo | Padre con tenantId |
|---|---|
| `OrderItem` | `Order` |
| `SaleItem`, `PurchaseItem` | `Sale`, `PurchaseOrder` |
| `FiadoCuota`, `PrestamoCuota`, `PrestamoDocumento` | `Fiado`, `Prestamo` |
| `CotizacionItem`, `GuiaRemisionItem` | `Cotizacion`, `GuiaRemision` |
| `ReturnItem`, `SupplierReturnItem` | `Return`, `SupplierReturn` |
| `RecetaIngrediente` | `Receta` |
| `ConteoFisicoItem` | `ConteoFisico` |
| `BundleItem`, `ShoppingListItem` | `Bundle`, `ShoppingList` |
| `Payment` | `Payable` |
| `SavedLocation`, `SavedCart` | `Customer` |
| `PageBlock`, `PageVersion` | `Page` |
| `DocumentVersion` | `Document` |
| `WholesaleOrderItem` | `WholesaleOrder` |
| `StorePermission`, `StoreProduct` | `Store` |
| `VendorApplicationReview` | (plataforma) |

### Grupo C — PROBLEMAS REALES
| Modelo | Problema | Severidad |
|---|---|---|
| `DeliverySOSAlert` | Sin tenantId, sin relacion a tenant. Alertas SOS de repartidores visibles cross-tenant | **P0** |
| `WholesaleOrder.tenantId` | Es `String?` (nullable) — existe campo pero sin constraint NOT NULL | **P0** |
| `CronHealthLog` | Logs de cron sin tenant — OK si es plataforma, pero sin documentacion | P2 |
| `CronDeadLetter` | Idem | P2 |

---

## 2. Float en campos monetarios

**Regla: todo dinero debe ser `Decimal @db.Decimal(12,2)`.**

| Modelo | Campo | Tipo actual | Impacto |
|---|---|---|---|
| `CommissionRule` | `rate` | `Float` | % de comision — redondeo acumulado en settlement | P0 |
| `Store` | `commission` | `Float @default(5.0)` | % comision marketplace — mismo riesgo | P0 |
| `CreditInstallment` | `interestRate` | `Float` | Tasa interes prestamos — diferencias de centimos | P1 |
| `SupplierOffer` | `discountPercent` | `Float?` | Descuento proveedor — impacto en Payable | P1 |
| `SupplierRating` | `fillRate` | `Float?` | KPI, no monetario — bajo impacto | P2 |
| `CustomKpi` | `currentValue`, `target`, `changePercent` | `Float?` | Display-only — aceptable | P2 |
| `Settings` | `taxRate`, `maxDiscountPercent`, `deliveryMaxRadius` | `Float?` | `taxRate` critico (IGV) — resto OK | P1 |

**SQL migration necesaria para P0:**
```sql
ALTER TABLE "CommissionRule"
  ALTER COLUMN "rate" TYPE DECIMAL(5,4) USING rate::DECIMAL(5,4);

ALTER TABLE "Store"
  ALTER COLUMN "commission" TYPE DECIMAL(5,4) USING commission::DECIMAL(5,4);
```

---

## 3. Cascadas peligrosas

**Contexto:** `onDelete: Cascade` en datos financieros/auditoria puede destruir evidencia.

| Relacion | Cascade | Riesgo |
|---|---|---|
| `SaleItem → Sale` | Cascade | Si se borra una venta, se pierden items — OK para soft-delete pero peligroso si no hay guard | P1 |
| `PurchaseItem → PurchaseOrder` | Cascade | Idem | P1 |
| `Payment → Payable` | Cascade | Pagos borrados al borrar deuda — perder evidencia contable | P1 |
| `CashMovement → CashRegister` | Cascade | Movimientos de caja se borran con la caja | P1 |
| `GuiaRemision → Order` | Cascade | Documento tributario borrado con pedido | P1 |
| `NotaCredito → Order` | Cascade | NC SUNAT borrada con pedido — riesgo legal | P0 |
| `DailySummary → Tenant` | Cascade | Historico diario destruido si se elimina tenant | P1 |
| `InventoryMovement → Product` | Cascade | Historial de stock borrado al borrar producto | P1 |
| `LoyaltyTransaction → Customer` | Cascade | Ledger de puntos borrado — frena auditorias | P1 |

**Recomendacion:** `NotaCredito`, `Payment`, `LoyaltyTransaction` deberian ser `Restrict` o `SetNull`, nunca `Cascade`. Los documentos SUNAT tienen obligacion de conservacion 5 anos.

---

## 4. Schema drift vs DB real

`npm run db:sanity` devolvio: **`DIRECT_URL o DATABASE_URL requerido. Abort.`** — no se pudo conectar a Supabase desde este entorno.

Estado inferido del historial de migraciones:

| Migracion | Estado | Notas |
|---|---|---|
| 50 migraciones `20260307…` a `20260520…` | Aplicadas (en directorio numerado) | Incluye ADR-114 RLS |
| `proposed-db-indexes-wave-1.sql` | **NO aplicada** | 12 indices en schema.prisma pero el archivo aun existe como "proposed" |
| `proposed-db-indexes-wave-2.sql` | **NO aplicada** | 15 indices WhatsApp + OrderItem |
| `proposed-pgvector.sql` | **NO aplicada** | Embeddings aun no activos |
| `proposed-referrals.sql` | **NO aplicada** | Programa referidos en schema, migration pending |
| `proposed-cron-health-log.sql` | **NO aplicada** | `CronHealthLog` en schema pero sin migration formal |
| `proposed-admin-totp.sql` | **NO aplicada** | TOTP en schema, sin migration |
| `proposed-superadmin-totp.sql` | **NO aplicada** | Idem superadmin |
| `MANUAL-marketplace-bloque-a/b/c/d2/d3.sql` | Aplicadas manualmente en Supabase | Fuera del historial Prisma — `migrate status` las marca como drift |
| `ProductAnalytics` | En schema, migration en directorio | Creada en `20260502000000_add_variant_catalog` — drift previo resuelto |

**Alerta:** `prisma migrate status` marcara las 5 tablas MANUAL como "drift" — requiere baseline o `--create-only`.

---

## 5. N+1 detectados

| Archivo | Patron | Riesgo | Estado |
|---|---|---|---|
| `lib/db/reviews.db.ts:391` | `for (const r of rows)` — loop sobre raw SQL rows, no N+1 ORM real | Bajo — es iteracion sobre resultado ya cargado | OK |
| `lib/db/products.db.ts:155` | `prisma.product.findFirst` en funcion getById — 1 query por call | OK — no en loop | OK |
| Routes marketplace (`app/api/marketplace/*`) | Usan `prisma.*` directo (viola Regla 1) — sin batch/include | Medio — potencial N+1 si iteran stores | P1 |
| `tenant.findFirst` multiples veces por request | Memory menciona patron 3× — no encontrado en DB classes, probable en API routes | Sin confirmar — requiere tracing prod | P2 |

**N+1 real confirmado (memory):** `review.findMany` llamado 3 veces seguidas en alguna ruta — no localizado en esta auditoria de solo lectura. Investigar con `lib/query-monitor.ts` en prod.

---

## 6. Indices faltantes — FKs sin cobertura

### FKs sin indice (detectadas via analisis de schema)

| Modelo | Campo FK | Tabla referenciada | Impacto query |
|---|---|---|---|
| `SavedCart` | `customerPhone` | `Customer.phone` | Lookup de carrito en checkout — alta frecuencia |
| `PurchaseItem` | `productId` | `Product.id` | Reportes de compras por producto |
| `SaleItem` | `productId` | `Product.id` | Top productos POS — alta frecuencia |
| `StockoutPrediction` | `productId` | `Product.id` | Prediccion de quiebre — cron nocturno |
| `StockoutPrediction` | `storeProductId` | `StoreProduct.id` | Idem |
| `DocumentShare` | `documentId` | `Document.id` | Shares de docs — medio |
| `StoreProduct` | `storeId` | `Store.id` | TIENE `@@index([storeId])` — falso positivo |
| `StoreProduct` | `productId` | `Product.id` | TIENE `@@index([productId])` — falso positivo |

### Top 10 indices candidatos adicionales

| # | SQL | Tabla | Query que cubre |
|---|---|---|---|
| 1 | `@@index([tenantId, date])` | `DailySummary` | Dashboard historico diario |
| 2 | `@@index([tenantId, productId])` | `SaleItem` via `Sale.tenantId` | Top productos por tenant |
| 3 | `@@index([tenantId, status])` | `DeliveryAssignment` | Tracking activo |
| 4 | `@@index([tenantId, expiresAt])` | `WhatsAppConversation` | Limpieza de sesiones (cron) |
| 5 | `@@index([tenantId, normalizedQuery])` | `SearchSuggestion` | Ya existe — OK |
| 6 | `@@index([productId, date])` | `ProductAnalytics` | Trends por producto |
| 7 | `@@index([tenantId, status, endDate])` | `SponsoredBoost` | Ads activos del dia |
| 8 | `@@index([tenantId, cashierId])` | `CommissionRule` | Liquidacion comisiones |
| 9 | `@@index([tenantId, resolvedAt])` | `EventDeadLetter` | Ya existe — OK |
| 10 | `@@index([routeId, sequence])` | `DeliveryRouteStop` | Ya existe como `@@unique` — OK |

---

## 7. Connection Pool — pgBouncer

**Estado: correcto.**

`lib/prisma.ts` aplica automaticamente `?pgbouncer=true` al `DATABASE_URL` en entornos no-localhost. Configuracion:

| Parametro | Valor | Estado |
|---|---|---|
| `DATABASE_URL` | Con pgBouncer — Supabase pooler `:6543` | Queries runtime — correcto |
| `DIRECT_URL` | Sin pgBouncer — Supabase directo `:5432` | Migrations — correcto |
| `max: 5` | 5 conexiones por instancia Vercel | Estimado: 10 warm × 5 = 50 / 60 cap Supabase Hobby |
| `idleTimeoutMillis: 30_000` | 30s idle timeout | Correcto |
| `pgbouncer=true` | Auto-inject en resolvedUrl | Correcto — evita prepared statements incompatibles |

**Riesgo latente:** Si Vercel escala a >12 instancias warm simultaneas, 12 × 5 = 60 conns agota el cap de Supabase Hobby. No hay circuit breaker implementado. Monitorear en dashboard Supabase.

**Regla DIRECT_URL:** El comando `npm run db:migrate` esta configurado correctamente para usar DIRECT_URL. El problema es que `db:sanity` requiere DIRECT_URL en el entorno local de WSL y no esta disponible en esta sesion.

---

## 8. RLS ADR-114

**Archivo:** `prisma/migrations/20260520055233_add_rls_policies_adr_114/migration.sql`

| Estado | Detalle |
|---|---|
| Aplicado en Supabase | SI — la migration esta en el historial numerado |
| Tablas cubiertas | `Order`, `Customer`, `Sale`, `Payment`, `AuditLog` (5 tablas) |
| Rollback disponible | SI — `rollback.sql` en el mismo directorio |
| `BYPASSRLS` para migrator | Documentado en comentario del SQL — `prisma_migrator` role |
| Tablas fuera de alcance | `Product`, `Category`, `Settings`, `Notification`, etc. — "Sprint 4+" segun comentario |
| Tablas criticas sin RLS | `Fiado`, `Prestamo`, `TreasuryCuenta`, `CommissionLedger`, `LoyaltyTransaction` |

**Brecha:** `LoyaltyTransaction` (puntos/creditos) y `CommissionLedger` (dinero) son tablas financieras sin RLS — riesgo si se expone acceso directo a Supabase.

---

## 9. Timestamps faltantes (createdAt/updatedAt)

| Metrica | Valor |
|---|---|
| Modelos sin `createdAt` | 45 (mayoría son hijos o tablas de log) |
| Modelos sin `updatedAt` | 106 (mayoría son append-only o inmutables) |

**Casos criticos (auditoria y compliance):**

| Modelo | Falta | Impacto |
|---|---|---|
| `Payment` | `createdAt`, `updatedAt` | Pagos sin timestamp — Ley 29733 |
| `PurchaseItem` | `createdAt` | Items de compra sin fecha |
| `SaleItem` | `createdAt` | Items de venta sin fecha — reconciliacion contable |
| `CashRegister` | `createdAt` | Caja sin timestamp de creacion |
| `DeliveryPartner` | `updatedAt` | Rating y estado sin audit trail |
| `Review` | `updatedAt` | Respuesta admin sin marca temporal |

---

## 10. Estado de migraciones — resumen

| Categoria | Cantidad | Estado |
|---|---|---|
| Migraciones aplicadas (numeradas Prisma) | 50 | En prod |
| Migraciones MANUAL (aplicadas fuera de Prisma) | 5 | Drift — `migrate status` las desconoce |
| Migraciones `proposed-*` (pendientes) | 8 | NO aplicadas |
| `PENDING_AI_MODELS_MIGRATION.md` | 1 | Documento, no SQL — estado desconocido |

**Riesgo operativo:** Las 5 migraciones MANUAL crean las tablas del marketplace (Bloque A/B/C/D2/D3). Si alguien corre `prisma migrate dev` en un entorno nuevo, estas tablas no existiran y el marketplace fallara.

**Accion recomendada:** Crear una migration baseline que marque estos archivos como aplicados:
```bash
DATABASE_URL=$DIRECT_URL npx prisma migrate resolve --applied "MANUAL-marketplace-bloque-a"
```

---

## Tabla de severidad consolidada

| Severidad | Cantidad | Ejemplos |
|---|---|---|
| P0 | 5 | WholesaleOrder.tenantId nullable · DeliverySOSAlert sin tenant · CommissionRule.rate Float · NotaCredito Cascade · Store.commission Float |
| P1 | 12 | 8 FKs sin indice · Customer.phone global unique · Wave-1/2 indices pendientes · Payment/SaleItem Cascade · MANUAL migrations fuera de historial |
| P2 | 8 | RLS parcial (10 tablas sin cubrir) · CronHealthLog sin tenant · 45 modelos sin createdAt · Float en KPIs display · WhatsAppConversation sin bare tenantId index |

---

*Auditoria de solo lectura. No se modifico ningun archivo. DIRECT_URL no disponible en WSL — `db:sanity` no pudo ejecutarse contra Supabase.*
