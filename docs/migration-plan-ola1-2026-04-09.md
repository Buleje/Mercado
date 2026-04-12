# Plan unificado de migraciones — Ola 1 (2026-04-09)

**Fecha:** 2026-04-09
**Autor:** migration-planner (subagente)
**Scope:** TD-019, TD-020, TD-021 (índices) + TD-030, TD-031, TD-032 (modelos/campos faltantes)
**TD-018 (Float→Decimal):** NO entra en este plan — ver `docs/td018-consolidated-plan-2026-04-09.md`
**Estado global:** ÍNDICES (TD-019/020/021) ✅ YA APLICADOS EN PROD — Schema gaps (TD-030/031/032) 🟡 PENDIENTES
**Estrategia:** Aditiva zero-downtime con `CREATE INDEX CONCURRENTLY` y columnas nullable-first + backfill

---

## Resumen para Brandon (lenguaje simple)

Imagina la base de datos como un supermercado gigante. Para 6 tareas:

| TD | Qué es en palabras simples | Estado |
|----|----------------------------|--------|
| **TD-019** | Poner etiquetas (índices) en pasillos de productos de mayoristas. Ya hechas. | ✅ Ya aplicado |
| **TD-020** | Poner 4 etiquetas compuestas (tenant + estado/fecha) para que las listas carguen rápido. Ya hechas. | ✅ Ya aplicado |
| **TD-021** | Una etiqueta adicional para "¿en qué tiendas trabaja este usuario?". Ya hecha. | ✅ Ya aplicado |
| **TD-030** | Crear un "cuaderno de movimientos de puntos" (tabla nueva). Ahora sólo guardamos el saldo. | 🟡 Pendiente |
| **TD-031** | Agregar una columna "urls de fotos" a las reseñas. El UI ya las manda. | 🟡 Pendiente |
| **TD-032** | Agregar "tienda dueña" a los cupones para diferenciar marketplace vs POS. | 🟡 Pendiente |

Las tres pendientes son **todas aditivas** (columnas o tablas nuevas) → zero-downtime, reversibles con `DROP`, sin riesgo de corrupción.

---

## Tabla de contenido

1. [Estado actual y contexto](#1-estado-actual-y-contexto)
2. [Tabla maestra resumen](#2-tabla-maestra-resumen)
3. [Orden recomendado de ejecución](#3-orden-recomendado-de-ejecución)
4. [TD-019 — FK sin `@@index` (YA APLICADO)](#4-td-019--fk-sin-index-ya-aplicado)
5. [TD-020 — Compound indexes (YA APLICADO)](#5-td-020--compound-indexes-ya-aplicado)
6. [TD-021 — `StorePermission.userId` single-column (YA APLICADO)](#6-td-021--storepermissionuserid-ya-aplicado)
7. [TD-030 — Crear modelo `LoyaltyTransaction`](#7-td-030--crear-modelo-loyaltytransaction)
8. [TD-031 — Agregar `Review.imageUrls`](#8-td-031--agregar-reviewimageurls)
9. [TD-032 — Agregar `Coupon.storeId`](#9-td-032--agregar-couponstoreid)
10. [Rollback global](#10-rollback-global)
11. [Validación post-migración global](#11-validación-post-migración-global)
12. [Gotchas Supabase/Prisma](#12-gotchas-supabaseprisma)
13. [Checklist ejecutivo](#13-checklist-ejecutivo)

---

## 1. Estado actual y contexto

### Índices (TD-019/020/021)

**Cerrados el 2026-04-09** vía `scripts/verify-pg-indexes-ola1.ts` + `scripts/apply-ola1-indices.ts` (ADR-017). Este documento los mantiene como **sección histórica** para que el plan de la ola sea completo y navegable, pero **no requieren acción nueva**.

Evidencia:
- `docs/TECH-DEBT.md` marca TD-019, TD-020 y TD-021 como `✅ Cerrado`
- `docs/adr/017-ola1-migrations-indices-strategy.md` documenta la ejecución real (4 `CREATE INDEX CONCURRENTLY` en pooler session mode, <600ms totales, zero downtime, 0 índices `INVALID`)
- `docs/migration-plan-indices-ola1-2026-04-09.md` contiene el plan técnico original

### Schema gaps (TD-030/031/032)

**Abiertos.** Los tres son workarounds dejados en código durante Sprint C (2026-04-07) cuando se pasó de `ignoreBuildErrors: true` a `false`. Los route handlers tienen comentarios `TECH-DEBT` explícitos:

| TD | Archivos con `TECH-DEBT` hoy |
|----|-------------------------------|
| TD-030 | `app/api/marketplace/loyalty/route.ts:46-47, 101-102, 157-158` |
| TD-031 | `app/api/marketplace/stores/[slug]/reviews/route.ts:48, 115, 143` |
| TD-032 | `app/api/marketplace/coupons/route.ts:41-42, 100`, `app/api/marketplace/coupons/validate/route.ts:37`, `app/api/superadmin/marketplace/coupons/route.ts` |

### Infraestructura relevante

- **Postgres:** Supabase 16+ con pgBouncer transaction pooling en `DATABASE_URL` (puerto 6543), conexión directa en `DIRECT_URL` (puerto 5432)
- **Prisma:** 6.x con Prisma 7 semantics activadas
- **pgBouncer quirk:** `CREATE INDEX CONCURRENTLY` NO funciona con transaction pooling (puerto 6543). Hay dos caminos válidos: `DIRECT_URL` puerto 5432 o pooler en **session mode**. Para este repo, el precedente de TD-019/020/021 usó session mode del pooler (ver `lib/db-prisma-pg-workaround.ts` equivalente)
- **TD-018:** Ya migrado a `Decimal(12,2)` en 87 campos. El schema ya refleja los tipos Decimal en `Customer.totalSpent`, `Coupon.discountValue`, etc. No tocar.

---

## 2. Tabla maestra resumen

| TD | Cambio | Tipo | Duración | Riesgo | Reversible | Requiere ventana | Estado |
|----|--------|------|----------|--------|------------|------------------|--------|
| TD-019 | 3 `@@index` en FK `WholesaleOrderItem`, `StoreProduct` | Aditivo (índices) | <1s (ya hecho) | 🟢 Bajo | Sí (`DROP INDEX`) | No | ✅ Cerrado |
| TD-020 | 4 compound indexes `(tenantId, status)` / `(tenantId, createdAt DESC)` | Aditivo (índices) | <600ms (ya hecho) | 🟢 Bajo | Sí (`DROP INDEX`) | No | ✅ Cerrado |
| TD-021 | 1 `@@index([userId])` en `StorePermission` | Aditivo (índices) | <1s (ya hecho) | 🟢 Bajo | Sí (`DROP INDEX`) | No | ✅ Cerrado |
| **TD-030** | Crear modelo `LoyaltyTransaction` + backfill histórico | Aditivo (tabla + datos) | 15–30 min | 🟡 Medio | Sí (`DROP TABLE`) | No | 🟡 Pendiente |
| **TD-031** | Agregar `Review.imageUrls String[]` (opción A) **o** reutilizar `photosJson String?` existente (opción B) | Aditivo (columna) | 2–5 min | 🟢 Bajo | Sí (`DROP COLUMN`) | No | 🟡 Pendiente |
| **TD-032** | Agregar `Coupon.storeId String?` + FK opcional a `Store` + índice | Aditivo (columna + FK + índice) | 5–10 min | 🟡 Medio (unique constraint) | Sí (`DROP COLUMN`) | No | 🟡 Pendiente |

**Total duración zona pendiente:** ~30–45 min de DDL + ~15 min de validación.

---

## 3. Orden recomendado de ejecución

Para la **zona pendiente** (TD-030/031/032):

```
PASO 0 — Pre-flight (todos en paralelo, solo lectura)
  ├─ Verificar DIRECT_URL conectado
  ├─ Confirmar pg_stat_activity < 50 conexiones activas
  └─ Snapshot baseline de Customer.loyaltyPoints (para backfill TD-030)

PASO 1 — TD-031 (más simple, menor riesgo)
  ├─ ALTER TABLE "Review" ADD COLUMN "imageUrls" TEXT[] NOT NULL DEFAULT '{}'
  └─ Validación: SELECT COUNT(*) FROM "Review" WHERE "imageUrls" IS NOT NULL

PASO 2 — TD-032 (riesgo medio por unique constraint)
  ├─ ALTER TABLE "Coupon" ADD COLUMN "storeId" TEXT NULL
  ├─ ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_storeId_fkey" FK → Store(id) ON DELETE SET NULL
  ├─ CREATE INDEX CONCURRENTLY idx_coupon_storeid
  └─ Migrar unique: DROP OLD → CREATE UNIQUE (tenantId, code, storeId NULLS NOT DISTINCT)

PASO 3 — TD-030 (mayor complejidad — tabla nueva + backfill)
  ├─ CREATE TABLE "LoyaltyTransaction"
  ├─ CREATE INDEX CONCURRENTLY (3 índices)
  ├─ Backfill script: por cada Customer con loyaltyPoints > 0, insertar 1 fila histórica sintética
  └─ Validación: SUM(amount) por customer = Customer.loyaltyPoints

PASO 4 — Schema sync (siempre último)
  ├─ Editar prisma/schema.prisma con los 3 cambios
  ├─ npx prisma validate && npx prisma format && npx prisma generate
  └─ NO correr prisma migrate dev — los cambios ya están en DB

PASO 5 — Cleanup código
  ├─ Quitar todos los comentarios TECH-DEBT en los 5 route handlers listados
  ├─ Re-activar lógica de LoyaltyTransaction, imageUrls, storeId
  └─ Tests + build + deploy
```

**Por qué ese orden:**
- TD-031 primero → es el más chico y valida el pipeline de migración manual (pooler session mode, schema sync, etc.)
- TD-032 segundo → único-compuesto requiere atención, pero ya tienes precedente del PASO 1
- TD-030 último → es el único que tiene backfill de datos. Si algo sale mal, los dos primeros ya están estables

**¿Se pueden paralelizar?** Técnicamente sí (los 3 no se tocan entre sí), pero se recomienda secuenciarlos para aislamiento de errores y observabilidad (logs limpios por cambio).

### Windows de ejecución

Ninguno de los tres cambios requiere ventana de mantenimiento. Todos son aditivos con columnas nullable o defaults explícitos. Se pueden correr en horario laboral siempre que:

- El pooler tenga una sesión libre
- Los writes a las tablas afectadas (`Review`, `Coupon`, `Customer`) sean <10 rps (caso actual)
- Haya monitoreo activo de Sentry para capturar writes que fallen durante el ALTER

Si el tráfico es >50 rps en cualquiera de las 3 tablas, ejecutar en horario de baja carga (02:00–06:00 UTC). Hoy no es el caso.

---

## 4. TD-019 — FK sin `@@index` (YA APLICADO)

### Diagnóstico histórico

`WholesaleOrderItem.productId`, `WholesaleOrderItem.wholesaleOrderId` y `StoreProduct.productId` existían como columnas FK pero sin índices declarados en un snapshot antiguo. Postgres no crea índices automáticos en FKs (a diferencia de MySQL) → `JOIN` y `CASCADE` iban a full-scan.

### Cambio al schema.prisma (ya aplicado)

Ya está en el schema actual. Verificado en líneas 2596–2597 (`WholesaleOrderItem`) y 2376–2378 (`StoreProduct`). Confirmado físicamente en DB vía `scripts/verify-pg-indexes-ola1.ts` (ADR-017).

### SQL manual (histórico)

```sql
-- Ya aplicado — mantener como referencia
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wholesaleorderitem_productid
    ON "WholesaleOrderItem" ("productId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wholesaleorderitem_wholesaleorderid
    ON "WholesaleOrderItem" ("wholesaleOrderId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_storeproduct_productid
    ON "StoreProduct" ("productId");
```

### Acción pendiente

**Ninguna.** Cerrado.

### Rollback (si hubiera sido necesario)

```sql
DROP INDEX CONCURRENTLY IF EXISTS idx_wholesaleorderitem_productid;
DROP INDEX CONCURRENTLY IF EXISTS idx_wholesaleorderitem_wholesaleorderid;
DROP INDEX CONCURRENTLY IF EXISTS idx_storeproduct_productid;
```

### Validación

Ya ejecutada. Re-verificación: ver sección 11 (query `pg_indexes`).

---

## 5. TD-020 — Compound indexes (YA APLICADO)

### Diagnóstico histórico

4 modelos frecuentes (`PurchaseOrder`, `Payable`, `NotificationLog`, `SupportTicket`) no tenían compound indexes `(tenantId, status)` o `(tenantId, createdAt)` → las queries del dashboard admin filtraban por `tenantId` con índice y luego aplicaban `filter` sobre `status` en memoria.

### Cambio al schema.prisma (ya aplicado)

```prisma
// YA EN EL SCHEMA — referencia histórica

model PurchaseOrder {
  // ...
  @@index([tenantId, status], map: "idx_purchaseorder_tenantid_status")
}

model Payable {
  // ...
  @@index([tenantId, status], map: "idx_payable_tenantid_status")
}

model NotificationLog {
  // ...
  @@index([tenantId, createdAt(sort: Desc)], map: "idx_notificationlog_tenantid_createdat")
}

model SupportTicket {
  // ...
  @@index([tenantId, status], map: "idx_supportticket_tenantid_status")
}
```

### SQL manual (histórico)

```sql
-- Ya aplicado 2026-04-09 vía scripts/apply-ola1-indices.ts
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_purchaseorder_tenantid_status
    ON "PurchaseOrder" ("tenantId", "status");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payable_tenantid_status
    ON "Payable" ("tenantId", "status");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notificationlog_tenantid_createdat
    ON "NotificationLog" ("tenantId", "createdAt" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_supportticket_tenantid_status
    ON "SupportTicket" ("tenantId", "status");
```

### Acción pendiente

**Ninguna.** Cerrado.

### Justificación query-por-query

| Índice | Query real en código | Archivo |
|--------|---------------------|---------|
| `idx_purchaseorder_tenantid_status` | Dashboard admin filtra órdenes de compra "pendiente/recibida" por tenant | `lib/db/purchases.db.ts` + `app/admin/page.tsx` |
| `idx_payable_tenantid_status` | "Cuentas por pagar pendientes del tenant X" | `lib/db/finance.db.ts` |
| `idx_notificationlog_tenantid_createdat` | Listado paginado cronológico descendente de notificaciones | `lib/db/notifications.db.ts` |
| `idx_supportticket_tenantid_status` | "Tickets abiertos del tenant X" | direct Prisma en routes |

---

## 6. TD-021 — `StorePermission.userId` (YA APLICADO)

### Diagnóstico histórico

`StorePermission` tenía `@@unique([storeId, userId, userType])` pero faltaba `@@index([userId])` solo. El índice único compuesto no sirve para la query "dame todas las tiendas del usuario X" porque Postgres no puede usar un compound donde la columna buscada no es el prefijo.

### Cambio al schema.prisma (ya aplicado)

Ya en línea 2611. Confirmado físicamente en DB.

### SQL manual (histórico)

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_storepermission_userid
    ON "StorePermission" ("userId");
```

### Acción pendiente

**Ninguna.** Cerrado.

---

## 7. TD-030 — Crear modelo `LoyaltyTransaction`

### Diagnóstico

**Feature afectada:** Sistema de puntos de fidelidad del marketplace.

**Estado actual:**
- `Customer.loyaltyPoints Int @default(0)` guarda **solo el saldo actual**
- `app/api/marketplace/loyalty/route.ts` tiene 3 referencias con comentarios `TECH-DEBT: modelo LoyaltyTransaction no está en schema Prisma`:
  - Línea 46–47: `GET` debería retornar historial → actualmente retorna array vacío
  - Línea 101–102: `POST earn` debería registrar ganancia → actualmente solo incrementa saldo
  - Línea 157–158: `POST redeem` debería registrar canje → actualmente solo decrementa saldo
- **Sin audit trail** → imposible explicar a un cliente por qué su saldo cambió. Rompe contabilidad básica.

**Consecuencia de negocio:** Si un cliente reclama "tenía 500 puntos y ahora tengo 200", no hay forma de reconstruir qué pasó. Cualquier disputa legal o cuadre contable es ciego.

### Cambio al schema.prisma

```prisma
model LoyaltyTransaction {
  id          String   @id @default(cuid())
  tenantId    String
  customerPhone String   // FK lógica a Customer.phone (que es @id)
  amount      Int      // positivo = earn, negativo = redeem
  reason      String   // "purchase" | "signup" | "referral" | "redeem-discount" | "legacy-backfill" | "admin-adjust"
  referenceId String?  // opcional: orderId, referralId, couponId
  balanceAfter Int     // snapshot del saldo tras esta transacción (para audits rápidos sin recomputar)
  createdAt   DateTime @default(now())
  createdBy   String?  // userId o "system" si fue automático

  customer Customer @relation(fields: [customerPhone], references: [phone], onDelete: Cascade)

  @@index([tenantId, createdAt(sort: Desc)])
  @@index([customerPhone, createdAt(sort: Desc)])
  @@index([tenantId, reason])
}

model Customer {
  // ...existing fields...
  loyaltyTransactions LoyaltyTransaction[]
}
```

**Razonamiento:**
- `customerPhone` en vez de `customerId` porque `Customer.phone` es el `@id` en este schema (línea 163)
- `balanceAfter` denormalizado para queries "último saldo" sin tener que `SUM(amount)` por cliente
- `reason` es `String` en vez de `enum` para flexibilidad (evita migraciones futuras cuando se agreguen razones)
- 3 índices para cubrir: (a) listado global del tenant, (b) historial de 1 cliente, (c) reportes por razón
- `onDelete: Cascade` porque si borras un Customer, su historial de puntos no debe quedar huérfano
- `createdBy` opcional para human-in-the-loop futuro (saber quién hizo el ajuste manual)

### SQL migration manual

```sql
-- ────────────────────────────────────────────────
-- TD-030 — Crear LoyaltyTransaction
-- Aditivo, zero-downtime, reversible
-- Ejecutar con pooler session mode (puerto 5432) o DIRECT_URL
-- ────────────────────────────────────────────────

-- PASO 1: Crear tabla
CREATE TABLE IF NOT EXISTS "LoyaltyTransaction" (
    "id" TEXT PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "referenceId" TEXT,
    "balanceAfter" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    CONSTRAINT "LoyaltyTransaction_customer_fkey"
        FOREIGN KEY ("customerPhone") REFERENCES "Customer"("phone")
        ON DELETE CASCADE ON UPDATE CASCADE
);

-- PASO 2: Crear índices (CONCURRENTLY fuera de transacción)
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_loyaltytxn_tenant_createdat"
    ON "LoyaltyTransaction" ("tenantId", "createdAt" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_loyaltytxn_customer_createdat"
    ON "LoyaltyTransaction" ("customerPhone", "createdAt" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_loyaltytxn_tenant_reason"
    ON "LoyaltyTransaction" ("tenantId", "reason");
```

### Backfill plan

**Objetivo:** Por cada cliente con `loyaltyPoints > 0`, insertar 1 fila sintética con `reason = 'legacy-backfill'` para que el historial no quede vacío y futuras queries `SUM(amount)` cuadren con el saldo actual.

```sql
-- PASO 3: Backfill histórico (batches de 1000)
-- Ejecutar en transacción por lotes
-- Puede correr online (no bloquea writes)

DO $$
DECLARE
    batch_size INT := 1000;
    rows_affected INT;
BEGIN
    LOOP
        INSERT INTO "LoyaltyTransaction" (
            "id",
            "tenantId",
            "customerPhone",
            "amount",
            "reason",
            "balanceAfter",
            "createdBy",
            "createdAt"
        )
        SELECT
            'legacy_' || substr(md5(random()::text || c.phone), 1, 16) as id,
            c."tenantId",
            c."phone" as "customerPhone",
            c."loyaltyPoints" as "amount",
            'legacy-backfill' as "reason",
            c."loyaltyPoints" as "balanceAfter",
            'system' as "createdBy",
            NOW() - INTERVAL '1 day' as "createdAt"  -- ayer sintético
        FROM "Customer" c
        WHERE c."loyaltyPoints" > 0
          AND NOT EXISTS (
              SELECT 1 FROM "LoyaltyTransaction" lt
              WHERE lt."customerPhone" = c."phone"
                AND lt."reason" = 'legacy-backfill'
          )
        LIMIT batch_size;

        GET DIAGNOSTICS rows_affected = ROW_COUNT;
        RAISE NOTICE 'Inserted % rows', rows_affected;
        EXIT WHEN rows_affected = 0;
        -- commit implícito dentro del DO block requiere extensión,
        -- alternativa: correr este bloque en un script TS que haga commit por batch
    END LOOP;
END $$;
```

**Nota:** Postgres no permite COMMIT dentro de un bloque `DO` plain. El backfill real debe correr desde `scripts/backfill-loyalty-transactions.ts` (a crear, similar a `scripts/apply-ola1-indices.ts`) usando Prisma con loops + `prisma.$transaction` explícito por batch.

### Windows de ejecución

- DDL (CREATE TABLE + 3 CREATE INDEX): en vivo, <500ms
- Backfill: en vivo, ~1–2s por 10k clientes (asumiendo <10k clientes con puntos activos — verificar con `SELECT COUNT(*) FROM "Customer" WHERE "loyaltyPoints" > 0`)

Si el conteo supera 50k clientes, mover backfill a horario 02:00–06:00 UTC por precaución (aunque sigue siendo no-bloqueante).

### Rollback plan

```sql
-- Reversión total: zero data loss del dato original (Customer.loyaltyPoints intacto)
DROP TABLE IF EXISTS "LoyaltyTransaction" CASCADE;
```

El `CASCADE` elimina los índices y la FK. No toca `Customer` ni `Customer.loyaltyPoints`, por lo que el sistema vuelve exactamente al estado actual.

### Validación post-migración

```sql
-- Validación 1: todas las filas de Customer con loyaltyPoints > 0 tienen backfill
SELECT
    (SELECT COUNT(*) FROM "Customer" WHERE "loyaltyPoints" > 0) as customers_with_points,
    (SELECT COUNT(DISTINCT "customerPhone") FROM "LoyaltyTransaction" WHERE "reason" = 'legacy-backfill') as backfilled;
-- Esperado: ambos números iguales

-- Validación 2: SUM(amount) por cliente = Customer.loyaltyPoints
SELECT
    c."phone",
    c."loyaltyPoints" as saldo_actual,
    COALESCE(SUM(lt."amount"), 0) as suma_historial,
    c."loyaltyPoints" - COALESCE(SUM(lt."amount"), 0) as delta
FROM "Customer" c
LEFT JOIN "LoyaltyTransaction" lt ON lt."customerPhone" = c."phone"
WHERE c."loyaltyPoints" > 0
GROUP BY c."phone", c."loyaltyPoints"
HAVING c."loyaltyPoints" != COALESCE(SUM(lt."amount"), 0);
-- Esperado: 0 filas

-- Validación 3: sin tenantId leaks (todos los rows tienen tenantId válido)
SELECT COUNT(*) FROM "LoyaltyTransaction" WHERE "tenantId" IS NULL OR "tenantId" = '';
-- Esperado: 0

-- Validación 4: índices físicos existen y están válidos
SELECT indexname, indisvalid
FROM pg_indexes
JOIN pg_index ON pg_indexes.indexname = (
    SELECT relname FROM pg_class WHERE oid = pg_index.indexrelid
)
WHERE tablename = 'LoyaltyTransaction';
```

### Riesgos específicos TD-030

| Riesgo | Prob | Mitigación |
|--------|------|-----------|
| Backfill crea duplicados si se corre 2x | Media | `NOT EXISTS` check en el INSERT + `reason = 'legacy-backfill'` como marca idempotente |
| `Customer.phone` no único para clientes diferentes (FK rompe) | Baja | `phone` es `@id` del schema → garantizado único |
| Backfill pierde auditoría de origen real | Alta | Documentar explícitamente que `legacy-backfill` es sintético. El valor histórico real se perdió en 2026-04-07 cuando el modelo se omitió. |
| tenantId leak en backfill | Baja | El `SELECT` copia `c."tenantId"` del Customer original, nunca hardcodea |

### Checklist

- [ ] Snapshot: `SELECT COUNT(*), SUM(loyaltyPoints) FROM "Customer" WHERE loyaltyPoints > 0` (guardar en docs/)
- [ ] Ejecutar `CREATE TABLE LoyaltyTransaction`
- [ ] Ejecutar los 3 `CREATE INDEX CONCURRENTLY`
- [ ] Crear `scripts/backfill-loyalty-transactions.ts` (batches, Prisma explícito)
- [ ] Ejecutar backfill
- [ ] Correr las 4 validaciones SQL
- [ ] Actualizar `prisma/schema.prisma` con el modelo
- [ ] `npx prisma validate && npx prisma format && npx prisma generate`
- [ ] Quitar comentarios TECH-DEBT en `app/api/marketplace/loyalty/route.ts` (3 ubicaciones)
- [ ] Re-implementar: GET retorna historial, POST earn/redeem inserta LoyaltyTransaction
- [ ] Tests unitarios: earn, redeem, balance computation
- [ ] Deploy a staging + smoke test
- [ ] Deploy a prod

---

## 8. TD-031 — Agregar `Review.imageUrls`

### Diagnóstico

**Feature afectada:** Reseñas con fotos en el marketplace.

**Estado actual:**
- `Review` tiene un campo `photosJson String?` (línea 363 del schema) — ya existente pero **no usado por el endpoint actual**
- `app/api/marketplace/stores/[slug]/reviews/route.ts` tiene:
  - Línea 15: Zod schema acepta `imageUrls: z.array(z.string().url()).max(3).optional()`
  - Línea 48, 115, 143: comentarios `TECH-DEBT: campo imageUrls no está en schema Prisma, removido temporalmente`
  - Línea 88: destructura `imageUrls` pero no lo persiste
- El UI envía `imageUrls` como array → el servidor lo descarta silenciosamente

**Opciones de diseño:**

| Opción | Descripción | Pros | Cons |
|--------|-------------|------|------|
| **A. `imageUrls String[]`** (recomendada) | Nuevo array nativo Postgres | Query natural con `ANY()`, tipo explícito, Prisma maneja `String[]` nativamente | Columna nueva adicional |
| **B. Reutilizar `photosJson`** | Guardar `JSON.stringify(imageUrls)` en `photosJson` | Sin cambio de schema | Requiere parseo en cada read, tipo débil, contrato implícito |
| **C. Tabla `ReviewImage` 1:N** | Tabla separada con `reviewId` + `url` + `order` | Rigor relacional, soporta metadata por imagen | Overkill para max 3 imágenes por review, JOIN adicional |

**Decisión:** **Opción A**. El límite de 3 imágenes del Zod schema hace que `String[]` sea óptimo (no hay necesidad de tabla separada). Postgres arrays son performantes para <10 elementos y Prisma los maneja nativamente. `photosJson` se puede deprecar después o dejarse como legacy si ya tiene data.

### Cambio al schema.prisma

```prisma
model Review {
  // ...existing fields...
  photosJson       String?    // @deprecated — usar imageUrls. Mantener para compat legacy
  imageUrls        String[]   @default([]) // max 3 por Zod validation
  // ...resto...
}
```

**Razonamiento:**
- `@default([])` evita que queries existentes se rompan (el array viene vacío por default)
- Marcar `photosJson` como `@deprecated` en comentario → en un ola futura se puede migrar la data legacy a `imageUrls` y luego `DROP COLUMN photosJson`

### SQL migration manual

```sql
-- ────────────────────────────────────────────────
-- TD-031 — Agregar Review.imageUrls
-- Aditivo, zero-downtime
-- ────────────────────────────────────────────────

ALTER TABLE "Review"
    ADD COLUMN IF NOT EXISTS "imageUrls" TEXT[] NOT NULL DEFAULT '{}';
```

**Nota sobre el `NOT NULL DEFAULT`:** Postgres 11+ implementa esto como una operación O(1) cuando el default es constante — no reescribe filas existentes. Zero impact en la tabla, zero locks prolongados.

### Backfill plan

**Ninguno.** El default `'{}'` (array vacío) cubre todas las filas existentes. No hay data legacy en `imageUrls` porque el campo nunca existió.

**Opcional:** si se quiere recuperar data legacy de `photosJson` (posiblemente llenado manualmente antes):

```sql
-- Opcional: migrar photosJson JSON → imageUrls array
UPDATE "Review"
SET "imageUrls" = ARRAY(SELECT json_array_elements_text(photosJson::json))
WHERE "photosJson" IS NOT NULL
  AND "photosJson" != ''
  AND "imageUrls" = '{}';
```

Verificar primero si `photosJson` tiene data real: `SELECT COUNT(*) FROM "Review" WHERE "photosJson" IS NOT NULL AND "photosJson" != '';`. Si el resultado es 0, omitir este paso.

### Windows de ejecución

Zero window — correr en horario laboral.

### Rollback plan

```sql
ALTER TABLE "Review" DROP COLUMN IF EXISTS "imageUrls";
```

Zero data loss si se rollback antes de quitar los TECH-DEBT comments del código. Si el rollback ocurre después, se pierden las `imageUrls` persistidas en el intervalo — mitigar con snapshot previo si es preocupación.

### Validación post-migración

```sql
-- Validación 1: columna existe con el tipo correcto
SELECT column_name, data_type, udt_name, column_default
FROM information_schema.columns
WHERE table_name = 'Review' AND column_name = 'imageUrls';
-- Esperado: data_type='ARRAY', udt_name='_text', column_default="'{}'::text[]"

-- Validación 2: todas las rows existentes tienen array vacío (no NULL)
SELECT COUNT(*) FROM "Review" WHERE "imageUrls" IS NULL;
-- Esperado: 0

-- Validación 3: array_length=0 en rows legacy
SELECT COUNT(*) FROM "Review" WHERE array_length("imageUrls", 1) IS NOT NULL;
-- Esperado: 0 si no se ha deployado el nuevo código, >0 si ya se deployó y algunos escribieron
```

### Riesgos específicos TD-031

| Riesgo | Prob | Mitigación |
|--------|------|-----------|
| Array muy grande (DoS via reviews con 1000 urls) | Baja | Zod ya limita a `.max(3)` en el route handler |
| URLs no validadas (XSS en UI) | Media | Zod ya valida `z.string().url()` — el UI debe además `<img>` con `rel="noreferrer"` |
| Legacy `photosJson` con data real no migrada | Baja | Correr SELECT previo; si hay data, ejecutar backfill opcional |

### Checklist

- [ ] Verificar si `photosJson` tiene data legacy (SELECT COUNT)
- [ ] Ejecutar `ALTER TABLE "Review" ADD COLUMN "imageUrls"`
- [ ] (Opcional) Backfill desde `photosJson` si hay data
- [ ] Validar con las 3 queries
- [ ] Actualizar `prisma/schema.prisma` con `imageUrls String[] @default([])`
- [ ] `npx prisma validate && npx prisma format && npx prisma generate`
- [ ] Quitar 3 comentarios TECH-DEBT en `app/api/marketplace/stores/[slug]/reviews/route.ts`
- [ ] Re-implementar persistencia y retorno de `imageUrls`
- [ ] Test de integración: crear review con 3 imágenes, leer, verificar
- [ ] Deploy

---

## 9. TD-032 — Agregar `Coupon.storeId`

### Diagnóstico

**Feature afectada:** Cupones del marketplace vs cupones del POS.

**Estado actual:**
- `Coupon` tiene `@@unique([tenantId, code])` (línea 821 del schema)
- `app/api/marketplace/coupons/route.ts:41-42, 100` — filtrado por `storeId` removido con TECH-DEBT
- `app/api/marketplace/coupons/validate/route.ts:37` — idem
- `app/api/superadmin/marketplace/coupons/route.ts` — también afectado
- **Consecuencia:** un cupón "DESC10" creado para la tienda "Bodega Central" también es válido en la caja POS del mismo tenant. Cupones cruzados.

### Cambio al schema.prisma

```prisma
model Coupon {
  id            String    @id @default(cuid())
  code          String
  tenantId      String
  storeId       String?   // NULL = cupón POS (todo el tenant), SET = cupón marketplace de esa tienda
  store         Store?    @relation(fields: [storeId], references: [id], onDelete: SetNull)
  description   String    @default("")
  discountType  String    @default("percent")
  discountValue Decimal   @default(0) @db.Decimal(12, 2)
  balance       Decimal?  @db.Decimal(12, 2)
  minPurchase   Decimal?  @db.Decimal(12, 2)
  maxUses       Int?
  usedCount     Int       @default(0)
  active        Boolean   @default(true)
  expiresAt     DateTime?
  createdAt     DateTime  @default(now())

  @@unique([tenantId, code, storeId], map: "Coupon_tenant_code_store_unique")
  @@index([tenantId])
  @@index([storeId])
}

model Store {
  // ...existing fields...
  coupons Coupon[]
}
```

**Razonamiento:**
- `storeId` es `String?` (nullable) para que los cupones POS legacy sigan funcionando sin migración
- `onDelete: SetNull` porque si se borra una Store, los cupones no se pierden, sólo pasan a "cupón general del tenant"
- **Unique cambia** de `(tenantId, code)` a `(tenantId, code, storeId)` — esto es lo más delicado del plan

### SQL migration manual

```sql
-- ────────────────────────────────────────────────
-- TD-032 — Agregar Coupon.storeId
-- ATENCIÓN: requiere rebuild del unique constraint
-- ────────────────────────────────────────────────

-- PASO 1: Agregar columna nullable (instantáneo)
ALTER TABLE "Coupon"
    ADD COLUMN IF NOT EXISTS "storeId" TEXT NULL;

-- PASO 2: Agregar FK opcional
ALTER TABLE "Coupon"
    ADD CONSTRAINT "Coupon_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "Store"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
    NOT VALID;

-- PASO 3: Validar la FK en background (sin lock fuerte)
ALTER TABLE "Coupon" VALIDATE CONSTRAINT "Coupon_storeId_fkey";

-- PASO 4: Crear índice single-column (CONCURRENTLY)
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_coupon_storeid"
    ON "Coupon" ("storeId");

-- PASO 5: Migrar unique constraint
-- Postgres 15+ soporta NULLS NOT DISTINCT para que dos cupones con storeId=NULL
-- y el mismo (tenantId, code) sean considerados duplicados (comportamiento POS).
-- Sin esta cláusula, NULL != NULL y dos cupones POS con mismo code serían permitidos.

-- PASO 5a: Drop del unique viejo (instantáneo)
ALTER TABLE "Coupon" DROP CONSTRAINT IF EXISTS "Coupon_tenantId_code_key";

-- PASO 5b: Crear nuevo unique con NULLS NOT DISTINCT
ALTER TABLE "Coupon"
    ADD CONSTRAINT "Coupon_tenant_code_store_unique"
    UNIQUE NULLS NOT DISTINCT ("tenantId", "code", "storeId");
```

**Gotcha crítico:** `NULLS NOT DISTINCT` requiere Postgres 15+. Supabase corre 15+ desde 2023, pero **verificar** antes de correr:

```sql
SELECT version(); -- esperado: PostgreSQL 15.x o superior
```

Si estás en 14 o menor, usar esta alternativa:

```sql
-- Alternativa para Postgres 14:
-- Crear un unique parcial + un functional unique

-- Unique para cupones POS (storeId IS NULL)
CREATE UNIQUE INDEX "Coupon_tenant_code_pos_unique"
    ON "Coupon" ("tenantId", "code")
    WHERE "storeId" IS NULL;

-- Unique para cupones marketplace (storeId IS NOT NULL)
CREATE UNIQUE INDEX "Coupon_tenant_code_marketplace_unique"
    ON "Coupon" ("tenantId", "code", "storeId")
    WHERE "storeId" IS NOT NULL;
```

### Backfill plan

**Todos los cupones existentes quedan con `storeId = NULL`** → se convierten automáticamente en "cupones POS del tenant" (comportamiento actual). Zero backfill necesario.

Si después de la migración quieres marcar cupones existentes como marketplace manualmente:

```sql
-- Ejemplo: marcar todos los cupones de cierto tenant como pertenecientes a una store específica
UPDATE "Coupon"
SET "storeId" = 'store-cuid-aqui'
WHERE "tenantId" = 'tenant-aqui'
  AND "code" IN ('DESC10', 'WELCOME20');
```

### Windows de ejecución

- PASO 1–4: en vivo, <500ms total
- PASO 5 (DROP + ADD unique): **bloquea writes a `Coupon` por 1–3s** porque el DROP del constraint viejo toma un ACCESS EXCLUSIVE lock brevemente

**Recomendación:** ejecutar PASO 5 en horario de baja actividad (02:00–06:00 UTC) o cuando tengas confirmación de que los usuarios admin no están creando cupones en ese instante. El lock es brevísimo pero es el único paso no-concurrente del plan.

### Rollback plan

```sql
-- Reversión completa
ALTER TABLE "Coupon" DROP CONSTRAINT IF EXISTS "Coupon_tenant_code_store_unique";
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_tenantId_code_key" UNIQUE ("tenantId", "code");
DROP INDEX CONCURRENTLY IF EXISTS "idx_coupon_storeid";
ALTER TABLE "Coupon" DROP CONSTRAINT IF EXISTS "Coupon_storeId_fkey";
ALTER TABLE "Coupon" DROP COLUMN IF EXISTS "storeId";
```

**Cero data loss** si se rollback antes de usar `storeId` en writes nuevos. Si se rollback después de que usuarios admin crearon cupones marketplace con `storeId` SET, esos cupones colapsan en "cupones POS" (el storeId se pierde pero el cupón sigue siendo válido).

### Validación post-migración

```sql
-- Validación 1: columna existe + FK + índice
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'Coupon' AND column_name = 'storeId';
-- Esperado: data_type='text', is_nullable='YES'

SELECT conname, contype
FROM pg_constraint
WHERE conrelid = '"Coupon"'::regclass
  AND contype IN ('f', 'u');
-- Esperado: Coupon_storeId_fkey (tipo 'f'), Coupon_tenant_code_store_unique (tipo 'u')

SELECT indexname FROM pg_indexes WHERE tablename = 'Coupon' ORDER BY indexname;

-- Validación 2: todos los cupones existentes tienen storeId NULL (no se rompieron)
SELECT COUNT(*) FROM "Coupon" WHERE "storeId" IS NULL;
SELECT COUNT(*) FROM "Coupon";
-- Esperado: el primer COUNT debe ser igual al segundo (antes del primer insert con storeId SET)

-- Validación 3: no hay cupones huérfanos con storeId apuntando a Store inexistente
SELECT c."id", c."storeId"
FROM "Coupon" c
LEFT JOIN "Store" s ON s."id" = c."storeId"
WHERE c."storeId" IS NOT NULL AND s."id" IS NULL;
-- Esperado: 0 filas

-- Validación 4: intentar insertar duplicado debe fallar
-- (TEST MANUAL en staging)
-- INSERT INTO "Coupon" (id, code, tenantId, storeId) VALUES ('test1', 'DUPE', 'tenant1', NULL);
-- INSERT INTO "Coupon" (id, code, tenantId, storeId) VALUES ('test2', 'DUPE', 'tenant1', NULL);
-- Esperado: el segundo insert falla con duplicate key violation
```

### Riesgos específicos TD-032

| Riesgo | Prob | Mitigación |
|--------|------|-----------|
| Postgres <15 sin `NULLS NOT DISTINCT` | Baja | Usar la alternativa con dos unique indexes parciales |
| Lock durante DROP constraint bloquea writes | Media | Ejecutar en horario bajo, lock <3s |
| Query olvidada sin filtro `storeId` → leak cupones cross-store | Alta | Auditar las 5+ queries de `lib/db/marketplace.db.ts` + route handlers. Grep `Coupon.*prisma` y revisar cada uno. |
| Unique constraint nuevo rechaza insert válido | Media | Test en staging con casos: (a) cupón POS nuevo, (b) cupón marketplace nuevo, (c) mismo code en 2 stores diferentes |

### Checklist

- [ ] Verificar versión Postgres (`SELECT version()`)
- [ ] Snapshot: `SELECT COUNT(*) FROM "Coupon"`
- [ ] Ejecutar PASOS 1–4 (ADD COLUMN + FK + VALIDATE + CREATE INDEX)
- [ ] Ejecutar PASO 5 en horario bajo (DROP OLD UNIQUE + ADD NEW UNIQUE)
- [ ] Correr las 4 validaciones SQL
- [ ] Actualizar `prisma/schema.prisma` con `storeId String?` + `store` relation + nuevo `@@unique`
- [ ] `npx prisma validate && npx prisma format && npx prisma generate`
- [ ] Quitar 5 comentarios TECH-DEBT en los 3 route handlers
- [ ] Re-implementar filtros por `storeId` (marketplace vs POS)
- [ ] Auditar queries restantes de `Coupon` en `lib/db/` y grep global
- [ ] Tests: crear cupón POS, crear cupón marketplace, validar código, expirar
- [ ] Deploy a staging + smoke test
- [ ] Deploy a prod

---

## 10. Rollback global

Si algo falla a mitad de la ola, este es el orden de reversa:

```sql
-- ROLLBACK GLOBAL — TD-030/031/032 (TD-019/020/021 ya en prod, no tocar)

-- TD-032
ALTER TABLE "Coupon" DROP CONSTRAINT IF EXISTS "Coupon_tenant_code_store_unique";
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_tenantId_code_key" UNIQUE ("tenantId", "code");
DROP INDEX CONCURRENTLY IF EXISTS "idx_coupon_storeid";
ALTER TABLE "Coupon" DROP CONSTRAINT IF EXISTS "Coupon_storeId_fkey";
ALTER TABLE "Coupon" DROP COLUMN IF EXISTS "storeId";

-- TD-031
ALTER TABLE "Review" DROP COLUMN IF EXISTS "imageUrls";

-- TD-030
DROP TABLE IF EXISTS "LoyaltyTransaction" CASCADE;
```

**Cero data loss** sobre las estructuras originales. Los datos nuevos que hubieran entrado durante el intervalo sí se pierden (cupones marketplace creados con `storeId` SET, imágenes en reviews, historial de loyalty nuevo) — el Customer.loyaltyPoints se mantiene intacto.

---

## 11. Validación post-migración global

Equivalente a `scripts/verify-pg-indexes-ola1.ts` pero para este lote. Crear `scripts/verify-ola1-schema-gaps.ts`:

```typescript
// scripts/verify-ola1-schema-gaps.ts
// Verifica que TD-030/031/032 estén aplicados correctamente en prod.
// Read-only, seguro correr cuando sea.

const checks = [
  {
    td: 'TD-030',
    name: 'LoyaltyTransaction table exists',
    sql: `SELECT to_regclass('"LoyaltyTransaction"') IS NOT NULL as ok`
  },
  {
    td: 'TD-030',
    name: 'LoyaltyTransaction indexes (3)',
    sql: `SELECT COUNT(*) = 3 as ok FROM pg_indexes WHERE tablename='LoyaltyTransaction' AND indexname LIKE 'idx_loyaltytxn_%'`
  },
  {
    td: 'TD-030',
    name: 'Backfill consistency (no sum mismatch)',
    sql: `SELECT COUNT(*) = 0 as ok FROM (
      SELECT c.phone FROM "Customer" c
      LEFT JOIN "LoyaltyTransaction" lt ON lt."customerPhone" = c.phone
      WHERE c."loyaltyPoints" > 0
      GROUP BY c.phone, c."loyaltyPoints"
      HAVING c."loyaltyPoints" != COALESCE(SUM(lt."amount"), 0)
    ) as mismatched`
  },
  {
    td: 'TD-031',
    name: 'Review.imageUrls column exists',
    sql: `SELECT COUNT(*) = 1 as ok FROM information_schema.columns WHERE table_name='Review' AND column_name='imageUrls' AND udt_name='_text'`
  },
  {
    td: 'TD-031',
    name: 'No NULL imageUrls',
    sql: `SELECT COUNT(*) = 0 as ok FROM "Review" WHERE "imageUrls" IS NULL`
  },
  {
    td: 'TD-032',
    name: 'Coupon.storeId column exists',
    sql: `SELECT COUNT(*) = 1 as ok FROM information_schema.columns WHERE table_name='Coupon' AND column_name='storeId'`
  },
  {
    td: 'TD-032',
    name: 'Coupon_tenant_code_store_unique constraint',
    sql: `SELECT COUNT(*) = 1 as ok FROM pg_constraint WHERE conname='Coupon_tenant_code_store_unique'`
  },
  {
    td: 'TD-032',
    name: 'idx_coupon_storeid exists',
    sql: `SELECT COUNT(*) = 1 as ok FROM pg_indexes WHERE indexname='idx_coupon_storeid'`
  },
  {
    td: 'TD-032',
    name: 'No orphan coupons (storeId → Store)',
    sql: `SELECT COUNT(*) = 0 as ok FROM "Coupon" c LEFT JOIN "Store" s ON s.id=c."storeId" WHERE c."storeId" IS NOT NULL AND s.id IS NULL`
  }
];
// Iterar checks, ejecutar cada SQL vía pooler session mode, reportar.
```

Ejecutar: `npx tsx scripts/verify-ola1-schema-gaps.ts` tras cada paso.

---

## 12. Gotchas Supabase/Prisma

1. **pgBouncer transaction pooling (puerto 6543) no soporta `CREATE INDEX CONCURRENTLY`.** Usar pooler session mode o `DIRECT_URL`. Ver ADR-017 para el patrón.

2. **Prisma 7 `migrate dev` envuelve cada migración en una transacción.** `CONCURRENTLY` falla con `ERROR: CREATE INDEX CONCURRENTLY cannot run inside a transaction block`. **Nunca** aplicar estas migraciones vía Prisma CLI — usar scripts manuales como `scripts/apply-ola1-indices.ts` (existente) o el nuevo `scripts/apply-td030-td031-td032.ts`.

3. **Schema sync post-migración:** después de correr el SQL manual, `prisma/schema.prisma` debe actualizarse a mano y luego `npx prisma generate` (NO `migrate dev`). Futuras migraciones verán el schema actualizado sin intentar re-crear las estructuras.

4. **NULLS NOT DISTINCT es Postgres 15+.** Verificar con `SELECT version()` antes de correr TD-032 PASO 5.

5. **Postgres 11+ soporta `ADD COLUMN NOT NULL DEFAULT <constant>` como O(1).** No requiere rewrite de la tabla. TD-031 se beneficia de esto.

6. **FK `NOT VALID` + `VALIDATE CONSTRAINT`** permite agregar FK sin lock exclusivo prolongado. TD-032 lo usa para la FK a `Store`.

7. **Pooler se desconecta en sesiones largas.** Si el backfill de TD-030 toma >5 minutos, dividirlo en batches explícitos con reconexión entre batches (no una sola sesión gigante).

8. **`Customer.phone` es el `@id` del modelo Customer, no `id`.** El modelo `LoyaltyTransaction` debe referenciar `customerPhone` (no `customerId`). Ver línea 163 de `schema.prisma`.

9. **`TD-018 Float→Decimal` ya está aplicado.** El schema ya usa `Decimal @db.Decimal(12, 2)` en `Customer.totalSpent`, `Coupon.discountValue`, `Coupon.minPurchase`, etc. Los SQL de este plan no tocan esos tipos.

10. **Monitoreo durante la ola:** tener abierto Supabase Dashboard → Database → Query Performance para detectar cualquier query que empiece a hacer Seq Scan después del cambio.

---

## 13. Checklist ejecutivo

### Pre-ejecución (1 vez al inicio)

- [ ] Leer este documento completo + ADR-017 (contexto) + ADR-020 (decisión formal)
- [ ] `SELECT version()` → confirmar Postgres 15+
- [ ] Backup manual en Supabase Dashboard → Database → Backups
- [ ] Snapshot: `SELECT COUNT(*), SUM(loyaltyPoints) FROM "Customer" WHERE loyaltyPoints > 0` (guardar)
- [ ] Snapshot: `SELECT COUNT(*) FROM "Coupon"` (guardar)
- [ ] Snapshot: `SELECT COUNT(*) FROM "Review"` (guardar)
- [ ] Confirmar que la rama de trabajo está creada (`feature/ola1-schema-gaps`)
- [ ] Crear `scripts/apply-td030-td031-td032.ts` siguiendo el patrón de `scripts/apply-ola1-indices.ts`

### TD-031 — Review.imageUrls (orden 1, más simple)

- [ ] Verificar data en `photosJson`
- [ ] `ALTER TABLE "Review" ADD COLUMN "imageUrls" TEXT[] NOT NULL DEFAULT '{}'`
- [ ] (Opcional) Backfill desde `photosJson`
- [ ] Correr validaciones (3 queries)
- [ ] Editar `schema.prisma`
- [ ] `npx prisma validate && format && generate`
- [ ] Quitar 3 TECH-DEBT en `app/api/marketplace/stores/[slug]/reviews/route.ts`
- [ ] Test + commit + deploy staging

### TD-032 — Coupon.storeId (orden 2, riesgo medio)

- [ ] `ALTER TABLE "Coupon" ADD COLUMN "storeId" TEXT NULL`
- [ ] ADD CONSTRAINT FK NOT VALID
- [ ] VALIDATE CONSTRAINT
- [ ] `CREATE INDEX CONCURRENTLY idx_coupon_storeid`
- [ ] (horario bajo) DROP OLD UNIQUE + ADD NEW UNIQUE
- [ ] Correr validaciones (4 queries)
- [ ] Editar `schema.prisma`
- [ ] `npx prisma validate && format && generate`
- [ ] Quitar 5 TECH-DEBT en 3 route handlers
- [ ] Auditar queries restantes con `grep -r "Coupon" lib/db/`
- [ ] Test + commit + deploy staging

### TD-030 — LoyaltyTransaction (orden 3, mayor complejidad)

- [ ] `CREATE TABLE "LoyaltyTransaction"`
- [ ] `CREATE INDEX CONCURRENTLY` x3
- [ ] Crear `scripts/backfill-loyalty-transactions.ts`
- [ ] Ejecutar backfill en staging primero
- [ ] Ejecutar backfill en prod
- [ ] Correr validaciones (4 queries)
- [ ] Editar `schema.prisma`
- [ ] `npx prisma validate && format && generate`
- [ ] Quitar 3 TECH-DEBT en `app/api/marketplace/loyalty/route.ts`
- [ ] Re-implementar GET/POST con inserts a LoyaltyTransaction
- [ ] Test + commit + deploy staging

### Post-ejecución global

- [ ] `npx tsx scripts/verify-ola1-schema-gaps.ts` → todos los checks ✅
- [ ] `npm run lint && npx tsc --noEmit && npm run test`
- [ ] `npm run build`
- [ ] Monitoreo Sentry 2 horas
- [ ] Actualizar `docs/TECH-DEBT.md` → marcar TD-030/031/032 como ✅ Cerrado
- [ ] Actualizar `docs/adr/020-ola1-migration-plan.md` con la sección "Ejecución real"
- [ ] Merge a `master`

---

**Generado:** 2026-04-09 por migration-planner subagente
**Reemplaza:** versión del 2026-04-09 que solo cubría TD-018/030/031/032 (ahora TD-018 está en su propio plan y este unifica la ola real)
**ADR asociado:** `docs/adr/020-ola1-migration-plan.md`
