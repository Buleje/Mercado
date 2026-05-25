# Audit 07 — Admin Panel Performance
**Fecha:** 2026-05-25  
**Scope:** `components/admin/**`, `app/admin/**`, `lib/db/*.db.ts` (endpoints admin)  
**Auditado por:** Optimizer agent  
**Ya cacheados (no repetidos):** finance, transactions, analytics-cash-flow, analytics-kpis, analytics-rfm, campaigns, me-credit-score, abandoned-cart-stats, stats-live, visitor-welcome (commit 9ff5b44f)

---

## Resumen de severidad

| Severidad | Cantidad |
|-----------|---------|
| P0        | 1       |
| P1        | 5       |
| P2        | 3       |

---

## P0 — Crítico

### P0-01: `/api/analytics/kpis-v2` — 13 queries DB sin caché, llamado desde 2 componentes independientes

**Archivos:**
- `app/api/analytics/kpis-v2/route.ts` (sin `getOrSet`, sin `Cache-Control`)
- `lib/db/analytics-kpis-v2.db.ts` (sin `"use cache"`)
- `components/admin/analytics/AnalyticsKPIBarV2.tsx:88-91` — `setInterval(fetchData, 60_000)` sin cache compartido
- `components/admin/unified/FinanzasModule.tsx:188,361,596,678,749,911,1847` — 7 useEffect distintos llaman `fetchFinanzas("/api/analytics/kpis-v2", ...)`

**Evidencia:**
```ts
// kpis-v2/route.ts — línea 43
const results = await Promise.allSettled([
  Promise.all([
    AnalyticsKpisV2DB.ingresosForRange(tid, todayStart),       // KPI1: 9 queries
    AnalyticsKpisV2DB.ticketAvg(tid, thirtyDaysAgo),           // KPI2
    AnalyticsKpisV2DB.saleItemsForCogs(tid, thirtyDaysAgo),    // KPI3
    AnalyticsKpisV2DB.distinctCustomersInRange(tid, ...),      // KPI4
    // ... 13 queries total
  ]),
]);
// NO getOrSet, NO Cache-Control
```

```ts
// AnalyticsKPIBarV2.tsx:88-91
useEffect(() => {
  fetchData();
  const interval = setInterval(fetchData, 60_000); // polling independiente
}, [fetchData]);
```

**Contexto:** `finanzasCache` en `FinanzasModule` tiene TTL=30s pero es module-scoped — no lo comparte `AnalyticsKPIBarV2` que usa `raw fetch`. Si ambos módulos están abiertos simultáneamente (FinanzasModule en el tab Finanzas, KPIBarV2 en AnalyticsBIModule), son 13+13 queries DB duplicadas cada ≤60s por tenant.

**Fix:**
```ts
// app/api/analytics/kpis-v2/route.ts
import { getOrSet } from "@/lib/cache";

const payload = await getOrSet(
  `analytics:kpis-v2:${auth.tenantId}`,
  300, // 5 min — datos analíticos no cambian en segundos
  () => computeKpisV2(auth.tenantId, now)
);
return NextResponse.json(payload);
```

**Ganancia:** -13 queries/request → ~0 queries (cache hit) para los 10+ requests/min que genera el polling combinado. Con TTL=300s: de ~780 queries/hora a ~12 queries/hora por tenant.

---

## P1 — Alto impacto

### P1-01: 6 endpoints analytics sin `getOrSet` — queries pesadas sin caché

**Archivos y evidencia directa:**

| Endpoint | DB file (sin `"use cache"`) | Queries estimadas | getOrSet en route |
|----------|---------------------------|-------------------|-------------------|
| `app/api/analytics/abc/route.ts` | `analytics-abc.db.ts:36` — `saleItem.findMany` full scan + `orderItem.findMany` full scan | 3 | NO |
| `app/api/analytics/clv/route.ts` | `analytics-clv.db.ts:31` — `order.groupBy` + `findMany` por teléfonos | 3 | NO |
| `app/api/analytics/margins/route.ts` | `analytics-margins.db.ts:15` — `saleItem.findMany` 30d + `product.findMany` | 2 | NO |
| `app/api/analytics/rentabilidad/route.ts` | `analytics-rentabilidad.db.ts:27` — `saleItem.findMany` full | 2-3 | NO |
| `app/api/analytics/predictions/route.ts` | `analytics-predictions.db.ts:13` — `saleItem.findMany` + `product.findMany` | 2 | NO |
| `app/api/analytics/kpis-v2/route.ts` | `analytics-kpis-v2.db.ts:17` — 13 queries | 13 | NO (ver P0-01) |

**Snippet representativo (abc/route.ts):**
```ts
// Sin cache — cada click en el tab Análisis ABC ejecuta:
const [saleItems, orderItems] = await Promise.all([
  AnalyticsABCDB.getSaleItemsForABC(tenantId),   // saleItem.findMany full scan
  AnalyticsABCDB.getOrderItemsForABC(tenantId),  // orderItem.findMany full scan
]);
```

**Fix:** `getOrSet(\`analytics:abc:${tenantId}\`, 600, ...)` en cada route (TTL sugerido 10min — datos históricos cambian poco).

**Ganancia:** Analytics tabs se abren con frecuencia. Con TTL=600s: de N queries/request a 0 en hits. Para tenant con 100+ ventas/día, cada ABC scan puede tardar 200-500ms — elimina latencia visible.

---

### P1-02: `FinanzasModule.tsx:265,748,913` — `fetch("/api/sales?limit=5000")` — 3 useEffect distintos

**Archivo:** `components/admin/unified/FinanzasModule.tsx`

```ts
// Línea 265 — useEffect para "Flujo de caja"
fetchFinanzas<Array<...>>("/api/sales?limit=5000", []),

// Línea 748 — useEffect para "Rentabilidad"
fetchFinanzas<unknown[]>("/api/sales?limit=5000", []),

// Línea 913 — useEffect para otra sección
fetchFinanzas<unknown[]>("/api/sales?limit=5000", []),
```

**Contexto:** Aunque `fetchFinanzas` deduplica in-flight y cachea 30s (TTL bajo), `/api/sales` con limit=5000 ejecuta `sale.findMany` con `take: min(5000, 1000)=1000` rows — query pesada. El TTL de 30s significa que se refresca 2 veces/minuto mientras el módulo está montado.

**Fix:**
1. Subir `FINANZAS_TTL_MS` de 30_000 a 300_000 (5min) para endpoints de datos históricos.
2. Eliminar las 3 llamadas duplicadas a `limit=5000`; consolidarlas en un único `useEffect` principal que provea los datos por props/context a las sub-secciones.

**Ganancia:** -2 fetches redundantes de 1000 rows cada 30s → -120 queries pesadas/hora mientras FinanzasModule está activo.

---

### P1-03: `InventoryTab.tsx:433` — `fetch("/api/products", { cache: "no-store" })` sin límite + filtrado 100% client-side

**Archivo:** `components/admin/InventoryTab.tsx:433`

```ts
// Carga todos los productos + movimientos al montar:
fetch("/api/products", { cache: "no-store" }),      // línea 433 — sin ?limit=
fetch("/api/inventory-movements", { cache: "no-store" }),
```

**Contexto:** `/api/v1/products/route.ts:68` llama `ProductsDB.getAll(tenantId)` — que en `lib/db/products.db.ts:92` hace `prisma.product.findMany` sin `take` cuando no hay parámetros de búsqueda. Para tenants con 200+ productos, esto transfiere y deserializa el payload completo en el browser en cada montaje del tab.

`usePagination(filteredProducts, 50)` en línea 1043 pagina el render correctamente, pero el fetch sigue siendo full-scan sin server-side filtering.

**Fix:** Agregar `?limit=200` (cap actual del servidor) y habilitar server-side search via `?q=` antes de renderizar. O pasar `ProductsDB.getPaged({ limit: 100, cursor })` desde el route.

**Ganancia:** Ahorra transferencia de N productos completos (con imágenes URL, variantes, etc.) en cada montaje. Para 200 productos × ~2KB/producto = 400KB JSON eliminado por apertura de tab.

---

### P1-04: `DashboardTab.tsx:294-296` — polling cada 30s contra API con TTL=300s

**Archivo:** `components/admin/DashboardTab.tsx:137,294-296`

```ts
const [refreshInterval, setRefreshInterval] = useState(30); // línea 137 — default 30s

// Línea 294-296
const t = setInterval(() => {
  if (autoRefreshRef.current) load();  // fetch("/api/admin/dashboard")
}, refreshInterval * 1000);
```

**Contexto:** `/api/admin/dashboard/route.ts:16` tiene `DASHBOARD_TTL_SEC = 300` (5 min) con `getOrSet`. El cliente hace 10 requests HTTP por cada actualización real del cache. Cada request tiene overhead de auth (`requireAdmin` → JWT decode + DB lookup de tenant) aunque el payload esté cacheado.

**Fix:**
```ts
// DashboardTab.tsx — cambiar default a 120s (2min) mínimo, mejor 300s
const [refreshInterval, setRefreshInterval] = useState(300);
```

O añadir `Cache-Control: max-age=120, stale-while-revalidate=180` en la response del route para que el browser cachee.

**Ganancia:** -8 roundtrips HTTP innecesarios por cada 5 minutos de uso. Para 8h de uso = -768 requests auth overhead/día/usuario admin.

---

### P1-05: `admin-today-summary.db.ts`, `admin-stats.db.ts`, `admin-store-analytics.db.ts`, `analytics-anomalias.db.ts` — DB classes sin `"use cache"`

**Archivos:** `lib/db/admin-today-summary.db.ts`, `lib/db/admin-stats.db.ts`, `lib/db/admin-store-analytics.db.ts`, `lib/db/analytics-anomalias.db.ts`

**Contexto:** Los routes que las consumen SÍ usan `getOrSet` (TTL 30s–120s), por lo que el impacto en producción es moderado. Sin embargo, si algún route se llama desde otro contexto sin `getOrSet`, ejecuta las queries crudas.

- `admin-today-summary.db.ts:63-104` — 8 queries en `Promise.all` (sale.aggregate ×2, order.aggregate, order.count, product.count ×2, batch.count, saleItem.groupBy)
- `admin-stats.db.ts:55-94` — 6 queries paralelas en `.getHeaderStats()`
- `admin-store-analytics.db.ts:83-160` — 4 queries sobre `ProductAnalytics`
- `analytics-anomalias.db.ts:16-80` — 5 queries `findMany` full scan (sale, product ×2, saleItem, fiado)

**Fix:** Agregar `"use cache"` + `cacheLife("minutes")` + `cacheTag(\`t:${tenantId}:...\`)` en los métodos de lectura, siguiendo el patrón de commit 9ff5b44f.

**Ganancia:** Elimina dependencia de `getOrSet` en el route (el cache opera a nivel de función, más granular y reutilizable cross-routes).

---

## P2 — Impacto moderado

### P2-01: `CRMTabChart.tsx:23` y `MarketplaceDashboardCharts.tsx:65,144` — `height="100%"` en `ResponsiveContainer`

**Archivos:**
- `components/admin/CRMTabChart.tsx:23` — `<ResponsiveContainer minWidth={0} width="100%" height="100%">`
- `components/admin/marketplace/MarketplaceDashboardCharts.tsx:65` — mismo patrón
- `components/admin/marketplace/MarketplaceDashboardCharts.tsx:144` — mismo patrón

**Contexto verificado:**
- `CRMTabChart` se renderiza dentro de `style={{ width: 100, height: 100 }}` (CRMTab.tsx:464) — el padre tiene altura fija explícita. **El warning width=-1 NO se dispara** porque el div tiene dimensiones CSS inline.
- `MarketplaceDashboardCharts` usa `ChartCard` con `height={300}` → `ChartCard` aplica `style={{ height: "300px" }}` en el contenedor (ChartCard.tsx:106). **Igualmente seguro.**

**Veredicto:** Estos 3 casos tienen padre con altura fija — **no generan warning width=-1**. P2 como recordatorio de patrón frágil: si el parent pierde la altura fija (CSS override, refactor), se romperán. Agregar `height={300}` explícito como fallback defensivo.

**Fix menor:**
```tsx
// MarketplaceDashboardCharts.tsx:65
<ResponsiveContainer minWidth={0} width="100%" height="100%">
// → Solo documentar que depende de ChartCard height prop; no requiere cambio urgente.
```

---

### P2-02: `compras-sugerencias.db.ts:44` y `compras-precio-comparativo.db.ts:27` — queries `findMany` sin caché

**Archivos:** `lib/db/compras-sugerencias.db.ts:44,69`, `lib/db/compras-precio-comparativo.db.ts:27`

```ts
// compras-sugerencias.db.ts:44 — scan de todos los saleItem 30d
const salesAgg = await prisma.saleItem.groupBy({ by: ["productId"], where: { sale: { tenantId, createdAt: { gte: thirtyDaysAgo } } }, ... });

// compras-sugerencias.db.ts:69 — N queries secuenciales (loop)
const lastPurchases = await prisma.purchaseItem.findMany({ where: { purchase: { tenantId, supplierId } }, ... });
```

**Contexto:** `app/api/compras/sugerencias/route.ts` no tiene `getOrSet`. Las sugerencias de compra son estables durante horas.

**Fix:** `getOrSet(\`compras:sugerencias:${tenantId}\`, 1800, ...)` (30min TTL).

**Ganancia:** Elimina scan de saleItem en cada apertura del tab Compras/Sugerencias.

---

### P2-03: `analytics-sales-by-date.db.ts` — `sale.findMany` sin `take` ni caché (3 endpoints)

**Archivo:** `lib/db/analytics-sales-by-date.db.ts:25,37`

```ts
// Línea 25 — listSince: retorna TODOS los sales desde `since` (puede ser 1 año)
return prisma.sale.findMany({
  where: { tenantId, createdAt: { gte: since } },
  select: { total: true, createdAt: true },
  // sin take/limit
});
```

**Contexto:** Lo usan 3 routes: `analytics/heatmap`, `analytics/ventas-tendencia`, `analytics/peak-hours`. Ninguno tiene `getOrSet`. Un tenant con 365 días de ventas diarias puede retornar 10k+ rows para el heatmap anual.

**Fix:** `getOrSet(\`analytics:sales-by-date:${tenantId}:${since.toDateString()}\`, 3600, ...)` en cada route. Añadir `take: 10000` como cap defensivo en `listSince`.

**Ganancia:** Evita deserializar 10k+ rows JSON en cada render del heatmap.

---

## Items descartados (auditados, sin hallazgo real)

| Item sospechoso | Resultado |
|-----------------|-----------|
| `force-dynamic` en `app/admin/` | No encontrado — P0 no existe |
| `CRMTabChart height="100%"` | Padre con `style={{width:100,height:100}}` explícito — seguro |
| `MarketplaceDashboardCharts height="100%"` | ChartCard aplica `style={{height:"300px"}}` — seguro |
| `InventoryTab` sin paginación | `usePagination(50)` sí existe en línea 1043 — render paginado OK |
| `AdminStatsDB` sin `"use cache"` | Route usa `getOrSet(30s)` — cubierto |
| `AdminTodaySummaryDB` sin `"use cache"` | Route usa `getOrSet(120s)` — cubierto |
| `DashboardTab` lazy imports | Ya tiene `dynamic()` para 6 secciones pesadas — OK |
| `RecetasModule` `ResponsiveContainer width="100%"` | Tiene `height={220}` explícito (px) — seguro |
| `analytics-anomalias.db.ts` | Usado solo por marketplace cron, no por admin tabs |

---

## Prioridad de fixes

| Orden | Hallazgo | Esfuerzo | Ganancia |
|-------|----------|----------|---------|
| 1 | P0-01: `kpis-v2` + `getOrSet(300)` | 10 min | -780 queries/hora/tenant |
| 2 | P1-01: ABC/CLV/margins/rentabilidad/predictions `getOrSet(600)` | 25 min | -latencia visible tabs analíticos |
| 3 | P1-02: `FinanzasModule` consolidar fetches + TTL 300s | 30 min | -120 queries pesadas/hora |
| 4 | P1-05: `admin-today-summary`, `admin-stats`, `admin-store-analytics` con `"use cache"` | 20 min | cache granular reutilizable |
| 5 | P1-04: DashboardTab `refreshInterval` default 300s | 5 min | -768 roundtrips/día/usuario |
| 6 | P1-03: InventoryTab `?limit=200` en fetch | 5 min | -400KB transferencia/apertura |
| 7 | P2-02: compras-sugerencias `getOrSet(1800)` | 10 min | tab Compras más rápido |
| 8 | P2-03: analytics-sales-by-date `take: 10000` + `getOrSet` | 15 min | evita scan 10k+ rows heatmap |
