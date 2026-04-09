# Plan de Migración Ola 1 — Deudas Técnicas 2026-04-09

**Fecha:** 2026-04-09  
**Orquestador:** migration-planner  
**Estado:** PLAN COMPLETO — Listo para ejecución (sesiones 1-4 por TD)  
**Riesgo Global:** 🔴 CRÍTICO (TD-018) + 🟠 MEDIA (TD-030, TD-031, TD-032)

---

## Resumen ejecutivo para Brandon

Hay 4 cambios de schema que el código intenta usar pero no existen en Prisma:

1. **TD-018: Dinero quebrado** — 87 campos que usan `Float` acumulan errores de centavos. Cambiar a `Decimal(12,2)` para precisión exacta. **Riesgo alto**, **8-14 horas**, **requiere ventana de mantenimiento**.

2. **TD-030: Historial de puntos fidelidad** — La app guarda puntos pero no el historial. Crear tabla `LoyaltyTransaction` + backfill desde balance actual de `Customer.loyaltyPoints`. **Riesgo bajo**, **3-5 horas**.

3. **TD-031: Fotos en reseñas** — El UI acepta fotos pero la DB no tiene donde guardarlas. Agregar `imageUrls String[]` a `Review` (usa arrays nativos Postgres). **Riesgo bajo**, **2-3 horas**.

4. **TD-032: Cupones por tienda** — Cupones del marketplace y POS se mezclan en la misma tabla. Agregar `storeId` opcional para diferenciarlos. **Riesgo bajo**, **2-3 horas**.

**Total: 15-25 horas en 4 sesiones paralelas** (1 por TD). **Recomendación: ejecutar en este orden:**
- **Orden sugerido:** TD-018 primero (más crítica) → TD-030 → TD-031 → TD-032 (en paralelo después de TD-018)

---

## Tabla maestra de migraciones Ola 1

| TD | Descripción | Modelos afectados | Tipo | Reversible | Downtime | Complejidad | Riesgo |
|----|---|---|---|---|---|---|---|
| **TD-018** | Float → Decimal(12,2) en 87 campos | 28 modelos (Product, Order, Invoice, SaleItem, Customer, etc.) | Destructivo + Tipo-cast | Sí (backup Supabase) | 10-60s | 🔴 CRÍTICA | 🔴 CRÍTICA |
| **TD-030** | Crear `LoyaltyTransaction` + backfill | Customer, (nuevo) LoyaltyTransaction | Aditiva + Datos | Sí (delete LoyaltyTransaction) | 0s | 🟠 MEDIA | 🟢 BAJA |
| **TD-031** | Agregar `Review.imageUrls String[]` | Review | Aditiva + Columna | Sí (DROP COLUMN) | 0s | 🟢 SIMPLE | 🟢 BAJA |
| **TD-032** | Agregar `Coupon.storeId` opcional | Coupon | Aditiva + FK | Sí (DROP COLUMN) | 0s | 🟢 SIMPLE | 🟢 BAJA |

---

## Orden recomendado de ejecución

```
SESIÓN 1 (Prep TD-018)  ──→  SESIÓN 2 (Ejecutar TD-018)  ──→  SESIÓN 3 (TS fixes TD-018)
                                                               ↓
                                                   SESIÓN 4 (Validar TD-018)
                                                               
SESIÓN 5 (TD-030 completa)  │  SESIÓN 6 (TD-031 completa)  │  SESIÓN 7 (TD-032 completa)
```

**Lógica:**
- **TD-018 primero** (bloqueante, más crítica, toca 22 DB classes) — requiere 4 sesiones
- **TD-030, TD-031, TD-032 en paralelo** (independientes, bloquean menos) — 1 sesión cada una

**Total: 7 sesiones, 4 paralelas + 3 secuenciales = ~15-25 horas distribuidas**

---

## TD-018: Float → Decimal(12,2) — Plan detallado

### Resumen

Migrar **87 campos monetarios** de `Float` a `Decimal(12,2)` en 28 modelos Prisma. Float IEEE 754 acumula errores (15-17 dígitos de precisión) → discrepancias de centavos en auditorías, chargebacks, pago de impuestos. Primer paso obligatorio en el Plan Supabase Best Practices Audit (TD-019 + TD-020 dependen de completar TD-018).

**Campos críticos (Tier 1):**

| Modelo | Campos | Razón crítica | Líneas |
|--------|--------|-------|--------|
| **Product** | price, costPrice | Base de cálculo todas las órdenes | 79, 80 |
| **Order** | total, discountAmount, totalCogs | Cabecera de orden, facturación | 275, 284, 285 |
| **SaleItem** | price, costPrice | Línea de venta, vuelto de efectivo | 671, 672 |
| **Customer** | totalSpent, creditBalance, creditLimit | Dinero acumulado, auditoría cliente | 173, 180, 181 |
| **Invoice** | subtotal, igv, total | SUNAT: precisión exacta requerida | (ver schema) |
| **CashierSession** | openingAmount, closingAmount, difference | Cuadre de caja crítico | (ver schema) |

**Total campos:** 87 encontrados en 28 modelos  
**Campos legítimos Float:** GPS (lat/lng), distancia (km), ratings (0-5), confidence (0-1), porcentajes técnicos — ~27 campos, NO migran.

### Estrategia (5 fases)

#### Fase 1: Preparación pre-migración (Sesión 1, 2-4 horas)

**Tareas:**

1. **Backup completo Supabase**
   ```bash
   # Vía UI: Settings → Backups → Manual backup
   # Verificar tamaño > 50 MB
   ```

2. **Baseline de datos monetarios**
   ```sql
   -- Guardar en docs/migration-float-to-decimal-baseline-2026-04-09.sql
   SELECT 'Product' as table_name, COUNT(*), SUM(price) as sum_price FROM "Product" WHERE price > 0;
   SELECT 'Order' as table_name, COUNT(*), SUM(total) as sum_total FROM "Order" WHERE total > 0;
   SELECT 'SaleItem' as table_name, COUNT(*), SUM(price * quantity) as sum_total FROM "SaleItem";
   SELECT 'Customer' as table_name, COUNT(*), SUM(totalSpent) FROM "Customer" WHERE totalSpent > 0;
   ```

3. **Verificar DIRECT_URL**
   ```bash
   echo $DIRECT_URL | grep -q postgresql && echo "✅ DIRECT_URL OK" || echo "❌ FALTA"
   ```

4. **Crear script de bypass** (`scripts/apply-td018-migration.ts`) — evita pgbouncer hang

#### Fase 2: Migración SQL (Sesión 2, ~1 hora en ventana baja)

**Ejecución a las 02:00 UTC:**

1. Generar migration Prisma vacía: `npx prisma migrate dev --create-only --name td018_float_to_decimal`
2. Editar SQL con 87 ALTERs explícitos (cada uno con CAST a DECIMAL(12,2))
3. Ejecutar vía script bypass (NO vía Prisma CLI que cuelga con pgbouncer)
4. Validar: SUM de tablas debe coincidir exactamente con baseline

#### Fase 3: Cambios TypeScript (Sesión 3, 3-4 horas)

Prisma 7 devuelve `Decimal` (decimal.js), no número primitivo.

**Cambios críticos:**
- Schema: `price Float` → `price Decimal @db.Decimal(12, 2)`
- JSON responses: `.toFixed(2)` siempre (NO [object object])
- Cálculos: usar Decimal.js `.plus()`, `.times()`, etc.
- 22 DB classes: actualizar tipos + retornos

#### Fase 4: Validación + Monitoreo (Sesión 4, 1-2 horas)

- Validación exhaustiva (sumas vs baseline)
- Smoke tests (crear orden, generar factura, cuadre de caja)
- Monitoreo 4 horas en prod

---

### Campos monetarios a migrar (87 total)

**Resumido por criticidad:**

**Tier 1 (Core crítico):** Product.price, Order.total, SaleItem.price, Customer.totalSpent, Customer.creditBalance, CashierSession.openingAmount, etc. (18 campos)

**Tier 2 (Comprobantes + Finanzas):** Invoice.*, PurchaseOrder.total, Return.total, Promotion.discountPercent, Fiado.amount, etc. (20 campos)

**Tier 3 (Config + Validación):** Settings.*, ProductVariant.priceModifier, WholesaleOrder.*, CommissionLedger.*, etc. (49 campos)

---

### Riesgos TD-018

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|------------|---------|-----------|
| pgbouncer cuelga Prisma CLI | 80% | CRÍTICA | Script bypass pre-testrado |
| TS compilation error en tipos Decimal | 50% | MEDIA | Grep de `.price`/`.total` → `.toFixed(2)` |
| JSON incompatibility (Decimal no serializa) | 50% | MEDIA | `.toFixed(2)` antes de NextResponse.json() |
| Downtime > 1 hora | 20% | MEDIA | ALTER TABLE es operación rápida |

**Riesgo global: 🔴 CRÍTICA** — Plan documentado + bypasses. ~90% de confianza si se sigue.

---

### Gotchas Supabase

1. **pgbouncer cuelga Prisma CLI** — Workaround: `$executeRawUnsafe` directamente en script
2. **DIRECT_URL vs DATABASE_URL** — DIRECT_URL OBLIGATORIO para migraciones (salta pooler)
3. **Connection limits** — Ejecutar 87 ALTERs vía 1 sesión secuencial (NO múltiples prisma migrate)
4. **Backup restore tarda** — 5-10 minutos si hay que rollback

---

## TD-030: Crear modelo `LoyaltyTransaction` — Plan detallado

### Resumen

`Customer.loyaltyPoints` guarda solo el saldo actual. Historial no persiste. Crear modelo `LoyaltyTransaction` con `(id, customerId, tenantId, amount, reason, createdAt)` + backfill.

### Estrategia (3 fases, 1 sesión)

1. **Crear modelo en schema** — nueva tabla con relación 1:N a Customer
2. **Backfill** — convertir balance actual → transacciones sintéticas con `reason='legacy-backfill'`
3. **Actualizar route handler** — registrar transacciones en POST

### Checklist
- [ ] Schema tiene LoyaltyTransaction con índices (tenantId, createdAt, customerId)
- [ ] Migration generada sin errores
- [ ] Backfill script correr en lotes (máx 1000 por batch, `WHERE tenantId` obligatorio)
- [ ] Validar: count(LoyaltyTransaction) = count(Customer where loyaltyPoints > 0)

### Riesgos TD-030

| Riesgo | Probabilidad | Mitigación |
|--------|------------|-----------|
| Backfill crea duplicados | 20% | `skipDuplicates: true` |
| tenantId leak | 15% | Auditar WHERE en backfill script |

**Riesgo global: 🟢 BAJA**

---

## TD-031: Agregar `Review.imageUrls` — Plan detallado

### Resumen

Endpoint ya acepta `imageUrls` en request pero el campo no existe en DB. Agregar `imageUrls String[]` (array nativo Postgres).

### Estrategia (2 fases, 0.5 sesión)

1. **Schema:** `imageUrls String[] @default([])`
2. **Migration:** `npm run db:migrate -- --name add_review_imageUrls`
3. **Route handler:** Guardar array en la DB (actualmente descartado)

### Checklist
- [ ] Campo agregado a Review model
- [ ] Migration ejecutada sin errores
- [ ] Route handler guarda imageUrls (si existen)
- [ ] UI de marketplace muestra fotos post-deploy

### Riesgos TD-031

| Riesgo | Probabilidad | Mitigación |
|--------|------------|-----------|
| Array muy grande | 20% | Limitar a 3 URLs en Zod (ya está) |

**Riesgo global: 🟢 BAJA**

---

## TD-032: Agregar `Coupon.storeId` — Plan detallado

### Resumen

Cupones POS y marketplace se mezclan sin diferenciación. Agregar `storeId` opcional: POS = NULL, marketplace = storeId SET.

### Estrategia (2 fases, 0.5 sesión)

1. **Schema:** `storeId String? @index` + FK a Store (onDelete SetNull)
2. **Migration:** SQL con ALTER + índice
3. **Route handlers:** Filtrar by `storeId` en queries (marketplace vs POS)

### Checklist
- [ ] Columna storeId agregada con FK
- [ ] Índice creado
- [ ] Constraint único actualizado para `(tenantId, code, storeId)`
- [ ] Queries filtran por storeId correctamente (marketplace vs POS)

### Riesgos TD-032

| Riesgo | Probabilidad | Mitigación |
|--------|------------|-----------|
| Query olvidada sin filtro storeId | 40% | Auditar todas las queries, comentar intencionales |

**Riesgo global: 🟢 BAJA**

---

## Checklist pre-ejecución Global

### Antes de Sesión 1 (Prep TD-018)
- [ ] DIRECT_URL confirmado (`echo $DIRECT_URL | grep postgresql`)
- [ ] Backup manual en Supabase (> 50 MB)
- [ ] Rama feature/td018-float-to-decimal creada
- [ ] `scripts/apply-td018-migration.ts` escrito
- [ ] Baseline SQL guardado

### Antes de Sesión 2 (Ejecutar TD-018)
- [ ] Ventana mantenimiento 02:00-03:00 UTC reservada
- [ ] Migration SQL (87 campos) lista
- [ ] Feature flag `FF_MAINTENANCE_MODE` (si existe)
- [ ] Logs en Vercel/Sentry monitoreados

### Antes de Sesión 3 (TS fixes)
- [ ] Migration ejecutada sin errores
- [ ] Validación post-SQL confirmada

### Antes de Sesión 4 (Validación)
- [ ] `npm run build` sin errores
- [ ] `npm run test` verde
- [ ] Deploy a staging + smoke tests

### TD-030, TD-031, TD-032 (sesiones paralelas)
- [ ] Cada una testeada en staging
- [ ] Queries auditadas (sin tenantId leaks)

---

## Impacto en DB classes

| Clase | TD-018 | TD-030 | TD-031 | TD-032 | Total |
|-------|--------|--------|--------|--------|-------|
| products.db.ts | 10 funcs | 0 | 0 | 0 | **10** |
| orders.db.ts | 15 funcs | 0 | 0 | 0 | **15** |
| sales.db.ts | 8 funcs | 0 | 0 | 0 | **8** |
| customers.db.ts | 4 funcs | 2 funcs | 0 | 0 | **6** |
| invoices.db.ts | 6 funcs | 0 | 0 | 0 | **6** |
| marketplace.db.ts | 0 | 1 func | 1 func | 3 funcs | **5** |
| Otras (34 clases) | ~8 funcs | 0 | 0 | 0 | **8** |
| **TOTAL** | **22 classes** | **1 class** | **1 class** | **1 class** | **≥58 functions** |

---

## ADRs nuevos propuestos

| ADR ID | Título | Scope |
|-----------|-----------|-----------|
| **ADR 017** | Decimal(12,2) para dinero | Estándar de tipo para todos los campos monetarios futuros |
| **ADR 018** | LoyaltyTransaction: transacciones immutables | Modelo de historial de puntos (append-only) |
| **ADR 019** | Review.imageUrls: arrays nativos vs JOIN | Justificar String[] vs tabla ReviewImage |

---

## Top 3 riesgos detectados en ROJO

### 🔴 RIESGO 1: TD-018 tocar 22 DB classes es muy grande

**Problema:** Actualizar tipos en 22 archivos. Algún endpoint puede quedarse sin `.toFixed(2)` → JSON con [object object].

**Probabilidad:** 60%

**Mitigación:**
- Script de grep pre-generado que liste todos los usos
- Checklist de revisión por DB class
- Tests unitarios validando Decimal.toFixed(2)
- Deploy a staging + prueba manual (checkout, factura, cuadre)

**Crítica:** Sí — bloquea deploy a prod

---

### 🔴 RIESGO 2: TD-030 backfill pierde auditoría de origen

**Problema:** Convertir saldo → transacciones con `reason='legacy-backfill'` pero sin saber de dónde vinieron los puntos.

**Probabilidad:** 40%

**Mitigación:**
- Documentar que legacy-backfill es síntesis
- Agregar fecha aproximada (ayer o hace 30 días)
- Feature flag para no hacer backfill

**Crítica:** No — pero recomendación implementar logging previo

---

### 🔴 RIESGO 3: pgbouncer cuelga Prisma CLI durante TD-018

**Problema:** 87 ALTERs consecutivos = deadlock posible. Toma 10-15 min debuggear en ventana de mantenimiento.

**Probabilidad:** 70% ruta normal, 20% con script bypass

**Mitigación:**
- Usar script bypass testeado en staging
- Rollback plan (restore backup, 5 min downtime)
- Monitoreo cada 5s (health check endpoint)
- Ventana amplia (02:00-04:00 UTC)

**Crítica:** Sí — puede causar downtime

---

## Estimación final por migración

| TD | Sesión 1 | Sesión 2 | Sesión 3 | Sesión 4 | Total |
|----|----|----|----|----|---|
| **TD-018** | 2-4h | 1h | 3-4h | 1-2h | 7-11h (4 sesiones) |
| **TD-030** | — | — | 1h | — | 1h (1 sesión) |
| **TD-031** | — | — | 0.5h | — | 0.5h (0.5 sesión) |
| **TD-032** | — | — | 0.5h | — | 0.5h (0.5 sesión) |
| **TOTAL OLA 1** | 2-4h | 1h | 5-5.5h | 1-2h | **9-12.5 horas** |

**Realista:** 15-20 horas con testing, troubleshooting, rollbacks parciales.

---

**Documento generado:** 2026-04-09  
**Status:** ✅ PLAN COMPLETADO — Listo para ejecutar

**Próximos pasos:**  
1. Brandon revisión y aprobación  
2. Sesión 1: Backup + Baseline + Script bypass  
3. Sesión 2: Ejecutar TD-018 SQL (ventana baja)  
4. Sesiones 3-4: TS fixes + Validación  
5. Sesiones 5-7 (paralelo): TD-030, TD-031, TD-032

