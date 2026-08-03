"use client";

import { CardTitle } from "@buleje/design-system";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import { useState, useEffect, useMemo, useCallback } from "react";
import dynamic from "next/dynamic";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  ReferenceLine, PieChart, Pie, Cell, LabelList,
  ComposedChart, Line, LineChart, AreaChart, Area,
} from "recharts";
import {
  TrendingUp, TrendingDown, PieChart as PieChartIcon, Target,
  FileBarChart, Waves, Calculator, GitCompareArrows,
  DollarSign, Wallet,
  BarChart3, Percent, Truck, CreditCard, RefreshCw, AlertTriangle, Maximize2, X as XIcon,
  Landmark, HandCoins, Banknote, Coins, Construction, Gauge, ChevronRight,
  type LucideIcon,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/currency";
import { ChartTooltip } from "@/lib/chart-tooltip";
import { formatSolesShort } from "@/lib/chart-helpers";
import { Suspense } from "react";
import { useVistaModulo } from "@/hooks/use-vista-modulo";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";
import { SERIES, SERIE, colorMedioPago } from "@/components/admin/shared/chart-palette";
import AutoRefreshControl from "@/components/admin/shared/AutoRefreshControl";
import FavStar from "@/components/admin/shared/FavStar";
import ChartExpandModal from "@/components/admin/shared/ChartExpandModal";
import EmptyState from "@/components/admin/shared/EmptyState";
import ExportButton from "@/components/admin/shared/ExportButton";
import PeriodSelector from "@/components/admin/shared/PeriodSelector";
import { useFavoriteCharts } from "@/hooks/use-favorite-charts";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";

import { TabLoadingSkeleton as S } from "@/components/ui/skeletons";
import { ComparativoMensual, GaugeChart, StaggerItem } from "@/components/admin/finanzas/charts";
import {
  fetchFinanzas, n, calcHealthScore, MESES, monthIngresos,
  type SaleRaw, type ExpenseRaw, type PayableRaw, type FiadoRaw, type HealthData, type OrderRaw,
} from "@/components/admin/finanzas/shared";

const PLTab = dynamic(() => import("@/components/admin/PLTab"), { loading: S });
const ExpensesTab = dynamic(() => import("@/components/admin/ExpensesTab"), { loading: S });
const ProfitabilityTab = dynamic(() => import("@/components/admin/ProfitabilityTab"), { loading: S });
const ReportsTab = dynamic(() => import("@/components/admin/ReportsTab"), { loading: S });
const ImportExportTab = dynamic(() => import("@/components/admin/ImportExportTab"), { loading: S });
const BudgetVsRealTab = dynamic(() => import("@/components/admin/BudgetVsRealTab"), { loading: S });
const WeeklyReportCard = dynamic(() => import("@/components/admin/WeeklyReportCard"), { loading: S });
const BudgetAlertWidget = dynamic(() => import("@/components/admin/BudgetAlertWidget"), { loading: S });
const MonthProjectionCard = dynamic(() => import("@/components/admin/MonthProjectionCard"), { loading: S });
const ProfitLossAutoCard = dynamic(() => import("@/components/admin/ProfitLossAutoCard"), { loading: S });
const CashflowRollingTable = dynamic(() => import("@/components/admin/finance/CashflowRollingTable"), { loading: S });
const BreakEvenDashboard = dynamic(() => import("@/components/admin/BreakEvenDashboard"), { loading: S });
// LoanCalculator → movido a PrestamosModule (evitar duplicación)
// CommissionCalculator → movido a POSCajaModule (es operativo de ventas)
// PaymentCalendar → movido a TesoreriaModule (es operativo de tesorería)
const MoneyLeakDetector = dynamic(() => import("@/components/admin/MoneyLeakDetector"), { loading: S });
const HistorialCierresTab = dynamic(() => import("@/components/admin/HistorialCierresTab"), { loading: S });
const PresupuestoMensualTab = dynamic(() => import("@/components/admin/finanzas/PresupuestoMensualTab"), { loading: S });
const ReporteMensualTab     = dynamic(() => import("@/components/admin/ReporteMensualTab"),              { loading: S });
// Comparador de períodos: estaba huérfano (0 imports); real (/api/admin/dashboard),
// read-only, distinto del dashboard. Montado tras verificar. Brandon 2026-06-20.
const PeriodComparatorTab   = dynamic(() => import("@/components/admin/PeriodComparatorTab"),            { loading: S });
// Inteligencia (BI operacional) movida a AnalisisHubModule → components/admin/analisis/InteligenciaTab.tsx
// DocumentosEmitidosTab → movido a categoría Documentos (no es finanzas)
const TreasuryDashboard = dynamic(() => import("@/components/admin/TreasuryDashboard"), { loading: S });

// ── Módulos de crédito/capital foldeados como sub-tabs (consolidación Finanzas 5→1) ──
// Antes eran 4 entradas top-level separadas (fiados, prestamos, adelantos, activos).
// Ahora viven como sub-tabs de este módulo: 1 hub financiero con más funciones.
const FiadosModule    = dynamic(() => import("@/components/admin/FiadosModule"),              { loading: S });
const PrestamosModule = dynamic(() => import("@/components/admin/PrestamosModule"),           { loading: S });
const AdelantosModule = dynamic(() => import("@/components/admin/adelantos/AdelantosModule"), { loading: S });
const ActivosModule   = dynamic(() => import("@/components/admin/activos/ActivosModule"),     { loading: S });
// Por cobrar (roll-up de todo lo que te deben) consolidado como sub-tab
const PorCobrarDashboard = dynamic(() => import("@/components/admin/PorCobrarDashboard"),     { loading: S });
// Scoring crediticio consolidado como sub-tab (era entrada top-level "scoring")
const ScoringCrediticioTab = dynamic(() => import("@/components/admin/ScoringCrediticioTab"), { loading: S });

const MODULE_ID = "plata";

/**
 * Las seis secciones de Mi Plata.
 *
 * Eran quince y ocupaban TRES filas de pestañas antes de que empezara el
 * contenido — con cuatro de ellas casi vacías y una («Por cobrar») cuyo único
 * contenido eran tres enlaces a las tres pestañas de al lado. Lo que se agrupó
 * se agrupó por la pregunta que contesta, no por el componente que lo dibuja:
 * "¿cuánto gané?" es una sola pregunta aunque se mire de tres maneras.
 */
const TABS = [
  { id: "resumen" as const,          label: "Resumen",                 icon: BarChart3    },
  { id: "resultado" as const,        label: "Resultado",               icon: TrendingUp   },
  { id: "gastos" as const,           label: "Gastos",                  icon: TrendingDown },
  { id: "caja" as const,             label: "Caja",                    icon: Waves        },
  { id: "por-cobrar" as const,       label: "Por cobrar",              icon: CreditCard   },
  { id: "reportes" as const,         label: "Reportes",                icon: FileBarChart },
];

type TabId = typeof TABS[number]["id"];

/** Lo que vive dentro de cada pestaña. Sin entrada = la pestaña no se divide. */
const SUBS: Partial<Record<TabId, { id: string; label: string; icon: LucideIcon }[]>> = {
  resultado: [
    { id: "pl",           label: "Ganancias y pérdidas", icon: TrendingUp },
    { id: "rentabilidad", label: "Rentabilidad",         icon: PieChartIcon },
    { id: "comparador",   label: "Comparar períodos",    icon: GitCompareArrows },
  ],
  gastos: [
    { id: "gastos",      label: "Gastos y costos", icon: TrendingDown },
    { id: "presupuesto", label: "Presupuesto",     icon: Target },
  ],
  caja: [
    { id: "flujo-caja", label: "Proyección", icon: Waves },
    { id: "tesoreria",  label: "Tesorería",  icon: Landmark },
  ],
  "por-cobrar": [
    { id: "por-cobrar", label: "Todo lo que me deben", icon: CreditCard },
    { id: "fiados",     label: "Fiados",              icon: HandCoins },
    { id: "prestamos",  label: "Préstamos",           icon: Banknote },
    { id: "adelantos",  label: "Adelantos",           icon: Coins },
    { id: "scoring",    label: "Scoring",             icon: Gauge },
  ],
  reportes: [
    { id: "reportes", label: "Reportes", icon: FileBarChart },
    { id: "activos",  label: "Activos",  icon: Construction },
  ],
};

/**
 * Dónde vive ahora cada nombre viejo.
 *
 * El menú del panel entra a Mi Plata por seis atajos distintos
 * (`?tab=fiados`, `?tab=activos`, `?tab=scoring`…) y hay un `localStorage` con
 * la última pestaña abierta. Sin esta tabla, todos esos caminos aterrizarían en
 * "Resumen" y el atajo dejaría de ser un atajo.
 */
const DONDE_VIVE: Record<string, { tab: TabId; sub?: string }> = {
  dashboard:     { tab: "resumen" },
  resumen:       { tab: "resumen" },
  pl:            { tab: "resultado",  sub: "pl" },
  rentabilidad:  { tab: "resultado",  sub: "rentabilidad" },
  comparador:    { tab: "resultado",  sub: "comparador" },
  resultado:     { tab: "resultado",  sub: "pl" },
  gastos:        { tab: "gastos",     sub: "gastos" },
  presupuesto:   { tab: "gastos",     sub: "presupuesto" },
  "flujo-caja":  { tab: "caja",       sub: "flujo-caja" },
  tesoreria:     { tab: "caja",       sub: "tesoreria" },
  caja:          { tab: "caja",       sub: "flujo-caja" },
  "por-cobrar":  { tab: "por-cobrar", sub: "por-cobrar" },
  fiados:        { tab: "por-cobrar", sub: "fiados" },
  prestamos:     { tab: "por-cobrar", sub: "prestamos" },
  adelantos:     { tab: "por-cobrar", sub: "adelantos" },
  scoring:       { tab: "por-cobrar", sub: "scoring" },
  reportes:      { tab: "reportes",   sub: "reportes" },
  activos:       { tab: "reportes",   sub: "activos" },
};

/** El primer hijo de una pestaña, o la pestaña misma si no se divide. */
const primeraSub = (tab: TabId): string => SUBS[tab]?.[0]?.id ?? tab;

/**
 * Las secciones direccionables por `?vista=`, derivadas de la estructura real:
 * la hoja de cada pestaña, o la pestaña misma cuando no se divide. Derivarlas
 * —en vez de listarlas— evita que agregar una sección la deje sin dirección.
 */
const VISTAS: readonly string[] = TABS.flatMap((t) => SUBS[t.id]?.map((s) => s.id) ?? [t.id]);

/** Traduce cualquier nombre —viejo o nuevo— a en qué pestaña y sección cae. */
function ubicar(id: string | undefined): { tab: TabId; sub: string } {
  const d = id ? DONDE_VIVE[id] : undefined;
  if (!d) return { tab: "resumen", sub: primeraSub("resumen") };
  return { tab: d.tab, sub: d.sub ?? primeraSub(d.tab) };
}

 
function generarReporteBancario() {
  Promise.all([
    fetchFinanzas<Record<string, unknown> | null>("/api/expenses/summary", null),
    fetchFinanzas<unknown[]>("/api/sales?limit=5000", []),
    fetchFinanzas<Record<string, unknown> | null>("/api/analytics/kpis-v2", null),
    fetchFinanzas<unknown[]>("/api/orders?limit=5000", []),
  ])
    .then(([expenses, sales, kpis, orders]) => {
      const now = new Date();
      const allSales = (Array.isArray(sales) ? sales : []) as SaleRaw[];
      const allOrders = (Array.isArray(orders) ? orders : []) as OrderRaw[];
      const meses: Array<{ mes: string; ingresos: number; gastos: number; utilidad: number }> = [];

      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthKey = d.toISOString().slice(0, 7);
        const label = d.toLocaleDateString("es-PE", { month: "long", year: "numeric" });
        const ingresos = monthIngresos(monthKey, allSales, allOrders);
        let gastos = 0;
        if (expenses?.monthly && Array.isArray(expenses.monthly)) {
          const m = (expenses.monthly as Array<{ month: string; total?: number }>).find((e) => e.month === monthKey);
          gastos = n(m?.total);
        }
        meses.push({ mes: label, ingresos: Math.round(ingresos), gastos: Math.round(gastos), utilidad: Math.round(ingresos - gastos) });
      }

      const totalIngresos = meses.reduce((s, m) => s + m.ingresos, 0);
      const totalGastos = meses.reduce((s, m) => s + m.gastos, 0);
      const totalUtilidad = totalIngresos - totalGastos;
      const margen = totalIngresos > 0 ? ((totalUtilidad / totalIngresos) * 100).toFixed(1) : "0";
      const clientesActivos = kpis?.clientesActivos ?? kpis?.customersActive ?? "--";

      // Proyeccion
      const avgIngresosMensual = totalIngresos / 6;
      const proyeccion = Math.round(avgIngresosMensual * 1.05);

      const tablaRows = meses.map(m =>
        `<tr><td style="padding:8px;border:1px solid #ddd">${m.mes}</td><td style="padding:8px;border:1px solid #ddd;text-align:right">S/${m.ingresos.toLocaleString("es-PE")}</td><td style="padding:8px;border:1px solid #ddd;text-align:right">S/${m.gastos.toLocaleString("es-PE")}</td><td style="padding:8px;border:1px solid #ddd;text-align:right;font-weight:bold;color:${m.utilidad >= 0 ? "var(--color-primary)" : "#e63946"}">S/${m.utilidad.toLocaleString("es-PE")}</td></tr>`
      ).join("");

      // Barras simples CSS
      const maxVal = Math.max(...meses.map(m => m.ingresos), 1);
      const barrasHtml = meses.map(m =>
        `<div style="display:flex;align-items:end;gap:4px;flex:1;flex-direction:column;text-align:center"><div style="background:var(--color-primary);width:30px;height:${Math.round((m.ingresos / maxVal) * 120)}px;border-radius:4px 4px 0 0"></div><div style="font-size:10px;color:#666">${m.mes.split(" ")[0].slice(0, 3)}</div></div>`
      ).join("");

      const fecha = now.toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric" });

      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Reporte Financiero - Buleje</title><style>:root{--color-primary:#00A0A0}body{font-family:'Segoe UI',Arial,sans-serif;max-width:800px;margin:0 auto;padding:40px;color:#333;font-size:14px}h1{color:var(--color-primary);border-bottom:3px solid var(--color-primary);padding-bottom:10px;font-size:22px}h2{color:#333;margin-top:30px;font-size:16px;border-bottom:1px solid #ddd;padding-bottom:5px}table{width:100%;border-collapse:collapse;margin:15px 0}th{background:#f8f9fa;padding:10px 8px;border:1px solid #ddd;text-align:left;font-size:12px;text-transform:uppercase;letter-spacing:0.5px}td{padding:8px;font-size:13px}.kpi{display:inline-block;background:#f8f9fa;border:1px solid #ddd;border-radius:8px;padding:15px 20px;margin:5px;text-align:center;min-width:150px}.kpi-label{font-size:11px;color:#666;text-transform:uppercase;letter-spacing:0.5px}.kpi-value{font-size:20px;font-weight:bold;color:var(--color-primary);margin-top:4px}.footer{margin-top:40px;padding-top:15px;border-top:1px solid #ddd;color:#999;font-size:11px;text-align:center}@media print{body{padding:20px}}</style></head><body><h1>REPORTE FINANCIERO — Buleje</h1><p style="color:#666;font-size:12px">Período: últimos 6 meses &middot; Generado el ${fecha}</p><h2>1. Datos del Negocio</h2><table><tr><td style="padding:8px;border:1px solid #ddd;width:200px;font-weight:bold">Razon Social</td><td style="padding:8px;border:1px solid #ddd">Buleje</td></tr><tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold">Ubicacion</td><td style="padding:8px;border:1px solid #ddd">Pucallpa, Ucayali, Peru</td></tr><tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold">Giro</td><td style="padding:8px;border:1px solid #ddd">Comercio minorista - Abarrotes</td></tr></table><h2>2. Resumen de Ingresos</h2><table><thead><tr><th>Mes</th><th style="text-align:right">Ingresos</th><th style="text-align:right">Gastos</th><th style="text-align:right">Utilidad</th></tr></thead><tbody>${tablaRows}<tr style="background:#f0f0f0;font-weight:bold"><td style="padding:8px;border:1px solid #ddd">TOTAL</td><td style="padding:8px;border:1px solid #ddd;text-align:right">S/${totalIngresos.toLocaleString("es-PE")}</td><td style="padding:8px;border:1px solid #ddd;text-align:right">S/${totalGastos.toLocaleString("es-PE")}</td><td style="padding:8px;border:1px solid #ddd;text-align:right;color:${totalUtilidad >= 0 ? "var(--color-primary)" : "#e63946"}">S/${totalUtilidad.toLocaleString("es-PE")}</td></tr></tbody></table><h2>3. Tendencia de Ingresos</h2><div style="display:flex;align-items:end;gap:8px;height:140px;padding:10px;background:#fafafa;border:1px solid #eee;border-radius:8px">${barrasHtml}</div><h2>4. Indicadores Clave</h2><div style="display:flex;flex-wrap:wrap;gap:5px"><div class="kpi"><div class="kpi-label">Margen de utilidad</div><div class="kpi-value">${margen}%</div></div><div class="kpi"><div class="kpi-label">Clientes activos</div><div class="kpi-value">${clientesActivos}</div></div><div class="kpi"><div class="kpi-label">Ingreso prom./mes</div><div class="kpi-value">S/${Math.round(avgIngresosMensual).toLocaleString("es-PE")}</div></div></div><h2>5. Proyeccion</h2><p>Basado en la tendencia de los últimos 6 meses, el ingreso estimado para el próximo mes es: <strong style="color:var(--color-primary);font-size:18px">S/${proyeccion.toLocaleString("es-PE")}</strong></p><div class="footer">Generado el ${fecha} — Buleje &middot; Este reporte es de caracter informativo</div></body></html>`;

      const w = window.open("", "_blank");
      if (w) {
        w.document.write(html);
        w.document.close();
      }
    })
    .catch(() => {
      alert("Error al generar el reporte. Intenta nuevamente.");
    });
}

// ── Dashboard de Finanzas (Premium) ──────────────────────────────────────────

// Colores de serie desde la paleta única del admin (chart-palette.ts). Antes
// este archivo declaraba 101 hex sueltos y su propio mapa de medios de pago
// —duplicado del que arman otros módulos— y ninguno era theme-aware.
const DASHBOARD_EXPENSE_COLORS = SERIES;
const PM_FALLBACK_COLORS = SERIES;

type KpiDef = { key: string; label: string; icon: typeof TrendingUp; color: string; bg: string };
const KPI_DEFS: KpiDef[] = [
  { key: "ingresos", label: "Ingresos del mes", icon: TrendingUp, color: "var(--accent)", bg: "bg-primary/10" },
  { key: "gastos", label: "Gastos del mes", icon: TrendingDown, color: SERIE.gastos, bg: "bg-[var(--data-error-50)]" },
  { key: "utilidad", label: "Utilidad neta", icon: DollarSign, color: SERIE.utilidad, bg: "bg-primary/10" },
  { key: "margen", label: "Margen %", icon: Percent, color: SERIES[3], bg: "bg-[var(--surface-sunken)]" },
  { key: "deuda", label: "Deuda proveedores", icon: Truck, color: SERIE.alerta, bg: "bg-[var(--data-warning-50)]" },
  { key: "fiados", label: "Fiados pendientes", icon: CreditCard, color: SERIE.alerta, bg: "bg-[var(--data-warning-50)]" },
  { key: "igv", label: "IGV a pagar", icon: Calculator, color: SERIE.gastos, bg: "bg-[var(--surface-sunken)]" },
  { key: "puntoEq", label: "Punto equilibrio", icon: Target, color: "var(--color-primary)", bg: "bg-primary/10" },
];
function FinanzasDashboard() {
  const [kpis, setKpis] = useState<Record<string, number>>({});
  const [monthlyData, setMonthlyData] = useState<Array<{ mes: string; fullMonth: string; ingresos: number; gastos: number; utilidad: number }>>([]);
  const [expensesByCategory, setExpensesByCategory] = useState<Array<{ name: string; value: number }>>([]);
  const [paymentMethods, setPaymentMethods] = useState<Array<{ name: string; value: number }>>([]);
  const [cashFlow, setCashFlow] = useState<Array<{ dia: string; ingresos: number; gastos: number; balance: number }>>([]);
  // Mejora 12: Click-to-filter en PieChart de gastos
  const [gastosPieFilter, setGastosPieFilter] = useState<string | null>(null);
  // Mejora 13: Expand chart modal
  const [expandedChart, setExpandedChart] = useState<string | null>(null);
  // Mejora 20: Comparar meses
  const [cmpMonth1, setCmpMonth1] = useState(() => { const d = new Date(); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 7); });
  const [cmpMonth2, setCmpMonth2] = useState(() => new Date().toISOString().slice(0, 7));
  const [topPayables, setTopPayables] = useState<Array<{ name: string; monto: number; vencido: boolean }>>([]);
  const [topFiados, setTopFiados] = useState<Array<{ name: string; monto: number; vencido: boolean }>>([]);
  const [projection, setProjection] = useState<{ ventasMes: number; gastosMes: number; diasTranscurridos: number; diasTotales: number } | null>(null);
  const [fiscal, setFiscal] = useState<{ ventas: number; compras: number } | null>(null);
  const [healthData, setHealthData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  // Mejora 1: Period selector
  const [period, setPeriod] = useState<"today" | "7d" | "30d" | "month">("month");
  // Mejora 3: Auto-refresh
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [minAgo, setMinAgo] = useState(0);
  // (Deltas de KPI: ahora se calculan reales desde monthlyData en el render —
  // antes eran Math.random. Ver bloque del KPI grid.)
  // Mejora 5: Favoritos
  const finFavs = useFavoriteCharts("finanzas");

  useEffect(() => {
    Promise.allSettled([
      fetchFinanzas<Record<string, unknown> | null>("/api/analytics/kpis-v2", null),
      fetchFinanzas<Record<string, unknown> | null>("/api/expenses/summary", null),
      // Desglose de ventas agregado SERVER-SIDE (métodos de pago + ingresos
      // diarios). Antes era /api/sales?limit=5000 crudo bucketeado en el cliente.
      fetchFinanzas<{ paymentMethods: { name: string; value: number }[]; daily: { day: string; ingresos: number }[] }>("/api/finanzas/sales-breakdown?days=30", { paymentMethods: [], daily: [] }),
      fetch("/api/expenses?limit=2000").then(r => r.ok ? r.json() : []),
      fetch("/api/payables").then(r => r.ok ? r.json() : []),
      fetch("/api/fiados?status=ACTIVO").then(r => r.ok ? r.json() : []),
      // Ingresos mensuales agregados SERVER-SIDE (Sale + Order con
      // INGRESO_ORDER_STATUSES). Antes era /api/orders?limit=5000 crudo
      // bucketeado en el cliente. Bucketing UTC = idéntico (test cubre).
      fetchFinanzas<{ month: string; ingresos: number }[]>("/api/finanzas/monthly-summary?months=6", []),
    ]).then(([kR, eR, bR, exR, pR, fR, msR]) => {
      const kpisData = kR.status === "fulfilled" ? kR.value : null;
      const expSummary = eR.status === "fulfilled" ? eR.value : null;
      const salesBreakdown = (bR.status === "fulfilled" ? bR.value : { paymentMethods: [], daily: [] }) as { paymentMethods: { name: string; value: number }[]; daily: { day: string; ingresos: number }[] };
      const monthlySummary = (msR.status === "fulfilled" && Array.isArray(msR.value) ? msR.value : []) as { month: string; ingresos: number }[];
      const expensesRaw = exR.status === "fulfilled" ? exR.value : [];
      const payablesRaw = pR.status === "fulfilled" ? (Array.isArray(pR.value) ? pR.value : []) : [];
      const fiadosRaw = fR.status === "fulfilled" ? (Array.isArray(fR.value) ? fR.value : []) : [];

      const now = new Date();

      // ── KPIs ──
      const ingresos = n(kpisData?.ventasMes ?? kpisData?.salesMonth);
      const gastosMes = n(expSummary?.totalMonth ?? expSummary?.total);
      const utilidad = ingresos - gastosMes;
      const margen = ingresos > 0 ? Math.round(((ingresos - gastosMes) / ingresos) * 100) : 0;
      const deuda = n(kpisData?.payablesVencidosMonto)
        || (payablesRaw as PayableRaw[]).reduce((s, p) => s + n(p.amount ?? p.total), 0);
      const fiados = n(kpisData?.fiadosPendienteMonto ?? kpisData?.fiadosVencidosMonto)
        || (fiadosRaw as FiadoRaw[]).reduce((s, f) => s + n(f.total ?? f.amount), 0);
      const igvCobrado = ingresos * 0.18 / 1.18;
      const igvPagado = gastosMes * 0.18 / 1.18;
      const igvNeto = Math.round(igvCobrado - igvPagado);
      const diasTranscurridos = Math.max(1, now.getDate());
      const puntoEq = diasTranscurridos > 0 ? Math.round(gastosMes / diasTranscurridos) : 0;
      setKpis({
        ingresos: Math.round(ingresos), gastos: Math.round(gastosMes), utilidad: Math.round(utilidad),
        margen, deuda: Math.round(deuda), fiados: Math.round(fiados), igv: igvNeto, puntoEq,
      });

      // ── Fiscal ──
      setFiscal({ ventas: ingresos, compras: gastosMes });

      // ── Projection ──
      const diasTotales = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      setProjection({ ventasMes: ingresos, gastosMes, diasTranscurridos, diasTotales });

      // ── Health ──
      const efectivo = n(kpisData?.cashToday ?? kpisData?.efectivoHoy) || ingresos * 0.3;
      const fiadosVencidos = n(kpisData?.fiadosVencidosMonto);
      const payablesVencidos = n(kpisData?.payablesVencidosMonto);
      setHealthData({ ingresos, gastos: gastosMes, efectivo, gastosMensuales: gastosMes, fiadosVencidos, payablesVencidos });

      // ── Monthly chart (últimos 6 meses) ──
      // Ingresos vienen del endpoint server-side (monthlySummary, orden cronológico
      // oldest→newest). Gastos siguen de expSummary.monthly (ya agregado por mes).
      const months = monthlySummary.map(({ month: monthKey, ingresos: ing }, idx) => {
        const [yy, mm] = monthKey.split("-").map(Number);
        const d = new Date(yy, (mm ?? 1) - 1, 1);
        const label = MESES[d.getMonth()];
        const fullLabel = d.toLocaleDateString("es-PE", { month: "long", year: "numeric" });
        let gas = 0;
        if (expSummary?.monthly && Array.isArray(expSummary.monthly)) {
          const m = (expSummary.monthly as Array<{ month: string; total?: number }>).find((e) => e.month === monthKey);
          gas = n(m?.total);
        } else if (expSummary?.totalMonth && idx === monthlySummary.length - 1) {
          gas = n(expSummary.totalMonth);
        }
        return { mes: label, fullMonth: fullLabel, ingresos: Math.round(ing), gastos: Math.round(gas), utilidad: Math.round(ing - gas) };
      });
      setMonthlyData(months);

      // ── Expenses by category (donut) ──
      const itemsRaw = Array.isArray(expensesRaw)
        ? expensesRaw
        : ((expensesRaw as { expenses?: unknown[] } | null)?.expenses ?? []);
      const items = itemsRaw as ExpenseRaw[];
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const catMap = new Map<string, number>();
      for (const e of items) {
        const eDate = new Date(e.date ?? e.createdAt ?? "");
        if (eDate >= startOfMonth) {
          const cat = (e.category ?? "otros").charAt(0).toUpperCase() + (e.category ?? "otros").slice(1);
          catMap.set(cat, (catMap.get(cat) ?? 0) + n(e.amount));
        }
      }
      setExpensesByCategory(
        Array.from(catMap.entries())
          .map(([name, value]) => ({ name, value: Math.round(value) }))
          .filter(g => g.value > 0)
          .sort((a, b) => b.value - a.value)
      );

      // ── Métodos de pago (del endpoint, agregado por el campo real `payment`) ──
      // FIX: el cliente leía paymentMethod/metodoPago (inexistentes) → todo "Efectivo".
      setPaymentMethods(salesBreakdown.paymentMethods);

      // ── Cashflow diario: ingresos del endpoint (UTC), gastos de expenses (items) ──
      const flowData = salesBreakdown.daily.map(({ day: dayKey, ingresos: dayIngresos }) => {
        const [, mm, dd2] = dayKey.split("-").map(Number);
        const dayLabel = `${dd2}/${mm}`;
        const dayGastos = items
          .filter((e) => (e.date ?? e.createdAt ?? "").slice(0, 10) === dayKey)
          .reduce((sum, e) => sum + n(e.amount), 0);
        return { dia: dayLabel, ingresos: Math.round(dayIngresos), gastos: Math.round(dayGastos), balance: Math.round(dayIngresos - dayGastos) };
      });
      setCashFlow(flowData);

      // ── Top payables (proveedores) ──
      const pGrouped = new Map<string, { monto: number; vencido: boolean }>();
      for (const p of payablesRaw) {
        const name = p.supplierName ?? p.supplier?.name ?? p.description ?? "Proveedor";
        const prev = pGrouped.get(name) ?? { monto: 0, vencido: false };
        prev.monto += (p.amount ?? p.total ?? 0);
        if (p.status === "VENCIDO" || (p.dueDate && new Date(p.dueDate) < now)) prev.vencido = true;
        pGrouped.set(name, prev);
      }
      setTopPayables(
        Array.from(pGrouped.entries())
          .map(([name, d]) => ({ name: name.length > 18 ? name.slice(0, 18) + "..." : name, monto: Math.round(d.monto), vencido: d.vencido }))
          .sort((a, b) => b.monto - a.monto)
          .slice(0, 5)
      );

      // ── Top fiados (deudores) ──
      const fGrouped = new Map<string, { monto: number; vencido: boolean }>();
      for (const f of fiadosRaw) {
        const name = f.customerName ?? f.customer?.name ?? f.description ?? "Cliente";
        const prev = fGrouped.get(name) ?? { monto: 0, vencido: false };
        prev.monto += (f.total ?? f.amount ?? 0);
        if (f.status === "VENCIDO" || (f.dueDate && new Date(f.dueDate) < now)) prev.vencido = true;
        fGrouped.set(name, prev);
      }
      setTopFiados(
        Array.from(fGrouped.entries())
          .map(([name, d]) => ({ name: name.length > 18 ? name.slice(0, 18) + "..." : name, monto: Math.round(d.monto), vencido: d.vencido }))
          .sort((a, b) => b.monto - a.monto)
          .slice(0, 5)
      );

      setLoading(false);
      setLastRefresh(new Date());
    });
  }, []);

  // Mejora 3: Auto-refresh timer
  useEffect(() => {
    const minuteInterval = setInterval(() => {
      setMinAgo(Math.floor((Date.now() - lastRefresh.getTime()) / 60000));
    }, 60000);
    return () => clearInterval(minuteInterval);
  }, [lastRefresh]);

  const healthScore = useMemo(() => healthData ? calcHealthScore(healthData) : null, [healthData]);

  // Mejora 6: Alertas inteligentes — ALL hooks MUST be before any early return
  const alertas = useMemo(() => {
    const a: Array<{ msg: string; color: string }> = [];
    if ((kpis.fiados ?? 0) > 0) a.push({ msg: `${formatCurrency(kpis.fiados ?? 0, { decimals: 0 })} en fiados pendientes`, color: "bg-[var(--data-warning-100)] text-[var(--data-warning-500)]" });
    if ((kpis.utilidad ?? 0) < 0) a.push({ msg: "Balance negativo este mes", color: "bg-[var(--data-error-100)] text-[var(--data-error-500)]" });
    if (topPayables.some(p => p.vencido)) a.push({ msg: `${topPayables.filter(p => p.vencido).length} pagos vencidos a proveedores`, color: "bg-[var(--data-error-100)] text-[var(--data-error-500)]" });
    return a;
  }, [kpis, topPayables]);

  // ── Loading skeleton ──
  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="h-10 w-10 rounded-full bg-[var(--surface-sunken)]" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-[var(--surface-sunken)] rounded w-16" />
                  <div className="h-5 bg-[var(--surface-sunken)] rounded w-24" />
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-6">
          <div className="h-4 bg-[var(--surface-sunken)] rounded w-48 mb-4" />
          <div className="h-80 bg-[var(--surface-sunken)] rounded-xl" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-6">
            <div className="h-50 bg-[var(--surface-sunken)] rounded-xl" />
          </div>
          <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-6">
            <div className="h-50 bg-[var(--surface-sunken)] rounded-xl" />
          </div>
        </div>
        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-6">
          <div className="h-70 bg-[var(--surface-sunken)] rounded-xl" />
        </div>
      </div>
    );
  }

  const totalExpenses = expensesByCategory.reduce((s, g) => s + g.value, 0);
  const totalIncome = paymentMethods.reduce((s, g) => s + g.value, 0);

  // Projection calculations
  const projVentasDiarias = projection ? projection.ventasMes / projection.diasTranscurridos : 0;
  const projVentas = projection ? Math.round(projVentasDiarias * projection.diasTotales) : 0;
  const projGastos = projection ? Math.round((projection.gastosMes / projection.diasTranscurridos) * projection.diasTotales) : 0;
  const projUtilidad = projVentas - projGastos;
  const projProgreso = projection ? (projection.diasTranscurridos / projection.diasTotales) * 100 : 0;
  const projPctTarget = projVentas > 0 ? Math.round((projection?.ventasMes ?? 0) / projVentas * 100) : 0;

  // Fiscal calculations
  const fiscIgvCobrado = fiscal ? fiscal.ventas * 0.18 / 1.18 : 0;
  const fiscIgvPagado = fiscal ? fiscal.compras * 0.18 / 1.18 : 0;
  const fiscIgvNeto = fiscIgvCobrado - fiscIgvPagado;

  const mesNombre = new Date().toLocaleDateString("es-PE", { month: "long", year: "numeric" });
  const mesCapitalized = mesNombre.charAt(0).toUpperCase() + mesNombre.slice(1);

  // Empty state
  if (Object.values(kpis).every(v => v === 0) && monthlyData.every(m => m.ingresos === 0 && m.gastos === 0)) {
    return (
      <div className="text-center py-16">
        <div className="h-16 w-16 rounded-xl bg-[var(--surface-sunken)] dark:bg-surface flex items-center justify-center mx-auto mb-4">
          <BarChart3 className="h-8 w-8 text-[var(--text-tertiary)] dark:text-muted" />
        </div>
        <CardTitle className="text-lg font-semibold text-[var(--text-primary)]">Sin datos financieros</CardTitle>
        <p className="text-sm text-muted mt-1">Registra tus primeras ventas y gastos para ver el dashboard</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">

      {/* ════════ CONTROLES: Periodo + Refresh + Export ════════ */}
      <StaggerItem index={0}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PeriodSelector value={period} onChange={setPeriod} />
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 text-xs text-[var(--text-tertiary)]">
            <span>Actualizado hace {minAgo} min</span>
            <button onClick={() => { setLastRefresh(new Date()); setMinAgo(0); }} className="p-1 h-11 w-11 flex items-center justify-center hover:bg-[var(--surface-sunken)] rounded transition-colors" title="Actualizar datos">
              <RefreshCw className="h-3 w-3" />
            </button>
          </div>
          <ExportButton />
        </div>
      </div>
      </StaggerItem>

      {/* ════════ ALERTAS INTELIGENTES ════════ */}
      {alertas.length > 0 && (
        <StaggerItem index={0}>
        <div className="flex flex-wrap gap-2">
          {alertas.map((a, i) => (
            <span key={i} className={cn("inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold", a.color)}>
              <AlertTriangle className="h-3 w-3" /> {a.msg}
            </span>
          ))}
        </div>
        </StaggerItem>
      )}

      {/* ════════ SECCION 1: 8 KPIs Premium ════════ */}
      <StaggerItem index={1}>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {KPI_DEFS.map((def, _kpiIdx) => {
          const Icon = def.icon;
          const val = kpis[def.key] ?? 0;
          let display: string;
          let subtexto = "";
          let valColor = "text-[var(--text-primary)]";
          // Delta REAL mes vs mes anterior desde monthlyData (antes Math.random).
          // Solo ingresos/gastos/utilidad tienen histórico fiable; el resto no muestra delta.
          const _lastM = monthlyData[monthlyData.length - 1];
          const _prevM = monthlyData[monthlyData.length - 2];
          let change: number | null = null;
          if (_lastM && _prevM) {
            const cur = def.key === "ingresos" ? _lastM.ingresos : def.key === "gastos" ? _lastM.gastos : def.key === "utilidad" ? _lastM.utilidad : null;
            const prv = def.key === "ingresos" ? _prevM.ingresos : def.key === "gastos" ? _prevM.gastos : def.key === "utilidad" ? _prevM.utilidad : null;
            if (cur !== null && prv !== null && prv !== 0) change = Math.round(((cur - prv) / Math.abs(prv)) * 100);
          }

          if (def.key === "margen") {
            display = `${val}%`;
            subtexto = val > 25 ? "Excelente" : val >= 15 ? "Aceptable" : "Bajo";
            valColor = val > 25 ? "text-[var(--data-success-500)]" : val >= 15 ? "text-[var(--data-warning-600)]" : "text-[var(--data-error-600)]";
          } else if (def.key === "utilidad") {
            display = `${val >= 0 ? "+" : "-"}${formatCurrency(Math.abs(val), { decimals: 0 })}`;
            valColor = val >= 0 ? "text-[var(--data-success-500)]" : "text-[var(--data-error-600)]";
          } else if (def.key === "igv") {
            display = formatCurrency(Math.abs(val), { decimals: 0 });
            subtexto = val > 0 ? "A pagar" : "Crédito fiscal";
            valColor = val > 0 ? "text-[var(--data-error-600)]" : "text-[var(--data-success-500)]";
          } else if (def.key === "puntoEq") {
            display = formatCurrency(val, { decimals: 0 });
            subtexto = "por día";
          } else {
            display = formatCurrency(val, { decimals: 0 });
          }

          // Zero-value gray styling
          if (val === 0 && def.key !== "margen") valColor = "text-[var(--text-tertiary)]";

          // Sparkline REAL desde la serie mensual (antes era val*0.7..0.95 fabricado).
          // Solo para Ingresos/Gastos/Utilidad, que existen en monthlyData.
          const sparkData = (monthlyData.length >= 2 && (def.key === "ingresos" || def.key === "gastos" || def.key === "utilidad"))
            ? monthlyData.map(m => ({ v: m[def.key as "ingresos" | "gastos" | "utilidad"] }))
            : null;

          return (
            <div key={def.key} className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-3 sm:p-4 hover:shadow-sm transition-shadow">
              <div className="flex items-center gap-3">
                <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${def.bg}`}>
                  <Icon className="h-5 w-5" style={{ color: def.color }} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-[var(--text-secondary)] truncate">{def.label}</p>
                  <div className="flex items-center gap-2">
                    <p className={`text-xl sm:text-2xl font-mono font-extrabold truncate ${valColor}`}>{display}</p>
                    {change !== null && (
                      <span className={`text-xs ${change >= 0 ? "text-[var(--data-success-500)]" : "text-[var(--data-error-500)]"}`}>
                        {change >= 0 ? "\u2191" : "\u2193"} {Math.abs(change)}%
                      </span>
                    )}
                  </div>
                  {subtexto && (
                    <p className="text-xs text-[var(--text-tertiary)] font-medium">{subtexto}</p>
                  )}
                  {sparkData && (
                    <div className="h-8 w-20 mt-1">
                      <ResponsiveContainer minWidth={0} width="100%" height="100%">
                        <LineChart data={sparkData}>
                          <Line type="monotone" dataKey="v" stroke={def.color} strokeWidth={1.5} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      </StaggerItem>

      {/* ════════ SECCION 2: Ingresos vs Gastos vs Utilidad (ComposedChart) ════════ */}
      <StaggerItem index={1}>
      {monthlyData.length > 0 && (
        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <FavStar id="ingresos-vs-gastos" favs={finFavs} />
              <div className="h-2 w-2 rounded-full bg-primary" />
              <p className="text-sm font-bold text-[var(--text-primary)]">Ingresos vs Gastos vs Utilidad</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--text-tertiary)] font-medium">Últimos 6 meses</span>
              <button onClick={() => setExpandedChart("ingresos-gastos")} className="p-1 hover:bg-[var(--surface-sunken)] rounded transition-colors" title="Expandir"><Maximize2 className="h-3.5 w-3.5 text-[var(--text-tertiary)]" /></button>
            </div>
          </div>
          <ResponsiveContainer minWidth={0} width="100%" height={320}>
            <ComposedChart data={monthlyData} margin={{ top: 10, right: 15, left: 0, bottom: 5 }}>
              <defs>
                <linearGradient id="gradIngresos" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.9} />
                  <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0.7} />
                </linearGradient>
                <linearGradient id="gradGastos" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={SERIE.gastos} stopOpacity={0.9} />
                  <stop offset="100%" stopColor={SERIE.gastos} stopOpacity={0.7} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--rule-base)" className="" vertical={false} />
              <XAxis dataKey="mes" tick={{ fontSize: 12, fill: "var(--text-secondary)" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "var(--text-secondary)" }} tickFormatter={formatSolesShort} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Legend
                formatter={(value: unknown) => { const v = String(value); const l: Record<string, string> = { ingresos: "Ingresos", gastos: "Gastos", utilidad: "Utilidad" }; return l[v] ?? v; }}
                iconType="circle"
                wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }}
              />
              <ReferenceLine y={0} stroke="var(--text-tertiary)" strokeDasharray="3 3" />
              <ReferenceLine y={15000} stroke={SERIE.alerta} strokeDasharray="5 5" label={{ value: "Meta: S/15,000", position: "right", fill: SERIE.alerta, fontSize: 11 }} />
              <Bar dataKey="ingresos" fill="url(#gradIngresos)" radius={[6, 6, 0, 0]} barSize={30} />
              <Bar dataKey="gastos" fill="url(#gradGastos)" radius={[6, 6, 0, 0]} barSize={30} />
              <Line type="monotone" dataKey="utilidad" stroke={SERIE.utilidad} strokeWidth={3} dot={{ r: 5, fill: SERIE.utilidad, strokeWidth: 2, stroke: "var(--surface-raised)" }} activeDot={{ r: 7 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
      </StaggerItem>

      {/* ════════ SECCION 3: Gastos por Categoría + Metodos de Ingreso (2 donuts) ════════ */}
      <StaggerItem index={2}>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Donut izquierda: Gastos por categoria */}
        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-4 sm:p-6">
          <div className="flex items-center gap-2 mb-4">
            <FavStar id="gastos-categoria" favs={finFavs} />
            <div className="h-2 w-2 rounded-full bg-[var(--data-error-500)]" />
            <p className="text-sm font-bold text-[var(--text-primary)]">Gastos por Categoría</p>
            <div className="flex-1" />
            {gastosPieFilter && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] text-xs font-bold">
                {gastosPieFilter}
                <button onClick={() => setGastosPieFilter(null)} className="hover:bg-primary/20 rounded-full p-0.5 transition-colors"><XIcon className="h-3 w-3" /></button>
              </span>
            )}
            <button onClick={() => setExpandedChart("gastos-cat")} className="p-1 hover:bg-[var(--surface-sunken)] rounded transition-colors" title="Expandir"><Maximize2 className="h-3.5 w-3.5 text-[var(--text-tertiary)]" /></button>
          </div>
          {expensesByCategory.length > 0 ? (
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <div className="relative w-45 h-45 shrink-0">
                <ResponsiveContainer minWidth={0} width="100%" height="100%">
                  <PieChart>
                    <Pie data={expensesByCategory} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value" stroke="none" className="cursor-pointer"
                      onClick={(_: unknown, idx: number) => setGastosPieFilter(prev => prev === expensesByCategory[idx]?.name ? null : expensesByCategory[idx]?.name ?? null)}>
                      {expensesByCategory.map((_, index) => (
                        <Cell key={`ec-${index}`} fill={DASHBOARD_EXPENSE_COLORS[index % DASHBOARD_EXPENSE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: unknown, name: unknown) => [formatCurrency(Number(value), { decimals: 0 }), String(name)]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="text-center">
                    <p className="text-xs text-[var(--text-tertiary)] font-medium uppercase">Total gastos</p>
                    <p className={cn("text-base font-extrabold", totalExpenses === 0 ? "text-[var(--text-tertiary)]" : "text-[var(--text-primary)]")}>{formatCurrency(totalExpenses, { decimals: 0 })}</p>
                  </div>
                </div>
              </div>
              <div className="flex-1 space-y-2 w-full">
                {expensesByCategory.filter(g => g.name).map((g, i) => (
                  <div key={g.name || i} className="flex items-center gap-2 text-xs">
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: DASHBOARD_EXPENSE_COLORS[i % DASHBOARD_EXPENSE_COLORS.length] }} />
                    <span className="flex-1 text-[var(--text-primary)] font-semibold truncate">{g.name}</span>
                    <span className="text-[var(--text-secondary)] font-mono">{formatCurrency(g.value, { decimals: 0 })}</span>
                    <span className="text-[var(--text-tertiary)] w-9 text-right font-bold">{totalExpenses > 0 ? Math.round((g.value / totalExpenses) * 100) : 0}%</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <EmptyState icon={BarChart3} title="Sin gastos registrados este mes" description="Los datos apareceran cuando registres ventas" />
          )}
        </div>

        {/* Donut derecha: Metodos de pago */}
        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-4 sm:p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="h-2 w-2 rounded-full bg-primary" />
            <p className="text-sm font-bold text-[var(--text-primary)]">Ingresos por Método de Pago</p>
          </div>
          {paymentMethods.length > 0 ? (
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <div className="relative w-45 h-45 shrink-0">
                <ResponsiveContainer minWidth={0} width="100%" height="100%">
                  <PieChart>
                    <Pie data={paymentMethods} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value" stroke="none">
                      {paymentMethods.map((entry, index) => (
                        <Cell key={`pm-${index}`} fill={colorMedioPago(entry.name) ?? PM_FALLBACK_COLORS[index % PM_FALLBACK_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: unknown, name: unknown) => [formatCurrency(Number(value), { decimals: 0 }), String(name)]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="text-center">
                    <p className="text-xs text-[var(--text-tertiary)] font-medium uppercase">Total ingresos</p>
                    <p className={cn("text-base font-extrabold", totalIncome === 0 ? "text-[var(--text-tertiary)]" : "text-[var(--text-primary)]")}>{formatCurrency(totalIncome, { decimals: 0 })}</p>
                  </div>
                </div>
              </div>
              <div className="flex-1 space-y-2 w-full">
                {paymentMethods.filter(g => g.name).map((g, i) => (
                  <div key={g.name || i} className="flex items-center gap-2 text-xs">
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: colorMedioPago(g.name) }} />
                    <span className="flex-1 text-[var(--text-primary)] font-semibold truncate">{g.name}</span>
                    <span className="text-[var(--text-secondary)] font-mono">{formatCurrency(g.value, { decimals: 0 })}</span>
                    <span className="text-[var(--text-tertiary)] w-9 text-right font-bold">{totalIncome > 0 ? Math.round((g.value / totalIncome) * 100) : 0}%</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <EmptyState icon={BarChart3} title="Sin ventas registradas este mes" description="Los datos apareceran cuando registres ventas" />
          )}
        </div>
      </div>
      </StaggerItem>

      {/* ════════ SECCION 4: Flujo de Caja Diario (AreaChart) ════════ */}
      <StaggerItem index={3}>
      {/* Guard: el array siempre tiene 30 elementos (uno por día), pero si todos
          son cero no hay movimientos reales → no mostrar ejes vacíos */}
      {cashFlow.some(d => d.ingresos > 0 || d.gastos > 0) && (
        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <FavStar id="flujo-caja" favs={finFavs} />
            <div className="h-2 w-2 rounded-full bg-primary" />
              <p className="text-sm font-bold text-[var(--text-primary)]">Flujo de Caja</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--text-tertiary)] font-medium">Últimos 30 días</span>
              <button onClick={() => setExpandedChart("flujo-caja")} className="p-1 hover:bg-[var(--surface-sunken)] rounded transition-colors" title="Expandir"><Maximize2 className="h-3.5 w-3.5 text-[var(--text-tertiary)]" /></button>
            </div>
          </div>
          <ResponsiveContainer minWidth={0} width="100%" height={280}>
            <AreaChart data={cashFlow} margin={{ top: 10, right: 15, left: 0, bottom: 5 }}>
              <defs>
                <linearGradient id="gradCashIngresos" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradCashGastos" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={SERIE.gastos} stopOpacity={0.2} />
                  <stop offset="95%" stopColor={SERIE.gastos} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradCashBalance" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--rule-base)" className="" vertical={false} />
              <XAxis dataKey="dia" tick={{ fontSize: 10, fill: "var(--text-tertiary)" }} interval={4} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "var(--text-tertiary)" }} tickFormatter={formatSolesShort} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <ReferenceLine y={0} stroke="var(--text-tertiary)" strokeDasharray="4 4" label={{ value: "S/0", position: "left", fill: "var(--text-tertiary)", fontSize: 10 }} />
              <Area type="monotone" dataKey="ingresos" stroke="var(--accent)" fill="url(#gradCashIngresos)" strokeWidth={1.5} />
              <Area type="monotone" dataKey="gastos" stroke={SERIE.gastos} fill="url(#gradCashGastos)" strokeWidth={1.5} />
              <Area type="monotone" dataKey="balance" stroke="var(--color-primary)" fill="url(#gradCashBalance)" strokeWidth={2.5} dot={false} />
              <Legend
                formatter={(value: unknown) => { const v = String(value); const l: Record<string, string> = { ingresos: "Ingresos", gastos: "Gastos", balance: "Balance" }; return l[v] ?? v; }}
                iconType="circle"
                wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
      </StaggerItem>

      {/* ════════ SECCION 5: Proyeccion del Mes ════════ */}
      <StaggerItem index={4}>
      {projection && (
        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-4 sm:p-6">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="h-4 w-4 text-[var(--text-primary)]" strokeWidth={1.75} />
            <p className="text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">Proyección {mesCapitalized}</p>
          </div>
          <div className="grid grid-cols-3 gap-4 mb-5">
            <div className="text-center p-3 bg-white/60 rounded-xl">
              <p className="text-xs font-bold text-[var(--text-tertiary)] uppercase mb-1">Ventas proyectadas</p>
              <p className={cn("text-lg sm:text-xl font-extrabold", projVentas === 0 ? "text-[var(--text-tertiary)]" : "text-primary")}>{formatCurrency(projVentas, { decimals: 0 })}</p>
            </div>
            <div className="text-center p-3 bg-white/60 rounded-xl">
              <p className="text-xs font-bold text-[var(--text-tertiary)] uppercase mb-1">Gastos proyectados</p>
              <p className={cn("text-lg sm:text-xl font-extrabold", projGastos === 0 ? "text-[var(--text-tertiary)]" : "text-[var(--data-error-500)]")}>{formatCurrency(projGastos, { decimals: 0 })}</p>
            </div>
            <div className="text-center p-3 bg-white/60 rounded-xl">
              <p className="text-xs font-bold text-[var(--text-tertiary)] uppercase mb-1">Utilidad estimada</p>
              <p className={cn("text-lg sm:text-xl font-extrabold", projUtilidad === 0 ? "text-[var(--text-tertiary)]" : projUtilidad >= 0 ? "text-[var(--data-success-500)]" : "text-[var(--data-error-500)]")}>
                {projUtilidad >= 0 ? "+" : ""}{formatCurrency(Math.abs(projUtilidad), { decimals: 0 })}
              </p>
            </div>
          </div>
          {/* Progress bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-[var(--text-secondary)]">
              <span className="font-medium">Dia {projection.diasTranscurridos} de {projection.diasTotales}</span>
              <span className="font-bold">{Math.round(projProgreso)}% del mes</span>
            </div>
            <div className="h-3 bg-[var(--surface-sunken)] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-[var(--dur-slower)]"
                style={{
                  width: `${projProgreso}%`,
                  backgroundColor: projPctTarget > 70 ? "var(--accent)" : projPctTarget >= 40 ? SERIE.alerta : SERIE.gastos,
                }}
              />
            </div>
            <p className="text-xs text-[var(--text-secondary)] text-center">
              Ventas actuales: <span className="font-bold text-[var(--text-primary)]">{formatCurrency(Math.round(projection.ventasMes), { decimals: 0 })}</span> de {formatCurrency(projVentas, { decimals: 0 })} proyectados
              <span className={`ml-2 font-bold ${projPctTarget > 70 ? "text-[var(--data-success-500)]" : projPctTarget >= 40 ? "text-[var(--data-warning-500)]" : "text-[var(--data-error-500)]"}`}>
                ({projPctTarget}%)
              </span>
            </p>
          </div>
        </div>
      )}
      </StaggerItem>

      {/* ════════ SECCION 6: Resumen Fiscal Mejorado ════════ */}
      <StaggerItem index={5}>
      {fiscal && (
        <div className="bg-[var(--surface-raised)] border-2 border-secondary/40 rounded-xl p-4 sm:p-6">
          <div className="flex items-center gap-2 mb-4">
            <Calculator className="h-5 w-5 text-secondary" />
            <p className="text-sm font-bold text-[var(--text-primary)]">Resumen Fiscal — {mesCapitalized}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--rule-base)]">
                  <th className="text-left py-2 text-xs font-bold text-[var(--text-tertiary)]">Concepto</th>
                  <th className="text-right py-2 text-xs font-bold text-[var(--text-tertiary)]">Monto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                <tr>
                  <td className="py-2.5 text-[var(--text-secondary)]">Ventas gravadas</td>
                  <td className="py-2.5 text-right font-bold font-mono text-[var(--text-primary)]">{formatCurrency(Math.round(fiscal.ventas), { decimals: 0 })}</td>
                </tr>
                <tr>
                  <td className="py-2.5 text-[var(--text-secondary)]">IGV cobrado (18%)</td>
                  <td className="py-2.5 text-right font-bold font-mono text-[var(--text-primary)]">{formatCurrency(Math.round(fiscIgvCobrado), { decimals: 0 })}</td>
                </tr>
                <tr>
                  <td className="py-2.5 text-[var(--text-secondary)]">Compras deducibles</td>
                  <td className="py-2.5 text-right font-bold font-mono text-[var(--text-primary)]">{formatCurrency(Math.round(fiscal.compras), { decimals: 0 })}</td>
                </tr>
                <tr>
                  <td className="py-2.5 text-[var(--text-secondary)]">IGV pagado</td>
                  <td className="py-2.5 text-right font-bold font-mono text-[var(--text-primary)]">{formatCurrency(Math.round(fiscIgvPagado), { decimals: 0 })}</td>
                </tr>
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[var(--rule-base)]">
                  <td className="pt-3 pb-1 font-bold text-[var(--text-primary)]">IGV a pagar</td>
                  <td className={`pt-3 pb-1 text-right font-extrabold font-mono text-lg ${fiscIgvNeto > 0 ? "text-[var(--data-error-500)]" : "text-[var(--data-success-500)]"}`}>
                    {fiscIgvNeto > 0 ? "" : "-"}{formatCurrency(Math.abs(Math.round(fiscIgvNeto)), { decimals: 0 })}
                    {fiscIgvNeto <= 0 && <span className="text-xs font-normal ml-1.5">(credito fiscal)</span>}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="text-xs text-[var(--text-tertiary)] mt-3 italic">
            Referencia aproximada — consulte con su contador
          </p>
        </div>
      )}
      </StaggerItem>

      {/* ════════ SECCION 7: Indicadores de Salud (Gauges) ════════ */}
      <StaggerItem index={6}>
      {healthScore && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="h-2 w-2 rounded-full" style={{ backgroundColor: healthScore.total > 70 ? "var(--accent)" : healthScore.total >= 40 ? SERIE.alerta : SERIE.gastos }} />
            <p className="text-sm font-bold text-[var(--text-primary)]">
              Indicadores de Salud Financiera
              <span className="ml-2 text-xs font-normal px-2 py-0.5 rounded-full" style={{
                backgroundColor: healthScore.total > 70 ? "color-mix(in oklab, var(--accent) 12%, transparent)" : healthScore.total >= 40 ? "color-mix(in oklab, var(--data-warning-500) 12%, transparent)" : "color-mix(in oklab, var(--data-error-500) 12%, transparent)",
                color: healthScore.total > 70 ? "var(--accent)" : healthScore.total >= 40 ? SERIE.alerta : SERIE.gastos,
              }}>
                {healthScore.total}/100 — {healthScore.total > 70 ? "Saludable" : healthScore.total >= 40 ? "Precaucion" : "Critico"}
              </span>
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <GaugeChart
              value={healthScore.margen}
              max={100}
              label="Margen de utilidad"
              unit="%"
              color={healthScore.margen > 25 ? "var(--accent)" : healthScore.margen >= 15 ? SERIE.alerta : SERIE.gastos}
            />
            <GaugeChart
              value={healthScore.liquidez}
              max={4}
              label="Liquidez"
              unit="x"
              color={healthScore.liquidez > 2 ? "var(--accent)" : healthScore.liquidez >= 1 ? SERIE.alerta : SERIE.gastos}
            />
            <GaugeChart
              value={healthScore.deudaRatio}
              max={100}
              label="Endeudamiento"
              unit="%"
              color={healthScore.deudaRatio < 10 ? "var(--accent)" : healthScore.deudaRatio <= 30 ? SERIE.alerta : SERIE.gastos}
            />
          </div>
        </div>
      )}
      </StaggerItem>

      {/* ════════ SECCION 8: Deudas y Cobros Pendientes ════════ */}
      <StaggerItem index={7}>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Debo a proveedores */}
        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-4 sm:p-6">
          <div className="flex items-center gap-2 mb-4">
            <Truck className="h-4 w-4 text-secondary" />
            <p className="text-sm font-bold text-[var(--text-primary)]">Debo a proveedores</p>
          </div>
          {topPayables.length > 0 ? (
            <ResponsiveContainer minWidth={0} width="100%" height={Math.max(topPayables.length * 44, 120)}>
              <BarChart data={topPayables} layout="vertical" margin={{ top: 0, right: 60, left: 0, bottom: 0 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "var(--text-secondary)" }} width={120} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ borderRadius: "10px", border: "1px solid var(--rule-base)", fontSize: "12px" }}
                  formatter={(value: unknown) => [formatCurrency(Number(value), { decimals: 0 }), "Monto"]}
                />
                <Bar dataKey="monto" radius={[0, 6, 6, 0]} barSize={20}>
                  {topPayables.map((entry, index) => (
                    <Cell key={`pay-${index}`} fill={entry.vencido ? SERIE.gastos : SERIE.alerta} />
                  ))}
                  <LabelList dataKey="monto" position="right" formatter={(v: unknown) => formatCurrency(Number(v), { decimals: 0 })} style={{ fontSize: 10, fill: "var(--text-secondary)", fontWeight: 600 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-center py-6">
              <Truck className="h-8 w-8 text-[var(--text-tertiary)] mx-auto mb-2" />
              <p className="text-sm text-[var(--text-tertiary)]">Sin deudas a proveedores</p>
            </div>
          )}
          {topPayables.some(p => p.vencido) && (
            <div className="flex items-center gap-2 mt-3 text-xs text-[var(--text-tertiary)]">
              <div className="w-2 h-2 rounded-full bg-[var(--data-error-500)]" /> Vencido
              <div className="w-2 h-2 rounded-full bg-secondary ml-2" /> Al dia
            </div>
          )}
        </div>

        {/* Me deben (fiados) */}
        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-4 sm:p-6">
          <div className="flex items-center gap-2 mb-4">
            <CreditCard className="h-4 w-4 text-[var(--data-warning-500)]" />
            <p className="text-sm font-bold text-[var(--text-primary)]">Me deben (fiados)</p>
          </div>
          {topFiados.length > 0 ? (
            <ResponsiveContainer minWidth={0} width="100%" height={Math.max(topFiados.length * 44, 120)}>
              <BarChart data={topFiados} layout="vertical" margin={{ top: 0, right: 60, left: 0, bottom: 0 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "var(--text-secondary)" }} width={120} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ borderRadius: "10px", border: "1px solid var(--rule-base)", fontSize: "12px" }}
                  formatter={(value: unknown) => [formatCurrency(Number(value), { decimals: 0 }), "Monto"]}
                />
                <Bar dataKey="monto" radius={[0, 6, 6, 0]} barSize={20}>
                  {topFiados.map((entry, index) => (
                    <Cell key={`fia-${index}`} fill={entry.vencido ? SERIE.gastos : SERIE.alerta} />
                  ))}
                  <LabelList dataKey="monto" position="right" formatter={(v: unknown) => formatCurrency(Number(v), { decimals: 0 })} style={{ fontSize: 10, fill: "var(--text-secondary)", fontWeight: 600 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-center py-6">
              <CreditCard className="h-8 w-8 text-[var(--text-tertiary)] mx-auto mb-2" />
              <p className="text-sm text-[var(--text-tertiary)]">Sin fiados pendientes</p>
            </div>
          )}
          {topFiados.some(f => f.vencido) && (
            <div className="flex items-center gap-2 mt-3 text-xs text-[var(--text-tertiary)]">
              <div className="w-2 h-2 rounded-full bg-[var(--data-error-500)]" /> Vencido
              <div className="w-2 h-2 rounded-full bg-[var(--data-warning-500)] ml-2" /> Al dia
            </div>
          )}
        </div>
      </div>
      </StaggerItem>

      {/* ════════ SECCION 9: Mejora 19 — Salud del Negocio (gauge 0-100) ════════ */}
      {healthScore && (
        <StaggerItem index={8}>
          <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-4 sm:p-6">
            <div className="flex items-center gap-2 mb-4">
              <div className="h-2 w-2 rounded-full" style={{ backgroundColor: healthScore.total > 70 ? "var(--accent)" : healthScore.total >= 40 ? SERIE.alerta : SERIE.gastos }} />
              <p className="text-sm font-bold text-[var(--text-primary)]">Salud del Negocio</p>
              <span className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full" style={{
                backgroundColor: healthScore.total > 70 ? "color-mix(in oklab, var(--accent) 12%, transparent)" : healthScore.total >= 40 ? "color-mix(in oklab, var(--data-warning-500) 12%, transparent)" : "color-mix(in oklab, var(--data-error-500) 12%, transparent)",
                color: healthScore.total > 70 ? "var(--accent)" : healthScore.total >= 40 ? SERIE.alerta : SERIE.gastos,
              }}>
                {healthScore.total}/100
              </span>
            </div>
            <div className="flex flex-col sm:flex-row items-center gap-6">
              {/* Gauge semicircular */}
              <div className="relative w-40 h-22.5 shrink-0">
                <ResponsiveContainer minWidth={0} width="100%" height={90}>
                  <PieChart>
                    <Pie
                      data={[{ name: "score", value: healthScore.total }, { name: "empty", value: 100 - healthScore.total }]}
                      cx="50%" cy="100%" startAngle={180} endAngle={0} innerRadius={50} outerRadius={70} dataKey="value" stroke="none"
                    >
                      <Cell fill={healthScore.total > 70 ? "var(--accent)" : healthScore.total >= 40 ? SERIE.alerta : SERIE.gastos} />
                      <Cell fill="var(--rule-base)" className="" />
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex items-end justify-center pb-1 pointer-events-none">
                  <span className="text-2xl font-extrabold" style={{ color: healthScore.total > 70 ? "var(--accent)" : healthScore.total >= 40 ? SERIE.alerta : SERIE.gastos }}>
                    {healthScore.total}
                  </span>
                </div>
              </div>
              {/* Breakdown */}
              <div className="flex-1 w-full space-y-3">
                {[
                  { label: "Margen bruto", pts: healthScore.margenPts, max: 33, detail: `${Number(healthScore.margen).toFixed(1)}%`, desc: "Cuanto ganas por cada sol vendido" },
                  { label: "Liquidez", pts: healthScore.liquidezPts, max: 33, detail: `${Number(healthScore.liquidez).toFixed(1)}x`, desc: "Efectivo vs gastos mensuales" },
                  { label: "Rotacion inv.", pts: 17, max: 25, detail: "Est.", desc: "Que tan rápido vendes tu stock" },
                  { label: "Crecimiento", pts: Math.min(25, Math.max(5, monthlyData.length >= 2 && monthlyData[monthlyData.length - 2].ingresos > 0 ? Math.round(((monthlyData[monthlyData.length - 1].ingresos - monthlyData[monthlyData.length - 2].ingresos) / monthlyData[monthlyData.length - 2].ingresos) * 25 + 12.5) : 12)), max: 25, detail: monthlyData.length >= 2 ? `${Math.round(((monthlyData[monthlyData.length - 1].ingresos - monthlyData[monthlyData.length - 2].ingresos) / Math.max(monthlyData[monthlyData.length - 2].ingresos, 1)) * 100)}%` : "N/A", desc: "Ventas vs mes anterior" },
                ].map(f => (
                  <div key={f.label}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-[var(--text-secondary)]">{f.label}</span>
                      <span className="text-xs font-bold text-[var(--text-secondary)]">{f.detail}</span>
                    </div>
                    <div className="h-2 bg-[var(--surface-sunken)] rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-[var(--dur-slow)]" style={{ width: `${(f.pts / f.max) * 100}%`, backgroundColor: f.pts >= f.max * 0.8 ? "var(--accent)" : f.pts >= f.max * 0.5 ? SERIE.alerta : SERIE.gastos }} />
                    </div>
                    <p className="text-xs text-[var(--text-tertiary)] mt-0.5">{f.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </StaggerItem>
      )}

      {/* ════════ SECCION 10: Mejora 20 — Comparativo entre meses ════════ */}
      <StaggerItem index={9}>
        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <p className="text-sm font-bold text-[var(--text-primary)]">Comparar Meses</p>
            <div className="flex items-center gap-2">
              <select value={cmpMonth1} onChange={e => setCmpMonth1(e.target.value)} className="text-xs border border-[var(--rule-base)] rounded-lg px-2 py-1 bg-[var(--surface-raised)] text-[var(--text-primary)]">
                {monthlyData.map(m => <option key={m.fullMonth} value={m.mes}>{m.mes}</option>)}
              </select>
              <span className="text-xs text-[var(--text-tertiary)]">vs</span>
              <select value={cmpMonth2} onChange={e => setCmpMonth2(e.target.value)} className="text-xs border border-[var(--rule-base)] rounded-lg px-2 py-1 bg-[var(--surface-raised)] text-[var(--text-primary)]">
                {monthlyData.map(m => <option key={m.fullMonth} value={m.mes}>{m.mes}</option>)}
              </select>
            </div>
          </div>
          {(() => {
            const d1 = monthlyData.find(m => m.mes === cmpMonth1);
            const d2 = monthlyData.find(m => m.mes === cmpMonth2);
            if (!d1 || !d2) return <EmptyState icon={BarChart3} title="Selecciona meses con datos" description="Los datos apareceran cuando registres ventas" />;
            // Sin datos reales en ninguno de los dos meses — no mostrar gráfico vacío
            const sinDatos = d1.ingresos === 0 && d1.gastos === 0 && d2.ingresos === 0 && d2.gastos === 0;
            if (sinDatos) return <EmptyState icon={BarChart3} title="Sin ventas en esos meses" description="Registra ventas y gastos para ver la comparativa" />;
            const diffIngresos = d1.ingresos > 0 ? Math.round(((d2.ingresos - d1.ingresos) / d1.ingresos) * 100) : 0;
            const diffGastos = d1.gastos > 0 ? Math.round(((d2.gastos - d1.gastos) / d1.gastos) * 100) : 0;
            const compareData = [
              { tipo: "Ingresos", [cmpMonth1]: d1.ingresos, [cmpMonth2]: d2.ingresos },
              { tipo: "Gastos", [cmpMonth1]: d1.gastos, [cmpMonth2]: d2.gastos },
              { tipo: "Utilidad", [cmpMonth1]: d1.utilidad, [cmpMonth2]: d2.utilidad },
            ];
            return (
              <>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="text-center p-2 bg-[var(--surface-sunken)] rounded-xl">
                    <p className="text-xs text-[var(--text-tertiary)] uppercase font-bold">Ventas</p>
                    <p className={cn("text-sm font-bold", diffIngresos >= 0 ? "text-[var(--data-success-500)]" : "text-[var(--data-error-500)]")}>{diffIngresos >= 0 ? "+" : ""}{diffIngresos}%</p>
                  </div>
                  <div className="text-center p-2 bg-[var(--surface-sunken)] rounded-xl">
                    <p className="text-xs text-[var(--text-tertiary)] uppercase font-bold">Gastos</p>
                    <p className={cn("text-sm font-bold", diffGastos <= 0 ? "text-[var(--data-success-500)]" : "text-[var(--data-error-500)]")}>{diffGastos >= 0 ? "+" : ""}{diffGastos}%</p>
                  </div>
                </div>
                <ResponsiveContainer minWidth={0} width="100%" height={220}>
                  <BarChart data={compareData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(107,114,128,0.12)" />
                    <XAxis dataKey="tipo" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={formatSolesShort} tick={{ fontSize: 11 }} />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend />
                    <Bar dataKey={cmpMonth1} fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey={cmpMonth2} fill={SERIE.alerta} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </>
            );
          })()}
        </div>
      </StaggerItem>

      {/* ════════ Expand Chart Modals ════════ */}
      {expandedChart && (
        <ChartExpandModal title={expandedChart === "ingresos-gastos" ? "Ingresos vs Gastos vs Utilidad" : expandedChart === "flujo-caja" ? "Flujo de Caja" : expandedChart === "gastos-cat" ? "Gastos por Categoría" : expandedChart} onClose={() => setExpandedChart(null)}>
            {expandedChart === "ingresos-gastos" && monthlyData.length > 0 && (
              <ResponsiveContainer minWidth={0} width="100%" height={500}>
                <ComposedChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--rule-base)" />
                  <XAxis dataKey="mes" tick={{ fontSize: 14 }} />
                  <YAxis tickFormatter={formatSolesShort} tick={{ fontSize: 13 }} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend />
                  <Bar dataKey="ingresos" fill="var(--color-primary)" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="gastos" fill={SERIE.gastos} radius={[6, 6, 0, 0]} />
                  <Line type="monotone" dataKey="utilidad" stroke={SERIE.utilidad} strokeWidth={3} dot={{ r: 5, fill: SERIE.utilidad }} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
            {expandedChart === "flujo-caja" && cashFlow.some(d => d.ingresos > 0 || d.gastos > 0) && (
              <ResponsiveContainer minWidth={0} width="100%" height={500}>
                <AreaChart data={cashFlow}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--rule-base)" />
                  <XAxis dataKey="dia" tick={{ fontSize: 12 }} />
                  <YAxis tickFormatter={formatSolesShort} tick={{ fontSize: 13 }} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="ingresos" stroke="var(--accent)" fill="color-mix(in oklab, var(--accent) 12%, transparent)" strokeWidth={2} />
                  <Area type="monotone" dataKey="gastos" stroke={SERIE.gastos} fill={SERIE.gastos} fillOpacity={0.12} strokeWidth={2} />
                  <Area type="monotone" dataKey="balance" stroke="var(--color-primary)" fill="var(--color-primary)30" strokeWidth={3} />
                </AreaChart>
              </ResponsiveContainer>
            )}
            {expandedChart === "gastos-cat" && expensesByCategory.length > 0 && (
              <ResponsiveContainer minWidth={0} width="100%" height={500}>
                <PieChart>
                  <Pie data={expensesByCategory} cx="50%" cy="50%" innerRadius={100} outerRadius={200} paddingAngle={3} dataKey="value" label>
                    {expensesByCategory.map((_, index) => (
                      <Cell key={`ec-big-${index}`} fill={DASHBOARD_EXPENSE_COLORS[index % DASHBOARD_EXPENSE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: unknown, name: unknown) => [formatCurrency(Number(value), { decimals: 0 }), String(name)]} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
        </ChartExpandModal>
      )}

    </div>
  );
}


// ── Main Component ───────────────────────────────────────────────────────────

export default function FinanzasModule({ initialTab }: { initialTab?: string } = {}) {
  // Se guarda la SECCIÓN, no la pestaña: volver a "Mi Plata" tiene que devolver
  // a "Fiados" si ahí estabas, no al padre que lo contiene.
  /**
   * La sección vive en `?vista=`: link compartible, atrás del navegador y
   * destino del buscador global.
   *
   * Lo que se guarda es la SECCIÓN (la hoja), no la pestaña: volver a "Mi Plata"
   * tiene que devolver a "Fiados" si ahí estabas, no al padre que lo contiene.
   * Por eso todo pasa por `ubicar()`, que traduce cualquier nombre —viejo o
   * nuevo, pestaña o sección— a la hoja donde de verdad cae.
   */
  const { vista, irA: irAVista } = useVistaModulo(
    MODULE_ID,
    VISTAS,
    ubicar(undefined).sub,
    initialTab ? ubicar(initialTab).sub : undefined,
  );
  const ubic = ubicar(vista);
  const tab = ubic.tab;
  const sub = ubic.sub;
  const irA = useCallback((id: string) => irAVista(ubicar(id).sub), [irAVista]);
  // Un atajo del menú puede llegar con el módulo ya montado (`?tab=fiados`).
  useEffect(() => { if (initialTab) irAVista(ubicar(initialTab).sub); }, [initialTab, irAVista]);

  const secciones = SUBS[tab];

  // Auto-refresh every 5 minutes
  const [refreshKey, setRefreshKey] = useState(0);
  const autoRefresh = useAutoRefresh({
    intervalSeconds: 300,
    onRefresh: useCallback(() => setRefreshKey(k => k + 1), []),
    enabled: sub === "resumen",
  });

  return (
    <div className="space-y-6">
      {/* Brandon 2026-06-19: el header "Mi Plata" se muestra en TODAS las
          sub-secciones — incluidas las foldeadas (Por cobrar, Fiados, Préstamos,
          Adelantos, Activos, Scoring) — igual que Tesorería/Reportes. El módulo
          hijo conserva su propio sub-header debajo, dando jerarquía clara
          "Mi Plata → <sección>". Antes las foldeadas solo tenían un breadcrumb. */}
      <AdminModuleHeader
        eyebrow="Finanzas · Reportes"
        title="Mi Plata"
        description="Pérdidas y ganancias, gastos, flujo de caja y reportes financieros."
        icon={Wallet}
      >
        {sub === "resumen" && (
          <AutoRefreshControl
            secondsLeft={autoRefresh.secondsLeft}
            paused={autoRefresh.paused}
            isActive={autoRefresh.isActive}
            onTogglePause={autoRefresh.togglePause}
            onRefreshNow={autoRefresh.refreshNow}
          />
        )}
        <button
          onClick={generarReporteBancario}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-primary hover:bg-primary/90 transition-colors min-h-[44px]"
        >
          Reporte Bancario
        </button>
      </AdminModuleHeader>

      <AdminTabBar
        tabs={TABS}
        wrap
        activeTab={tab}
        onTabChange={irA}
        moduleId="finanzas"
      >
      {/* Segundo nivel: sólo aparece en las pestañas que agrupan más de una
          cosa. Con una sola sección, una barra de un botón sería ruido. */}
      {secciones && secciones.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-1.5" role="tablist" aria-label="Secciones">
          {secciones.map((sc) => (
            <button
              key={sc.id}
              type="button"
              role="tab"
              aria-selected={sub === sc.id}
              onClick={() => irA(sc.id)}
              className={cn(
                "rounded-xl px-3.5 py-2 text-sm font-bold transition-colors min-h-[40px]",
                sub === sc.id
                  ? "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
                  : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]",
              )}
            >
              <span className="inline-flex items-center gap-2">
                <sc.icon className="h-4 w-4" aria-hidden />
                {sc.label}
              </span>
            </button>
          ))}
        </div>
      )}
      {sub === "resumen" && (
        <div className="space-y-6" key={refreshKey}>
          <FinanzasDashboard />
          {/* Cuatro de estas cinco tarjetas son la versión corta de otra sección
              —resultado, caja, presupuesto, reportes— y colgaban al final de un
              tablero que ya medía casi 5000 px. La quinta, el detector de fugas,
              no vive en ninguna otra parte: por eso queda afuera del pliegue.

              Plegadas y no borradas: un resumen automático al lado del tablero
              sirve cuando se lo busca; lo que no puede es cobrarle mil píxeles
              de scroll a quien entró a mirar el gráfico de arriba. */}
          <MoneyLeakDetector />
          <details className="group rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
              <ChevronRight className="h-4 w-4 shrink-0 transition-transform group-open:rotate-90" aria-hidden />
              Resúmenes automáticos
              <span className="font-medium text-[var(--text-tertiary)]">
                · resultado del mes, proyección, presupuesto y reporte semanal
              </span>
            </summary>
            <div className="grid grid-cols-1 gap-4 border-t border-[var(--rule-base)] p-4 lg:grid-cols-2">
              <ProfitLossAutoCard />
              <MonthProjectionCard />
              <BudgetAlertWidget />
              <WeeklyReportCard />
            </div>
          </details>
        </div>
      )}
      {sub === "pl" && (
        <div className="space-y-6">
          <PLTab />
          <ComparativoMensual />
        </div>
      )}
      {sub === "gastos" && <ExpensesTab />}
      {sub === "rentabilidad" && (
        <div className="space-y-6">
          <ProfitabilityTab />
          <BreakEvenDashboard />
        </div>
      )}
      {sub === "presupuesto" && (
        <div className="space-y-6">
          <BudgetVsRealTab />
          <PresupuestoMensualTab />
        </div>
      )}
      {/* La proyección a 13 semanas reemplazó a la de 30 días: eran la misma
          pregunta con menos horizonte, y el propio código las rotulaba
          "legacy" mientras las seguía mostrando debajo. */}
      {sub === "flujo-caja" && <CashflowRollingTable />}
      {sub === "reportes" && (
        <div className="space-y-6">
          <ReporteMensualTab />
          <div className="border-t border-[var(--rule-base)] dark:border-white/10 pt-6">
            <ReportsTab />
            <div className="mt-4"><ImportExportTab /></div>
          </div>
          <div className="border-t border-[var(--rule-base)] dark:border-white/10 pt-6">
            <HistorialCierresTab />
          </div>
        </div>
      )}
      {sub === "comparador" && <PeriodComparatorTab />}
      {sub === "tesoreria" && (
        <Suspense fallback={<S />}>
          <TreasuryDashboard />
        </Suspense>
      )}
      {sub === "fiados" && <FiadosModule />}
      {sub === "prestamos" && <PrestamosModule />}
      {sub === "adelantos" && <AdelantosModule />}
      {sub === "activos" && <ActivosModule />}
      {sub === "por-cobrar" && <PorCobrarDashboard onIr={irA} />}
      {sub === "scoring" && <ScoringCrediticioTab />}
      </AdminTabBar>
    </div>
  );
}
