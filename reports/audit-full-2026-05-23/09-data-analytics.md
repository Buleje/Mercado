# Auditoria DATA / KPIs / Analytics — Buleje
**Fecha:** 2026-05-23 | **Auditor:** Data Analyst Agent

---

## 1. Dashboard admin /admin?tab=resumen — Metricas implementadas

Componente principal: `components/admin/DashboardTab.tsx` (3,057 lineas) con 7 secciones via tabs internos.

| Seccion | Componente lazy | Estado |
|---------|----------------|--------|
| Resumen | `DashboardOverviewCharts` + `ResumenSubTab` | Implementado |
| Ventas | `DashboardVentasSection` | Implementado |
| Productos | `DashboardProductosSection` | Implementado |
| Inventario | `DashboardInventarioSection` | Implementado |
| Clientes | `DashboardClientesSection` | Implementado |
| Compras/Caja | `DashboardComprasCajaSection` | Implementado |

`ResumenSubTab.tsx` (758 lineas) recibe ~40 props tipadas — KPIs calculados en el componente padre (`DashboardTab`). La fuente de datos es `tenantFetch("/api/admin/overview")` con `OverviewDB.fetchOverview()` (9 queries paralelas via `Promise.all`).

**KPIs confirmados en Resumen:**
- `revenueToday`, `revenueThisMonth`, `revenuePrevMonth`, `revenueYesterday`, `revenueFiltered`
- `monthDelta` (% vs mes anterior)
- `marginToday`, `rentabilidadHoy`
- `clientesHoy`, `clientesAyer`, `clientesPromedio`, `hoyVsAyerPct`
- `topProducts`, `topCustomers`, `hourBuckets`
- `monthProjection` (proyeccion de cierre de mes)
- `cuentasPorCobrar`, `cuentasPorPagar` (fiado)
- `productsRunningOut` (dias de stock restantes)
- `expiringBatchCount` (lotes por vencer — FEFO)
- `bestDay`, `growingCategory`, `topClientMonth`
- `abandonedCartCount`, `abandonedCartValue`
- `comboData` (sugerencia de combos rentables)
- `insights[]` (texto generado con tendencias)
- `semanaAnterior`, `hitoProximo`, `bestHourToday`
- `productosSinVenderHoy`, `decliningProduct`

**Filtros de periodo soportados:** `hoy | semana | mes | año | custom (date range)`

---

## 2. Recharts — Inventario de charts (43 confirmados por memory)

### Distribucion por categoria (confirmada memory: Clientes 12 + Inventario 13 + Caja 12 + Resumen 6 = 43)

| Categoria | Charts | Tipos Recharts usados |
|-----------|--------|----------------------|
| Resumen | 6 | AreaChart (ventas diarias), BarChart (hora pico), PieChart (categorias), LineChart (tendencia), BarChart (top productos), DonutChart (metodos pago) |
| Ventas | ~8 | AreaChart (revenue), BarChart (comparativo periodos), LineChart (ticket promedio), BarChart (dia semana) |
| Inventario | 13 | BarChart (stock vs minimo), AreaChart (rotacion), PieChart (categorias stock), BarChart (merma), LineChart (FEFO vencimientos), etc. |
| Clientes | 12 | LineChart (nuevos vs recurrentes), BarChart (frecuencia compra), PieChart (zonas entrega), AreaChart (LTV), etc. |
| Caja | 12 | BarChart (cierres diarios), AreaChart (flujo caja), PieChart (metodos pago), LineChart (gastos), etc. |
| Marketplace | 4 | AreaChart (GMV 30d), BarChart (crecimiento tiendas), PieChart (categorias), BarChart (top 5 tiendas) |

**Componentes con Recharts:** `MarketplaceDashboard.tsx`, `DashboardOverviewCharts.tsx`, `MarketplaceDashboardCharts.tsx`, `BreakEvenDashboard.tsx`, `TesoreriaChart.tsx`, `TurnosChart.tsx`, `EmployeePerformanceChart.tsx`, `CotizacionesChart.tsx`, `CustomerRetentionChart.tsx`, `FiadoTendenciaCobroChart.tsx`, y 20+ mas.

**Estado de descripciones bodeguero:** 43 charts tienen textos explicativos en lenguaje simple (memory 2026-05-15 v2). Hora pico oculta si `peakHour===0`.

---

## 3. PostHog — Eventos trackeados

| Ubicacion | Estado |
|-----------|--------|
| `components/providers/PostHogProvider.tsx` | Implementado — lazy load via `requestIdleCallback` (no compite con LCP/TTI) |
| `lib/analytics/posthog.ts` | Server-side client — `trackEvent`, `identifyUser`, `trackPageView` |
| `lib/analytics/assistant-events.ts` | Stub con TODO: "reemplazar por PostHog / Segment" |
| Feature flags | `lib/flags/index.ts` usa PostHog para A/B testing |

**Eventos definidos en `lib/analytics.ts`:**

| Grupo | Eventos |
|-------|---------|
| E-commerce | `view_item`, `add_to_cart`, `remove_from_cart`, `begin_checkout`, `purchase`, `view_item_list`, `select_item` |
| Navegacion | `view_home`, `view_shop`, `view_category`, `search` |
| Engagement | `click_cta`, `click_whatsapp`, `share`, `newsletter_signup`, `exit_intent_shown/action` |
| Usuario | `login`, `signup`, `profile_update` |
| Funnel registro | `registration_start`, `registration_step_1/2/3_complete`, `registration_complete/error/step_back` |
| Error | `error_occurred` |

**GAP critico:** `assistant-events.ts` usa `console.log` como placeholder — eventos del asistente IA NO llegan a PostHog todavia. El funnel de checkout en PostHog esta pendiente (TODO en `/superadmin/slo/page.tsx`).

---

## 4. Vercel Analytics + Speed Insights

| Herramienta | Archivo | Estado |
|-------------|---------|--------|
| `@vercel/analytics` | `app/layout.tsx` — `<Analytics />` | Activo en produccion |
| `@vercel/speed-insights` | `app/layout.tsx` — `<SpeedInsights />` | Activo en produccion |
| OpenTelemetry | `@vercel/otel` en package.json | Configurado (instrumentacion) |
| PostHog | `PostHogProvider` en layout | Activo pero eventos limitados |
| Sentry | Config en `sentry.*.config.ts` | Activo |

**Notas:** Vercel Analytics trackea page views automaticamente. Speed Insights mide Core Web Vitals. No hay `NEXT_PUBLIC_POSTHOG_KEY` verificado como activo en `.env.example` — podria estar como no-op en dev.

---

## 5. KPIs SaaS (Superadmin) — MRR / ARR / Churn / LTV / CAC

**Archivo principal:** `app/superadmin/analytics/page.tsx` con `AnalyticsData` interface.

| KPI | Estado | Fuente |
|-----|--------|--------|
| MRR | Calculado | `overview.mrr` — via `/api/superadmin/analytics` |
| ARR | Calculado | `overview.arr` = MRR × 12 |
| ARPU | Calculado | `overview.arpu` — `ARPUMiniChart` en superadmin |
| Tenants activos/pagos | Calculado | `activeTenants`, `payingTenants` |
| Crecimiento tenants | Calculado | `tenantGrowthPct` (este mes vs anterior) |
| Comisiones marketplace | Calculado | `commissionGenerated` en `MarketplaceDashboard` |
| Plan distribution | Calculado | `planDistribution: Record<string, number>` |
| At-risk tenants | Calculado | `atRiskCount` |
| Monthly signups | Calculado | `monthlySignups[]` — grafico temporal |
| Monthly revenue | Calculado | `monthlyRevenue[]` — grafico temporal |

**GAPS:**
- **Churn rate** — no hay campo calculado explicitamente. Solo `atRiskCount` como proxy.
- **LTV por tenant** — no existe calculo. Solo `totalSpent` por customer individual.
- **CAC** — no implementado (requeriria datos de ad spend externos).
- **NPS / CSAT** — no existe en superadmin analytics.

---

## 6. KPIs operativos por tenant

| KPI | Implementado | Fuente |
|-----|-------------|--------|
| Ventas dia/semana/mes | Si | `OverviewDB.fetchOverview` + filtro periodo en `DashboardTab` |
| Ticket promedio | Si | `CierreDiarioDB.getPreview().ventas.ticketPromedio` |
| Hora pico | Si | `computeBestHour()` en `cierre-diario.db.ts` |
| Producto top del dia | Si | `CierreDiarioDB.getPreview().ventas.productoTop` |
| Cuentas por cobrar (fiado) | Si | `cuentasPorCobrar` en `ResumenSubTab` |
| Cuentas por pagar | Si | `cuentasPorPagar` en `ResumenSubTab` |
| Proyeccion mes | Si | `monthProjection` — calculo proporcional a dias transcurridos |
| Stock critico | Si | `criticalStockCount` via `OverviewDB` |
| Lotes por vencer (FEFO) | Si | `expiringCount` via `OverviewDB` + `ExpiringBatchesAlert` |
| Clientes nuevos vs recurrentes | Si | `newCustomersInRange` + historial |
| Carritos abandonados | Si | `abandonedCartCount` / `abandonedCartValue` en Resumen |
| Dia de semana con mas ventas | Si | `bestDay` calculado client-side |
| Categoria en tendencia | Si | `growingCategory` comparando semanas |
| Delta vs periodo anterior | Si | `monthDelta` con flecha up/down |
| Margen bruto hoy | Si | `marginToday`, `rentabilidadHoy` |
| Gasto por proveedor | Parcial | `payables` existe pero sin breakdown de margen por proveedor |
| LTV cliente | Parcial | `totalSpent` en customer pero no LTV proyectado |
| Tasa retencion | Parcial | `CustomerRetentionChart` existe pero no un KPI numerico unico |
| Merma (vencidos/danados) | Parcial | `expiringBatchCount` pero sin costo de merma en S/ |

---

## 7. KPIs Marketplace

| KPI | Estado | Fuente |
|-----|--------|--------|
| GMV cross-store (30d) | Implementado | `MarketplaceDashboard.gmv` + `gmvDaily[]` |
| Pedidos totales marketplace | Implementado | `totalOrders` en `MarketplaceDashboardData` |
| Tiendas activas | Implementado | `activeStores` |
| Comision generada | Implementado | `commissionGenerated` |
| Top 5 tiendas por GMV | Implementado | `topStores[]` en `MicroList` |
| Crecimiento tiendas mes a mes | Implementado | `storeGrowth[]` — BarChart |
| Tasa de conversion | Implementado | `conversionRate` — `MicroGauge` |
| Distribucion por categoria | Implementado | `categoryData[]` — `MicroDonut` |
| Canal de pedido | Implementado | `channelData[]` (web/mobile/whatsapp) |

**GAP critico:** `MarketplaceDashboard` usa **datos mock deterministas** mientras `/api/marketplace/dashboard` este disponible. Segun el comentario en el codigo: "Datos: consume mocks deterministas en build inicial, luego `/api/marketplace/dashboard` cuando este disponible." El endpoint `/api/marketplace/dashboard` existe pero la integracion real no esta confirmada.

---

## 8. Reportes exportables

| Tipo | Formato | Implementacion | Estado |
|------|---------|---------------|--------|
| Export completo (FullExporter) | CSV | `components/admin/FullExporter.tsx` | Implementado — fetcha APIs y genera CSV |
| Modulos: Productos, Clientes, Ventas, Inventario, Gastos | CSV | `FullExporter.tsx` | Implementado |
| Dashboard PDF | PDF | `DashboardTab.tsx` — `jspdf` dinamico | Implementado |
| Resumen semanal | PDF | `WeeklyReportCard.tsx` — `jsPDF` | Implementado |
| Catalogo de productos | PDF | `CatalogPDFGenerator.tsx` — `jsPDF` | Implementado |
| Campanas (marketing) | PDF | `CampañasTab.tsx` — `jsPDF` | Implementado |
| Notas de credito | PDF | `NotasCreditoModule.tsx` — `jsPDF` | Implementado |
| OC (ordenes compra) | PDF | `pos/OCPrintPreviewModal.tsx` — `jsPDF` | Implementado |
| Reporte custom | PDF + landscape | `analytics/CustomReportBuilder.tsx` — `jsPDF` | Implementado |
| Excel multisheet | XLSX | `exceljs ^4.4.0` en package.json | Libreria disponible, uso no confirmado masivamente |
| Reportes automaticos programados | PDF/Excel/CSV | `AutoReportsTab.tsx` | UI implementada, **backend sin conectar** (`SEED = []`) |

**GAP critico:** `AutoReportsTab` tiene la UI de configuracion completa (schedule diario/semanal/mensual, destinatarios, formato) pero `SEED = []` y no hay endpoint que persista ni ejecute los reportes. Es shell sin backend.

---

## 9. Forecasting — Prediccion de demanda

| Componente | Estado | Detalle |
|------------|--------|---------|
| `lib/forecasting/demand-predictor.ts` | Implementado | Media movil ponderada: ultimos 7d (3x), 8-30d (2x), 31-90d (1x). Detecta tendencia `up/stable/down` y patron semanal |
| `lib/forecasting.ts` | Implementado | `calculateForecast()` — proyeccion 7 dias con `dailyBreakdown[]`, confidence `alta/media/baja`, `bestDay/worstDay` |
| `lib/db/forecasting.db.ts` | Implementado | DB class para predicciones |
| `lib/db/analytics-predictions.db.ts` | Implementado | Agregados de ventas por rango para alimentar modelos |
| `lib/db/stockout-predictions.db.ts` | Implementado | Prediccion de stockout por velocidad de ventas |
| `lib/growth/weather-predictor.ts` | Implementado | Correlacion clima-ventas (Pucallpa tropical) |
| `app/api/demand-prediction/route.ts` | Implementado | Endpoint expuesto |
| `app/api/forecasting/auto-reorder/route.ts` | Implementado | Auto-reorden basado en prediccion |
| `app/api/forecasting/reorder-suggestions/route.ts` | Implementado | Sugerencias de compra al proveedor |

**Algoritmo:** puramente matematico (sin API externa de ML). Suficiente para bodega familiar. Confianza baja si <14 dias con datos.

---

## 10. Alertas automaticas

| Alerta | Trigger | Canal | Estado |
|--------|---------|-------|--------|
| Stock minimo | `/api/stock-alerts` (cron 8am) | Push web + Email | Implementado |
| Prediccion stockout 7d | `/api/stock-alerts` (velocity-based) | Push web + Email | Implementado |
| Reabastecimiento | `/api/reorder-alerts` (cron 6am) + `/api/cron/reorder-reminders` | Push + WA | Implementado |
| Lotes por vencer (FEFO) | `ExpiryAlertsDashboard`, `ExpiringBatchesAlert` | Banner dashboard | Implementado |
| Resumen diario | `/api/daily-digest` (cron 9pm) | Email + WhatsApp al dueno | Implementado |
| Cierre de caja | `/api/cierre-diario` | Dashboard + PDF | Implementado |
| Fiado vencido | `cuentasPorCobrar.vencidas` en dashboard | Banner visual | Implementado |
| Cuentas por pagar vencidas | `upcomingPayables.overdue` | Banner visual | Implementado |
| Carritos abandonados | `abandonedCartCount` en Resumen | KPI visual (sin email trigger) | Parcial |

**GAP:** Carritos abandonados se muestran como KPI pero no hay cron de recuperacion (email/WA al cliente a las X horas).

---

## Tabla de KPIs: Implementados vs Faltantes (Top 20 criticos para bodega)

| # | KPI | Implementado | Prioridad |
|---|-----|-------------|-----------|
| 1 | Ventas del dia/semana/mes (S/) | Si | — |
| 2 | Ticket promedio por pedido | Si | — |
| 3 | Productos mas vendidos (top 10) | Si | — |
| 4 | Hora pico de ventas | Si | — |
| 5 | Stock critico (bajo minimo) | Si | — |
| 6 | Lotes por vencer FEFO | Si | — |
| 7 | Fiado pendiente de cobro | Si | — |
| 8 | Proyeccion de cierre de mes | Si | — |
| 9 | Delta vs periodo anterior (%) | Si | — |
| 10 | Margen bruto del dia | Si | — |
| 11 | Clientes nuevos vs recurrentes | Si | — |
| 12 | Prediccion stockout 7 dias | Si | — |
| 13 | GMV marketplace cross-store | Si (mock) | — |
| 14 | Comision por vendor | Si (mock) | — |
| 15 | Costo de merma en S/ | **NO** | Alta |
| 16 | Rotacion de inventario (dias) | **NO** | Alta |
| 17 | Churn rate tenants (SaaS) | **NO** | Alta |
| 18 | LTV proyectado por cliente | **NO** | Media |
| 19 | Tasa retencion numerica (%) | **NO** | Media |
| 20 | CAC (costo adquisicion cliente) | **NO** | Media |

---

## Top 10 charts/metricas para convertir los 4 free trial → pago

Los 4 clientes estan en trial hasta 2026-06-12. Estas son las metricas con mayor impacto en la decision de pago:

| # | Metrica / Chart | Por que convierte | Esfuerzo |
|---|----------------|-------------------|----------|
| 1 | **Proyeccion de mes completo** (linea + meta) | El dueno ve en tiempo real si va a cumplir su meta mensual. Urgencia inmediata. | Ya existe (`monthProjection`) — mejorar visual |
| 2 | **Resumen diario WhatsApp** (9pm) | Llega al celular del dueno sin que abra el panel. Percepcion de valor diario. | Ya existe (`/api/daily-digest`) — verificar entrega real |
| 3 | **Alerta de stockout 7 dias** (prediccion) | Evita quiebre de stock. Prueba tangible de ROI: "el sistema te aviso antes de quedarte sin arroz". | Ya existe — asegurar visibilidad en dashboard |
| 4 | **Margen bruto por categoria** (dona/barra) | Revela que categorias son rentables vs las que cree rentables. Sorpresa = engagement. | Parcialmente existe — necesita breakdown por categoria |
| 5 | **Hora pico + heat map diario** | Permite decidir cuando poner mas personal o hacer promociones. Dato accionable. | Existe (`bestHourToday`, `hourBuckets`) — mejorar chart |
| 6 | **Fiado pendiente con semaforo** (rojo/amarillo/verde) | En Pucallpa el fiado es 20-40% del volumen. Ver cuanto le deben = conversion segura. | Existe (`cuentasPorCobrar`) — mejorar UI/UX visual |
| 7 | **Top 5 productos + velocidad de venta** | Comparar con intuicion del dueno genera confianza en los datos. | Existe (`topProducts`) — agregar columna "unidades/dia" |
| 8 | **Delta semana vs semana anterior** (% con flecha) | Simplicidad: "esta semana vendiste 12% mas que la semana pasada". Sin ambiguedad. | Existe (`semanaAnterior`) — ya en Resumen |
| 9 | **Costo de merma en S/ (lotes vencidos)** | "El sistema te ahorro S/120 en merma este mes". ROI directamente en plata perdida. | **NO existe** — requiere suma de `costPrice × quantity` de batches vencidos |
| 10 | **Comparador de periodos** (este mes vs mismo mes anio anterior) | Para negocios de mas de 1 ano: "vendiste 23% mas que mayo 2025". | Existe `PeriodComparatorTab` — verificar si esta activo en trial |

---

## Gaps criticos a resolver (priorizados)

| Gap | Impacto | Esfuerzo estimado |
|-----|---------|-------------------|
| `AutoReportsTab` sin backend — reportes programados no se guardan ni ejecutan | Alto (promesa de la UI) | 2-3 dias: endpoint CRUD + BullMQ job |
| `MarketplaceDashboard` con datos mock — no refleja realidad | Alto para marketplace | 1 dia: conectar `/api/marketplace/dashboard` |
| Costo de merma en S/ — no calculado | Alto para conversion | 4h: `SUM(batch.costPrice × quantity)` donde `status=vencido` |
| Churn rate SaaS — no existe | Alto para superadmin | 4h: tenants con plan paid + `cancelledAt` en ultimo mes |
| Rotacion de inventario (dias) — no calculado | Medio | 4h: `(stock_promedio / costo_ventas) × 30` |
| Funnel checkout PostHog — TODO pendiente | Medio | 2h: activar insight en PostHog + conectar en `/superadmin/slo` |
| Recuperacion carritos abandonados (email/WA) — solo KPI sin accion | Medio | 1 dia: cron + template WA |
| LTV proyectado por cliente — solo `totalSpent` historico | Bajo | 4h: `totalSpent / meses_activo × life_expectancy` |
