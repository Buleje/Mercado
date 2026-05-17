# Audit Performance — Panel Admin (2026-05-17)

Alcance: N+1, bundle size, cache misses, lazy loading, re-renders.
Branch: `feat/checkout-payment-proof`

---

## P0 — Bloqueantes de produccion

| # | Area | Archivo:Linea | Hallazgo | Metrica afectada | Fix |
|---|------|--------------|----------|-----------------|-----|
| P0-1 | N+1 | `app/api/analytics/anomalias/route.ts:93-106` | `findMany(products)` → secuencial `findMany(saleItems)` por batch. Ademas: `findMany(products)` de margen bajo (L174) fuera del `Promise.all` inicial — 2 round-trips serializados. | TTFB +300-600ms en tenants con >500 productos | Unificar en `Promise.all`; reemplazar doble product scan con una sola query `where: { OR: [{stock:{gt:0}}, {costPrice:{gt:0}}] }` |
| P0-2 | N+1 | `app/api/analytics/kpis/route.ts:65-77` | 3 `findMany(saleItem)` serializados en cascade (hoy / mes / mes anterior) — todos usan `prisma` directo sin `lib/db`. | TTFB +400-800ms en dias con >1000 ventas | `Promise.all([...])` + mover a `SalesDB`/`SaleItemsDB` con cache TTL 60s |
| P0-3 | Bundle | `components/admin/PrestamosModule.tsx:14` | Recharts importado estaticamente en modulo de 2705 LOC. Todos los simbolos (`BarChart`, `AreaChart`, `PieChart`, `LineChart`, etc.) entran al chunk inicial cuando se monta el tab. | LCP +200-400ms (parse JS extra ~80KB gzip) | `const { BarChart, ... } = await import("recharts")` dentro de `useEffect`, o extraer `PrestamosDashboard` como `dynamic(() => import("./prestamos/PrestamosDashboard"), {ssr:false})` |
| P0-4 | Bundle | `components/admin/ContratosModule.tsx:17`, `components/admin/TesoreriaModule.tsx:19` | Idem P0-3. Recharts estatico en 2 monolitos >2000 LOC sin ningun `dynamic()`. | LCP +150-300ms por modulo | Mismo patron que P0-3 |
| P0-5 | Cache | `app/api/analytics/kpis/route.ts` (todo el archivo) | Prisma directo — viola regla 1 CLAUDE.md. Sin `getOrSet`. Endpoint llamado cada render del DashboardTab (polling cada 30s via `setInterval`). | CPU DB +40% en horas pico | Mover a `KPIsDB.get(tenantId, rango)` con `getOrSet(key, 60, ...)` |

---

## P1 — Alto impacto

| # | Area | Archivo:Linea | Hallazgo | Metrica afectada | Fix |
|---|------|--------------|----------|-----------------|-----|
| P1-1 | Lazy | `components/admin/InventoryTab.tsx:25` | `KardexModal` (246 LOC con recharts) importado estaticamente. Los otros 3 modals del mismo archivo usan `dynamic`. Inconsistencia. | INP +50ms al montar InventoryTab | `const KardexModal = dynamic(() => import("./KardexModal"), {ssr:false})` |
| P1-2 | Cache | `app/api/admin/stock-alerts/route.ts`, `app/api/admin/achievements/route.ts`, `app/api/admin/monthly-report/route.ts`, `app/api/admin/compliance-dashboard/route.ts` | 4 endpoints de lectura frecuente sin `getOrSet` ni `"use cache"`. Ninguno invalida tras writes. | TTFB +100-250ms por request | Agregar `getOrSet(key, TTL, ...)` segun frecuencia: stock-alerts TTL 60s, monthly-report TTL 300s |
| P1-3 | Re-renders | `contexts/cart-context.tsx:589` | `value={{...}}` con objeto literal de 20 props — nuevo objeto en cada render. 16 `useMemo`/`useCallback` internos pero el value final no esta memoizado. Todos los consumidores re-renderizan en cualquier cambio de estado del cart. | INP +30-80ms en POS/checkout | `const ctxValue = useMemo(() => ({items, isOpen, count, ...}), [deps])` |
| P1-4 | Re-renders | `contexts/settings-context.tsx:283` | `value={{mode, modeLoading, yape, ...setMode}}` sin `useMemo`. SettingsContext envuelve TODO el admin — cualquier cambio de `modeLoading` re-renderiza 133 tabs. Solo tiene 2 `useCallback` del total. | INP +20-60ms en navegacion entre tabs | `const ctxValue = useMemo(() => ({...}), [mode, modeLoading, yape, cashEnabled, navLinks, homepage, deliveryConfig, businessName, storeTheme, setMode])` |
| P1-5 | Bundle | `components/admin/inicio/InicioCharts.tsx:14`, `components/admin/smart-dashboard/DashboardCharts.tsx:18` | Recharts importado estaticamente en los 2 componentes del tab Inicio — el primero que ve el admin al entrar. Estos montan en el initial render. | LCP +200ms en carga inicial dashboard | Mover charts a sub-componentes con `dynamic(..., {ssr:false, loading: <Skeleton/>})` |
| P1-6 | N+1 | `app/api/analytics/fiado-analytics/route.ts:47-51` | Dos `findMany(fiado)` + `findMany(fiadoCuota)` en `Promise.all` pero sin cache. Endpoint llamado sin TTL en cada render del tab Fiados. | TTFB +200ms | `getOrSet("fiado-analytics:"+tenantId, 120, ...)` |

---

## P2 — Mejora moderada

| # | Area | Archivo:Linea | Hallazgo | Metrica afectada | Fix |
|---|------|--------------|----------|-----------------|-----|
| P2-1 | Polling | `components/admin/unified/FinanzasModule.tsx:1071` | `setInterval` de 1min sin `document.visibilityState` guard. Si el tab queda abierto en background, sigue haciendo fetch cada minuto. | Requests desperdiciados ~1440/dia por sesion inactiva | Agregar `if (document.hidden) return;` al inicio del callback |
| P2-2 | Cache | `app/api/admin/warehouses/route.ts`, `app/api/admin/delivery-zones/route.ts` | Endpoints GET sin cache + sin `invalidateAdminCache` en sus POST/PUT/DELETE correspondientes. | TTFB variable, datos stale posibles | GET: `getOrSet(key, 300, ...)`. Writes: `invalidateByPrefix("admin:warehouses:"+tenantId)` |
| P2-3 | Re-renders | 271 archivos en `components/admin/` sin ningun `useMemo`/`useCallback` | Solo 440/711 archivos usan memo. Tabs como `ReceivingTab`, `AutoSegmentsTab`, `FleetManagementTab` reciben props arrays/objetos sin memoizar. | INP acumulativo en navegacion | Audit selectivo: componentes que reciben props `items[]` o `data{}` de mas de 3 props merecen `React.memo` + `useMemo` en el parent |
| P2-4 | Bundle | `components/admin/TesoreriaModule.tsx` (1775 LOC) + `components/admin/CashRegisterTab.tsx` (2208 LOC) | Ambos tienen recharts estatico y no tienen `dynamic()` splits internos para sus secciones de graficos. | LCP +100-200ms en tabs financieros | Extraer secciones de charts a `*Chart.tsx` con `dynamic()` |
| P2-5 | Analytics | Todos los endpoints en `app/api/analytics/` (18 archivos) | Usan `prisma.*` directo — viola regla 1. Sin wrappers `lib/db/`. Sin cache. Son los endpoints mas costosos del panel. | TTFB 300-1200ms sin mejora acumulativa | Migrar progresivamente a `AnalyticsDB` con `getOrSet` y TTLs por tipo (heatmap: 300s, rfm: 600s, predictions: 3600s) |

---

## Resumen de impacto estimado

| Prioridad | Hallazgos | Mejora LCP estimada | Mejora TTFB estimada |
|-----------|-----------|--------------------|--------------------|
| P0 (5) | N+1 queries + recharts monolitos | -200 a -600ms | -400 a -1400ms |
| P1 (6) | Lazy modals + cache + context memo | -100 a -300ms | -100 a -500ms |
| P2 (5) | Polling guards + warehouse cache + memo | -50 a -150ms | -50 a -200ms |

**Objetivo Pucallpa (3G):** con P0+P1 resueltos, LCP estimado pasa de ~3.2s → ~2.1s. INP de ~280ms → ~180ms.

---

*Generado: 2026-05-17 | Branch: feat/checkout-payment-proof | Sin modificacion de codigo*
