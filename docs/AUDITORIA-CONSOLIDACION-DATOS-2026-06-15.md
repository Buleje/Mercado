# Auditoría de duplicación de datos — Panel Admin (2026-06-15)

> **Estado:** auditoría ✓ completa · **consolidación pendiente** (manifiesto ejecutable abajo).
> Método: grep determinístico (evidencia dura) + verificación puntual. Los agentes paralelos se
> cortaron por límite de sesión; el análisis se hizo a mano.

## 1. Diagnóstico

**407 de 766** componentes admin fetchean datos cada uno por su cuenta. El mismo dato crudo se pide
en decenas de componentes y se re-agrega con lógica propia → **KPIs que no coinciden entre tabs**
("datos desiguales").

### Endpoints crudos más re-consumidos
| Endpoint | # componentes |
|---|---|
| `/api/products` | 87 (+23 `/:id`) |
| `/api/sales` | 70 |
| `/api/customers` | 57 |
| `/api/orders` | 25 |
| `/api/purchases`+`/payables`+`/expenses`+`/suppliers` | ~75 |
| `/api/fiados` | 19 |

### Causa raíz: dos mundos paralelos
- **`components/admin/inicio/**`** → usa `cachedJson` (`lib/client-cache-fetch`) + `contexts/dashboard-data-context.tsx`. **Consolidado.**
- **Tabs standalone** (Finanzas, Tesorería, Reportes, Liquidez, Compras…) → re-fetchean crudo y re-agregan. **Cada uno por su cuenta.**
- La infra de fuente única YA existe (`/api/admin/dashboard/aggregates`, `/api/analytics/kpis-v2`, el context) pero los módulos standalone la ignoran.

## 2. Duplicación concreta (verificada por grep)

### 🔴 P0 — "Por pagar" (payables): **28 componentes lo suman por su cuenta**
```
AlertsCenterTab, AutoAlertEngineTab, CashFlowProjection, CheckManagementTab, DashboardIATab,
DashboardTab, ExecutiveDashboardTab, LiquidityForecastTab, ObligacionesTab, PayablesTab,
PaymentCalendar, PaymentCalendarView, PurchaseOrdersTab, ReportsTab, SmartDashboardTab,
SuppliersTab, TaxTab, TreasuryDashboard, compras/CxPCalendar, finanzas/charts,
inicio/CajaAdvancedCharts, inicio/ComprasAdvancedCharts, inicio/ComprasDashboard,
inicio/InicioDashboard, inicio/InicioMultiCharts, smart-dashboard/ResumenSubTab,
unified/ComprasModule, unified/FinanzasModule
```
7 de ellos re-fetchean `/api/payables` directo (Treasury, CashFlow, Liquidity, PaymentCalendarView, Finanzas, Reports, CheckManagement).

### 🔴 P0 — "Ingresos/Ventas": inconsistencia confirmada
| Sección | Qué suma | Evidencia |
|---|---|---|
| Inicio (home) | Order **+** Sale | fix `3530b26c` |
| `TreasuryDashboard`, `LiquidityForecastTab` | **solo Sale** (POS) | leído: fetch solo `/api/sales`, `recentSales.reduce` |
| `/api/analytics/kpis-v2` | centraliza `ingresos` | solo 10 componentes lo usan vs 70 que van a `/api/sales` crudo |

→ "ingresos" en Tesorería ≠ "ingresos" en Inicio. **20+ componentes** suman `/api/sales` por su cuenta
(BreakEven, BudgetVsReal, CashierRanking, DailyGoalTracker, GoalsTab, MonthProjectionCard,
ProfitLossAutoCard, ReportsTab, SeasonalityInsights, etc.).

### 🟠 P1 — Productos/Stock: 87 consumidores de `/api/products`
Stock bajo (umbrales locales), valorización (costo vs venta), conteo de activos (`active` vs servicios
vs borrados) calculados localmente sin estándar. *(Patrón confirmado por frecuencia; fórmulas por
componente NO verificadas línea por línea — hacerlo antes de tocar.)*

### 🟠 P1 — Clientes/Fiados: 57 + 19 consumidores
Deuda total de fiados, saldos por cliente, "vencido" re-sumados sin fuente común.

## 3. Plan de consolidación (manifiesto ejecutable)

> Regla de oro: **un KPI = una fórmula = un origen**. Los componentes solo *consumen*, no recalculan.

### Fase 1 — Single-source backend (los agregadores ya existen; completarlos)
- [ ] `/api/admin/dashboard/aggregates` y/o `/api/analytics/kpis-v2` exponen, con UNA fórmula:
      `ingresos` (Order+Sale), `egresos`, `porPagar`, `saldoCaja`, `gastos`, `deudaFiados`, `stockValor`.
- [ ] Documentar cada fórmula (qué incluye/excluye: IGV, status, devoluciones, borrados).

### Fase 2 — Hook/context transversal
- [ ] Extender `contexts/dashboard-data-context.tsx` (o un `use-finanzas-aggregate`) que sirva esos KPIs
      cacheados a TODO módulo financiero.

### Fase 3 — Migrar consumidores (por dominio, verificando cada fórmula antes)
- [ ] **Payables** (28 archivos arriba): reemplazar el `reduce` local por `porPagar` del agregado.
- [ ] **Ventas** (20+ archivos): reemplazar `sales.reduce` por `ingresos` del agregado (Order+Sale).
- [ ] **Productos**: estandarizar umbral stock-bajo + valorización + criterio de "activo" en un solo lugar.
- [ ] **Clientes/Fiados**: deuda/saldo/vencido desde un solo agregado.

### Orden sugerido (impacto/riesgo)
1. Ventas Order+Sale (P0, impacto directo en plata mostrada).
2. Por pagar (P0, 28 sitios).
3. Productos/Stock (P1).
4. Clientes/Fiados (P1).

## 4. Honestidad (trust-but-verify)
**Verificado por grep:** frecuencias de endpoints, los 7 agregadores financieros, Sale-only en
Tesorería/Liquidez, los 28 sumadores de payables, existencia de la infra única.
**NO verificado línea por línea:** las 28 fórmulas de payables y las 20+ de ventas — el muestreo
confirma el patrón, pero cada migración exige leer la fórmula real antes de unificar (algunas pueden
tener filtros legítimos que el agregado debe respetar).
