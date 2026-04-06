-- ==========================================================================
-- EXPLAIN ANALYZE — Queries críticas para ejecutar en Supabase SQL Editor
-- ==========================================================================
--
-- Fecha: 2026-04-06
-- Uso: Copiar cada bloque y ejecutarlo en Supabase Dashboard → SQL Editor.
--      Revisar el plan devuelto. Buscar:
--        - Seq Scan sobre tablas grandes (debería ser Index Scan)
--        - Rows Removed by Filter > 1000 (índice incompleto)
--        - Tiempo > 100ms (optimización requerida)
--        - Nested Loop con miles de iteraciones (JOIN sin índice)
--
-- Reemplazar ':tenant_id' con un tenant real (ej. 'main') al ejecutar.
-- Reemplazar ':product_id', ':order_id', etc. con IDs reales.
--
-- ==========================================================================

-- ──────────────────────────────────────────────────────────────────────────
-- QUERY 1: Listado de pedidos pendientes del día (alta frecuencia)
-- Llamado desde: app/admin/page.tsx OrdersTab, /api/orders?status=pendiente
-- Tabla: Order
-- Volumen esperado: 10-100 rows, alto QPS en horario comercial
-- ──────────────────────────────────────────────────────────────────────────
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT *
FROM "Order"
WHERE "tenantId" = 'main'
  AND status = 'pendiente'
  AND "createdAt" >= NOW() - INTERVAL '1 day'
ORDER BY "createdAt" DESC
LIMIT 20;

-- EXPECTATION: Index Scan on Order_tenantId_status_createdAt_idx (compuesto)
-- Si hace Seq Scan → agregar: @@index([tenantId, status, createdAt])


-- ──────────────────────────────────────────────────────────────────────────
-- QUERY 2: Listado de productos activos del catálogo por categoría
-- Llamado desde: /api/products, storefront marketplace
-- Tabla: Product
-- Volumen esperado: 50-500 rows por página
-- ──────────────────────────────────────────────────────────────────────────
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT id, name, price, image, stock, category
FROM "Product"
WHERE "tenantId" = 'main'
  AND active = true
  AND "deletedAt" IS NULL
  AND category = 'abarrotes'
ORDER BY name ASC
LIMIT 24;

-- EXPECTATION: Index Scan on Product_tenantId_active_idx + filter por category
-- Mejor: agregar @@index([tenantId, category, active]) compuesto


-- ──────────────────────────────────────────────────────────────────────────
-- QUERY 3: FEFO batch selection (crítico para ventas)
-- Llamado desde: lib/db/inventory.db.ts decrementFEFO
-- Tabla: Batch
-- Volumen esperado: 1-20 batches por producto
-- ──────────────────────────────────────────────────────────────────────────
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT id, quantity, "expiryDate"
FROM "Batch"
WHERE "productId" = 1
  AND quantity > 0
ORDER BY "expiryDate" ASC;

-- EXPECTATION: Index Scan por productId + quantity + expiryDate
-- Agregar: @@index([productId, quantity, expiryDate]) si no existe


-- ──────────────────────────────────────────────────────────────────────────
-- QUERY 4: Kardex histórico de un producto (lento si sin índice)
-- Llamado desde: admin inventario kardex
-- Tabla: InventoryMovement
-- Volumen: crece indefinidamente (append-only)
-- ──────────────────────────────────────────────────────────────────────────
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT *
FROM "InventoryMovement"
WHERE "productId" = 1
ORDER BY "createdAt" DESC
LIMIT 50;

-- EXPECTATION: Index Scan por productId + createdAt DESC
-- Si es Seq Scan en tabla > 100k rows → agregar @@index([productId, createdAt])


-- ──────────────────────────────────────────────────────────────────────────
-- QUERY 5: Búsqueda de cliente por teléfono (checkout)
-- Llamado desde: CheckoutModal usePhoneSearch, /api/customers/search
-- Tabla: Customer (phone es PK pero puede haber múltiples tenants)
-- ──────────────────────────────────────────────────────────────────────────
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT *
FROM "Customer"
WHERE phone = '999999999';

-- EXPECTATION: Index Scan (phone es PK) — debería ser < 1ms
-- Si lento, problema de locks/bloat → VACUUM ANALYZE "Customer"


-- ──────────────────────────────────────────────────────────────────────────
-- QUERY 6: Cupón válido a aplicar (checkout path)
-- Llamado desde: /api/coupons/validate
-- Tabla: Coupon
-- ──────────────────────────────────────────────────────────────────────────
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT *
FROM "Coupon"
WHERE "tenantId" = 'main'
  AND code = 'BIENVENIDO10'
  AND active = true
  AND ("validUntil" IS NULL OR "validUntil" > NOW())
LIMIT 1;

-- EXPECTATION: Index Scan on Coupon_tenantId_code_idx
-- Agregar: @@unique([tenantId, code]) si no existe (además de índice)


-- ──────────────────────────────────────────────────────────────────────────
-- QUERY 7: Marcar préstamos vencidos (post-fix N+1)
-- Llamado desde: cron diario prestamos.db.ts marcarVencidos
-- Tablas: Cuota + Prestamo
-- ──────────────────────────────────────────────────────────────────────────
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT DISTINCT c."prestamoId"
FROM "Cuota" c
JOIN "Prestamo" p ON p.id = c."prestamoId"
WHERE c."pagadoEn" IS NULL
  AND c."fechaVence" < NOW()
  AND p."tenantId" = 'main'
  AND p.status = 'ACTIVO';

-- EXPECTATION: Nested Loop con index scans en ambas tablas
-- Índices necesarios:
--   Cuota: @@index([prestamoId, pagadoEn, fechaVence])
--   Prestamo: @@index([tenantId, status])


-- ──────────────────────────────────────────────────────────────────────────
-- QUERY 8: Sync marketplace StoreProduct (post-fix N+1)
-- Llamado desde: lib/db/marketplace.db.ts ensureSync
-- Tabla: StoreProduct
-- ──────────────────────────────────────────────────────────────────────────
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT id, "productId", "isActive"
FROM "StoreProduct"
WHERE "storeId" = 'store-uuid-aqui';

-- EXPECTATION: Index Scan on StoreProduct_storeId_idx
-- Si hay muchos stores con muchos productos, considerar:
--   @@index([storeId, isActive, productId])


-- ──────────────────────────────────────────────────────────────────────────
-- QUERY 9: Dashboard ejecutivo — total de ventas del día
-- Llamado desde: Dashboard principal, Asistente IA
-- Tabla: Order
-- ──────────────────────────────────────────────────────────────────────────
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT
  COUNT(*) as total_orders,
  SUM(total) as revenue,
  AVG(total) as avg_ticket
FROM "Order"
WHERE "tenantId" = 'main'
  AND status IN ('confirmado', 'entregado')
  AND "createdAt" >= CURRENT_DATE
  AND "createdAt" < CURRENT_DATE + INTERVAL '1 day';

-- EXPECTATION: Index-only Scan si los índices incluyen las columnas agregadas
-- Si lento, índice compuesto: @@index([tenantId, status, createdAt])


-- ──────────────────────────────────────────────────────────────────────────
-- QUERY 10: Búsqueda full-text de productos (storefront)
-- Llamado desde: /api/products/search, barra de búsqueda
-- Tabla: Product
-- ──────────────────────────────────────────────────────────────────────────
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT id, name, price, image
FROM "Product"
WHERE "tenantId" = 'main'
  AND active = true
  AND "deletedAt" IS NULL
  AND (
    name ILIKE '%arroz%'
    OR barcode = 'arroz'
  )
ORDER BY name
LIMIT 20;

-- EXPECTATION: Puede ser Seq Scan si no hay índice de texto
-- Mejora: agregar índice GIN para búsqueda full-text:
--   CREATE INDEX IF NOT EXISTS product_name_trgm_idx
--     ON "Product" USING gin (name gin_trgm_ops);
--   (requiere extensión pg_trgm: CREATE EXTENSION IF NOT EXISTS pg_trgm;)


-- ==========================================================================
-- QUERIES DE DIAGNÓSTICO GENERAL
-- ==========================================================================

-- Top 20 queries más lentas (requiere pg_stat_statements)
SELECT
  substring(query, 1, 100) AS query_short,
  calls,
  total_exec_time::int AS total_ms,
  mean_exec_time::numeric(10, 2) AS mean_ms,
  rows
FROM pg_stat_statements
WHERE query NOT LIKE '%pg_stat_statements%'
  AND query NOT LIKE '%EXPLAIN%'
ORDER BY mean_exec_time DESC
LIMIT 20;

-- Tablas más grandes (para priorizar índices)
SELECT
  schemaname,
  relname AS table_name,
  pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
  n_live_tup AS approximate_row_count
FROM pg_stat_user_tables
ORDER BY pg_total_relation_size(relid) DESC
LIMIT 20;

-- Índices no usados (candidatos a eliminar, cuidado)
SELECT
  s.schemaname,
  s.relname AS table_name,
  s.indexrelname AS index_name,
  pg_size_pretty(pg_relation_size(s.indexrelid)) AS index_size,
  s.idx_scan AS times_used
FROM pg_stat_user_indexes s
WHERE s.idx_scan = 0
  AND s.indexrelname NOT LIKE '%_pkey'
ORDER BY pg_relation_size(s.indexrelid) DESC
LIMIT 20;

-- Detectar Seq Scans sobre tablas grandes (problema de índices)
SELECT
  schemaname,
  relname AS table_name,
  seq_scan,
  seq_tup_read,
  idx_scan,
  n_live_tup AS row_count,
  CASE
    WHEN idx_scan + seq_scan = 0 THEN 0
    ELSE round(100.0 * seq_scan / (idx_scan + seq_scan), 2)
  END AS seq_scan_pct
FROM pg_stat_user_tables
WHERE n_live_tup > 1000
ORDER BY seq_scan DESC
LIMIT 20;


-- ==========================================================================
-- SIGUIENTES PASOS DESPUÉS DE EJECUTAR
-- ==========================================================================
--
-- 1. Copiar los planes devueltos por cada EXPLAIN ANALYZE
-- 2. Identificar los que tengan:
--    - Seq Scan sobre tablas > 10k rows
--    - Rows Removed by Filter > 100
--    - Tiempo total > 100ms
--    - Nested Loops con miles de iteraciones
-- 3. Por cada query problemática, agregar el índice compuesto correspondiente
--    en prisma/schema.prisma:
--       @@index([field1, field2, field3])
-- 4. Generar migración: `npx prisma migrate dev --name add-perf-indexes`
-- 5. Re-ejecutar EXPLAIN ANALYZE para confirmar mejora
-- 6. Commit: `feat(db): add composite indexes for hot queries`
--
-- ==========================================================================
