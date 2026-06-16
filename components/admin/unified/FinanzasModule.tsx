"use client";

import { logger } from "@/lib/logger";
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
  FileBarChart, Waves, Calculator,
  DollarSign, Wallet,
  BarChart3, Percent, Truck, CreditCard, RefreshCw, AlertTriangle, Maximize2, X as XIcon,
  Sparkles, Landmark,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/currency";
import { ChartTooltip } from "@/lib/chart-tooltip";
import { formatSolesShort } from "@/lib/chart-helpers";
import { Suspense } from "react";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";
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
const CashFlowProjection = dynamic(() => import("@/components/admin/CashFlowProjection"), { loading: S });
const CashflowRollingTable = dynamic(() => import("@/components/admin/finance/CashflowRollingTable"), { loading: S });
const BreakEvenDashboard = dynamic(() => import("@/components/admin/BreakEvenDashboard"), { loading: S });
// LoanCalculator → movido a PrestamosModule (evitar duplicación)
// CommissionCalculator → movido a POSCajaModule (es operativo de ventas)
// PaymentCalendar → movido a TesoreriaModule (es operativo de tesorería)
const MoneyLeakDetector = dynamic(() => import("@/components/admin/MoneyLeakDetector"), { loading: S });
const WeeklyCashFlowTable = dynamic(() => import("@/components/admin/WeeklyCashFlowTable"), { loading: S });
const HistorialCierresTab = dynamic(() => import("@/components/admin/HistorialCierresTab"), { loading: S });
const PresupuestoMensualTab = dynamic(() => import("@/components/admin/finanzas/PresupuestoMensualTab"), { loading: S });
const ReporteMensualTab     = dynamic(() => import("@/components/admin/ReporteMensualTab"),              { loading: S });
const ComparativeReportsTab = dynamic(() => import("@/components/admin/ComparativeReportsTab"),           { ssr: false, loading: S });
const BusinessIntelligenceTab = dynamic(() => import("@/components/admin/BusinessIntelligenceTab"), { loading: S });
const CustomKPITab = dynamic(() => import("@/components/admin/CustomKPITab"), { loading: S });
const CompetitorPriceTracker = dynamic(() => import("@/components/admin/CompetitorPriceTracker"), { loading: S });
// DocumentosEmitidosTab → movido a categoría Documentos (no es finanzas)
const TreasuryDashboard = dynamic(() => import("@/components/admin/TreasuryDashboard"), { loading: S });

const MODULE_ID = "plata";

const TABS = [
  { id: "dashboard" as const,        label: "Dashboard",               icon: BarChart3   },
  { id: "pl" as const,               label: "Pérdidas y Ganancias",     icon: TrendingUp  },
  { id: "gastos" as const,           label: "Gastos y Costos",          icon: TrendingDown },
  { id: "rentabilidad" as const,     label: "Rentabilidad",             icon: PieChartIcon },
  { id: "presupuesto" as const,      label: "Presupuesto",              icon: Target       },
  { id: "flujo-caja" as const,       label: "Flujo de Caja",            icon: Waves        },
  { id: "reportes" as const,         label: "Reportes",                 icon: FileBarChart },
  { id: "inteligencia" as const,     label: "Inteligencia",             icon: Sparkles     },
  { id: "tesoreria" as const,        label: "Tesorería",                icon: Landmark     },
];

 
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

      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Reporte Financiero - Buleje</title><style>body{font-family:'Segoe UI',Arial,sans-serif;max-width:800px;margin:0 auto;padding:40px;color:#333;font-size:14px}h1{color:var(--color-primary);border-bottom:3px solid var(--color-primary);padding-bottom:10px;font-size:22px}h2{color:#333;margin-top:30px;font-size:16px;border-bottom:1px solid #ddd;padding-bottom:5px}table{width:100%;border-collapse:collapse;margin:15px 0}th{background:#f8f9fa;padding:10px 8px;border:1px solid #ddd;text-align:left;font-size:12px;text-transform:uppercase;letter-spacing:0.5px}td{padding:8px;font-size:13px}.kpi{display:inline-block;background:#f8f9fa;border:1px solid #ddd;border-radius:8px;padding:15px 20px;margin:5px;text-align:center;min-width:150px}.kpi-label{font-size:11px;color:#666;text-transform:uppercase;letter-spacing:0.5px}.kpi-value{font-size:20px;font-weight:bold;color:var(--color-primary);margin-top:4px}.footer{margin-top:40px;padding-top:15px;border-top:1px solid #ddd;color:#999;font-size:11px;text-align:center}@media print{body{padding:20px}}</style></head><body><h1>REPORTE FINANCIERO — Buleje</h1><p style="color:#666;font-size:12px">Período: últimos 6 meses &middot; Generado el ${fecha}</p><h2>1. Datos del Negocio</h2><table><tr><td style="padding:8px;border:1px solid #ddd;width:200px;font-weight:bold">Razon Social</td><td style="padding:8px;border:1px solid #ddd">Buleje</td></tr><tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold">Ubicacion</td><td style="padding:8px;border:1px solid #ddd">Pucallpa, Ucayali, Peru</td></tr><tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold">Giro</td><td style="padding:8px;border:1px solid #ddd">Comercio minorista - Abarrotes</td></tr></table><h2>2. Resumen de Ingresos</h2><table><thead><tr><th>Mes</th><th style="text-align:right">Ingresos</th><th style="text-align:right">Gastos</th><th style="text-align:right">Utilidad</th></tr></thead><tbody>${tablaRows}<tr style="background:#f0f0f0;font-weight:bold"><td style="padding:8px;border:1px solid #ddd">TOTAL</td><td style="padding:8px;border:1px solid #ddd;text-align:right">S/${totalIngresos.toLocaleString("es-PE")}</td><td style="padding:8px;border:1px solid #ddd;text-align:right">S/${totalGastos.toLocaleString("es-PE")}</td><td style="padding:8px;border:1px solid #ddd;text-align:right;color:${totalUtilidad >= 0 ? "var(--color-primary)" : "#e63946"}">S/${totalUtilidad.toLocaleString("es-PE")}</td></tr></tbody></table><h2>3. Tendencia de Ingresos</h2><div style="display:flex;align-items:end;gap:8px;height:140px;padding:10px;background:#fafafa;border:1px solid #eee;border-radius:8px">${barrasHtml}</div><h2>4. Indicadores Clave</h2><div style="display:flex;flex-wrap:wrap;gap:5px"><div class="kpi"><div class="kpi-label">Margen de utilidad</div><div class="kpi-value">${margen}%</div></div><div class="kpi"><div class="kpi-label">Clientes activos</div><div class="kpi-value">${clientesActivos}</div></div><div class="kpi"><div class="kpi-label">Ingreso prom./mes</div><div class="kpi-value">S/${Math.round(avgIngresosMensual).toLocaleString("es-PE")}</div></div></div><h2>5. Proyeccion</h2><p>Basado en la tendencia de los últimos 6 meses, el ingreso estimado para el próximo mes es: <strong style="color:var(--color-primary);font-size:18px">S/${proyeccion.toLocaleString("es-PE")}</strong></p><div class="footer">Generado el ${fecha} — Buleje &middot; Este reporte es de caracter informativo</div></body></html>`;

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

const DASHBOARD_EXPENSE_COLORS = ["var(--color-primary)", "#457b9d", "#f97316", "#9b5de5", "#06b6d4", "#6b7280"];
const PAYMENT_METHOD_COLORS: Record<string, string> = {
  efectivo: "var(--accent)", EFECTIVO: "var(--accent)", Efectivo: "var(--accent)",
  yape: "#7c3aed", YAPE: "#7c3aed", Yape: "#7c3aed",
  plin: "#06b6d4", PLIN: "#06b6d4", Plin: "#06b6d4",
  tarjeta: "#3b82f6", TARJETA: "#3b82f6", Tarjeta: "#3b82f6",
  fiado: "#f59e0b", FIADO: "#f59e0b", Fiado: "#f59e0b",
  transferencia: "#8b5cf6", TRANSFERENCIA: "#8b5cf6", Transferencia: "#8b5cf6",
};
const PM_FALLBACK_COLORS = ["var(--accent)", "#7c3aed", "#06b6d4", "#3b82f6", "#f59e0b", "#8b5cf6", "#e63946"];

type KpiDef = { key: string; label: string; icon: typeof TrendingUp; color: string; bg: string };
const KPI_DEFS: KpiDef[] = [
  { key: "ingresos", label: "Ingresos del mes", icon: TrendingUp, color: "var(--accent)", bg: "bg-[var(--accent-soft)]" },
  { key: "gastos", label: "Gastos del mes", icon: TrendingDown, color: "#ef4444", bg: "bg-[var(--data-error-50)]" },
  { key: "utilidad", label: "Utilidad neta", icon: DollarSign, color: "#3b82f6", bg: "bg-[var(--accent-soft)]" },
  { key: "margen", label: "Margen %", icon: Percent, color: "#8b5cf6", bg: "bg-[var(--surface-sunken)]" },
  { key: "deuda", label: "Deuda proveedores", icon: Truck, color: "#f97316", bg: "bg-[var(--data-warning-50)]" },
  { key: "fiados", label: "Fiados pendientes", icon: CreditCard, color: "#f59e0b", bg: "bg-[var(--data-warning-50)]" },
  { key: "igv", label: "IGV a pagar", icon: Calculator, color: "#e63946", bg: "bg-[var(--surface-sunken)]" },
  { key: "puntoEq", label: "Punto equilibrio", icon: Target, color: "var(--color-primary)", bg: "bg-[var(--accent-soft)]" },
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
  // Mock KPI deltas — lazy-init so Math.random runs once per mount (React Compiler purity rule)
  const [kpiMockChanges] = useState<number[]>(() =>
    Array.from({ length: KPI_DEFS.length }, () => Math.round((Math.random() - 0.3) * 30))
  );
  // Mejora 5: Favoritos
  const finFavs = useFavoriteCharts("finanzas");

  useEffect(() => {
    Promise.allSettled([
      fetchFinanzas<Record<string, unknown> | null>("/api/analytics/kpis-v2", null),
      fetchFinanzas<Record<string, unknown> | null>("/api/expenses/summary", null),
      fetchFinanzas<unknown[]>("/api/sales?limit=5000", []),
      fetch("/api/expenses?limit=2000").then(r => r.ok ? r.json() : []),
      fetch("/api/payables").then(r => r.ok ? r.json() : []),
      fetch("/api/fiados?status=ACTIVO").then(r => r.ok ? r.json() : []),
      // Consolidación: los ingresos incluyen pedidos (Order), no solo Sale.
      fetchFinanzas<unknown[]>("/api/orders?limit=5000", []),
    ]).then(([kR, eR, sR, exR, pR, fR, oR]) => {
      const kpisData = kR.status === "fulfilled" ? kR.value : null;
      const expSummary = eR.status === "fulfilled" ? eR.value : null;
      const salesRaw = sR.status === "fulfilled" ? sR.value : [];
      const ordersRaw = oR.status === "fulfilled" ? oR.value : [];
      const expensesRaw = exR.status === "fulfilled" ? exR.value : [];
      const payablesRaw = pR.status === "fulfilled" ? (Array.isArray(pR.value) ? pR.value : []) : [];
      const fiadosRaw = fR.status === "fulfilled" ? (Array.isArray(fR.value) ? fR.value : []) : [];

      const now = new Date();
      const sales = (Array.isArray(salesRaw) ? salesRaw : []) as SaleRaw[];
      const orders = (Array.isArray(ordersRaw) ? ordersRaw : []) as OrderRaw[];

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

      // ── Monthly chart (last 6 months) ──
      const months: Array<{ mes: string; fullMonth: string; ingresos: number; gastos: number; utilidad: number }> = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthKey = d.toISOString().slice(0, 7);
        const label = MESES[d.getMonth()];
        const fullLabel = d.toLocaleDateString("es-PE", { month: "long", year: "numeric" });
        const ing = monthIngresos(monthKey, sales, orders);
        let gas = 0;
        if (expSummary?.monthly && Array.isArray(expSummary.monthly)) {
          const m = (expSummary.monthly as Array<{ month: string; total?: number }>).find((e) => e.month === monthKey);
          gas = n(m?.total);
        } else if (expSummary?.totalMonth && i === 0) {
          gas = n(expSummary.totalMonth);
        }
        months.push({ mes: label, fullMonth: fullLabel, ingresos: Math.round(ing), gastos: Math.round(gas), utilidad: Math.round(ing - gas) });
      }
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

      // ── Payment methods breakdown ──
      const pmMap = new Map<string, number>();
      for (const s of sales as SaleRaw[]) {
        const d = new Date(s.createdAt ?? "");
        if (d >= startOfMonth) {
          const rawMethod = s.paymentMethod ?? s.metodoPago ?? "efectivo";
          const method = rawMethod.charAt(0).toUpperCase() + rawMethod.slice(1).toLowerCase();
          pmMap.set(method, (pmMap.get(method) ?? 0) + n(s.total));
        }
      }
      setPaymentMethods(
        Array.from(pmMap.entries())
          .map(([name, value]) => ({ name, value: Math.round(value) }))
          .filter(g => g.value > 0)
          .sort((a, b) => b.value - a.value)
      );

      // ── Cash flow (last 30 days) ──
      const flowData: Array<{ dia: string; ingresos: number; gastos: number; balance: number }> = [];
      for (let i = 29; i >= 0; i--) {
        const dd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
        const dayKey = dd.toISOString().slice(0, 10);
        const dayLabel = `${dd.getDate()}/${dd.getMonth() + 1}`;
        const daySales = (sales as SaleRaw[]).filter((s) => (s.createdAt ?? "").startsWith(dayKey));
        const dayIngresos = daySales.reduce((sum, s) => sum + n(s.total), 0);
        const dayExpenses = items.filter((e) => (e.date ?? e.createdAt ?? "").slice(0, 10) === dayKey);
        const dayGastos = dayExpenses.reduce((sum, e) => sum + n(e.amount), 0);
        flowData.push({ dia: dayLabel, ingresos: Math.round(dayIngresos), gastos: Math.round(dayGastos), balance: Math.round(dayIngresos - dayGastos) });
      }
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
            <div key={i} className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="h-10 w-10 rounded-full bg-gray-200" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-gray-200 rounded w-16" />
                  <div className="h-5 bg-gray-200 rounded w-24" />
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl p-6">
          <div className="h-4 bg-gray-200 rounded w-48 mb-4" />
          <div className="h-80 bg-gray-100 rounded-xl" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl p-6">
            <div className="h-50 bg-gray-100 rounded-xl" />
          </div>
          <div className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl p-6">
            <div className="h-50 bg-gray-100 rounded-xl" />
          </div>
        </div>
        <div className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl p-6">
          <div className="h-70 bg-gray-100 rounded-xl" />
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
        <div className="h-16 w-16 rounded-xl bg-gray-100 dark:bg-surface flex items-center justify-center mx-auto mb-4">
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
            <button onClick={() => { setLastRefresh(new Date()); setMinAgo(0); }} className="p-1 h-11 w-11 flex items-center justify-center hover:bg-gray-100 rounded transition-colors" title="Actualizar datos">
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
        {KPI_DEFS.map((def, kpiIdx) => {
          const Icon = def.icon;
          const val = kpis[def.key] ?? 0;
          let display: string;
          let subtexto = "";
          let valColor = "text-[var(--text-primary)]";
          // Mejora 7: Comparativo mock (lazy-initialized for React Compiler purity)
          const change = kpiMockChanges[kpiIdx] ?? 0;

          if (def.key === "margen") {
            display = `${val}%`;
            subtexto = val > 25 ? "Excelente" : val >= 15 ? "Aceptable" : "Bajo";
            valColor = val > 25 ? "text-[var(--data-success-500)]" : val >= 15 ? "text-[var(--data-warning-600)]" : "text-[var(--data-error-600)]";
          } else if (def.key === "utilidad") {
            display = `${val >= 0 ? "+" : "-"}${formatCurrency(Math.abs(val), { decimals: 0 })}`;
            valColor = val >= 0 ? "text-[var(--data-success-500)]" : "text-[var(--data-error-600)]";
          } else if (def.key === "igv") {
            display = formatCurrency(Math.abs(val), { decimals: 0 });
            subtexto = val > 0 ? "A pagar" : "Credito fiscal";
            valColor = val > 0 ? "text-[var(--data-error-600)]" : "text-[var(--data-success-500)]";
          } else if (def.key === "puntoEq") {
            display = formatCurrency(val, { decimals: 0 });
            subtexto = "por dia";
          } else {
            display = formatCurrency(val, { decimals: 0 });
          }

          // Zero-value gray styling
          if (val === 0 && def.key !== "margen") valColor = "text-[var(--text-tertiary)]";

          // Mejora 8: Sparkline data for first 3 KPIs (Ingresos, Gastos, Utilidad)
          const sparkData = kpiIdx < 3 ? [{ v: val * 0.7 }, { v: val * 0.85 }, { v: val * 0.75 }, { v: val * 0.9 }, { v: val * 0.82 }, { v: val * 0.95 }, { v: val }] : null;

          return (
            <div key={def.key} className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl p-3 sm:p-4  hover:shadow-sm transition-shadow">
              <div className="flex items-center gap-3">
                <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${def.bg}`}>
                  <Icon className="h-5 w-5" style={{ color: def.color }} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-[var(--text-secondary)] truncate">{def.label}</p>
                  <div className="flex items-center gap-2">
                    <p className={`text-xl sm:text-2xl font-mono font-extrabold truncate ${valColor}`}>{display}</p>
                    <span className={`text-xs ${change >= 0 ? "text-[var(--data-success-500)]" : "text-[var(--data-error-500)]"}`}>
                      {change >= 0 ? "\u2191" : "\u2193"} {Math.abs(change)}%
                    </span>
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
        <div className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl p-4 sm:p-6 ">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <FavStar id="ingresos-vs-gastos" favs={finFavs} />
              <div className="h-2 w-2 rounded-full bg-primary" />
              <p className="text-sm font-bold text-[var(--text-primary)]">Ingresos vs Gastos vs Utilidad</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--text-tertiary)] font-medium">Últimos 6 meses</span>
              <button onClick={() => setExpandedChart("ingresos-gastos")} className="p-1 hover:bg-gray-100 rounded transition-colors" title="Expandir"><Maximize2 className="h-3.5 w-3.5 text-[var(--text-tertiary)]" /></button>
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
                  <stop offset="0%" stopColor="#e63946" stopOpacity={0.9} />
                  <stop offset="100%" stopColor="#e63946" stopOpacity={0.7} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="" vertical={false} />
              <XAxis dataKey="mes" tick={{ fontSize: 12, fill: "#6b7280" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#6b7280" }} tickFormatter={formatSolesShort} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Legend
                formatter={(value: unknown) => { const v = String(value); const l: Record<string, string> = { ingresos: "Ingresos", gastos: "Gastos", utilidad: "Utilidad" }; return l[v] ?? v; }}
                iconType="circle"
                wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }}
              />
              <ReferenceLine y={0} stroke="#9ca3af" strokeDasharray="3 3" />
              <ReferenceLine y={15000} stroke="#f97316" strokeDasharray="5 5" label={{ value: "Meta: S/15,000", position: "right", fill: "#f97316", fontSize: 11 }} />
              <Bar dataKey="ingresos" fill="url(#gradIngresos)" radius={[6, 6, 0, 0]} barSize={30} />
              <Bar dataKey="gastos" fill="url(#gradGastos)" radius={[6, 6, 0, 0]} barSize={30} />
              <Line type="monotone" dataKey="utilidad" stroke="#3b82f6" strokeWidth={3} dot={{ r: 5, fill: "#3b82f6", strokeWidth: 2, stroke: "#fff" }} activeDot={{ r: 7 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
      </StaggerItem>

      {/* ════════ SECCION 3: Gastos por Categoria + Metodos de Ingreso (2 donuts) ════════ */}
      <StaggerItem index={2}>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Donut izquierda: Gastos por categoria */}
        <div className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl p-4 sm:p-6 ">
          <div className="flex items-center gap-2 mb-4">
            <FavStar id="gastos-categoria" favs={finFavs} />
            <div className="h-2 w-2 rounded-full bg-[var(--data-error-500)]" />
            <p className="text-sm font-bold text-[var(--text-primary)]">Gastos por Categoria</p>
            <div className="flex-1" />
            {gastosPieFilter && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold">
                {gastosPieFilter}
                <button onClick={() => setGastosPieFilter(null)} className="hover:bg-primary/20 rounded-full p-0.5 transition-colors"><XIcon className="h-3 w-3" /></button>
              </span>
            )}
            <button onClick={() => setExpandedChart("gastos-cat")} className="p-1 hover:bg-gray-100 rounded transition-colors" title="Expandir"><Maximize2 className="h-3.5 w-3.5 text-[var(--text-tertiary)]" /></button>
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
        <div className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl p-4 sm:p-6 ">
          <div className="flex items-center gap-2 mb-4">
            <div className="h-2 w-2 rounded-full bg-primary" />
            <p className="text-sm font-bold text-[var(--text-primary)]">Ingresos por Metodo de Pago</p>
          </div>
          {paymentMethods.length > 0 ? (
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <div className="relative w-45 h-45 shrink-0">
                <ResponsiveContainer minWidth={0} width="100%" height="100%">
                  <PieChart>
                    <Pie data={paymentMethods} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value" stroke="none">
                      {paymentMethods.map((entry, index) => (
                        <Cell key={`pm-${index}`} fill={PAYMENT_METHOD_COLORS[entry.name] ?? PM_FALLBACK_COLORS[index % PM_FALLBACK_COLORS.length]} />
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
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: PAYMENT_METHOD_COLORS[g.name] ?? PM_FALLBACK_COLORS[i % PM_FALLBACK_COLORS.length] }} />
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
      {cashFlow.length > 0 && (
        <div className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl p-4 sm:p-6 ">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <FavStar id="flujo-caja" favs={finFavs} />
            <div className="h-2 w-2 rounded-full bg-primary" />
              <p className="text-sm font-bold text-[var(--text-primary)]">Flujo de Caja</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--text-tertiary)] font-medium">Últimos 30 días</span>
              <button onClick={() => setExpandedChart("flujo-caja")} className="p-1 hover:bg-gray-100 rounded transition-colors" title="Expandir"><Maximize2 className="h-3.5 w-3.5 text-[var(--text-tertiary)]" /></button>
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
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradCashBalance" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="" vertical={false} />
              <XAxis dataKey="dia" tick={{ fontSize: 10, fill: "#9ca3af" }} interval={4} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} tickFormatter={formatSolesShort} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <ReferenceLine y={0} stroke="#9ca3af" strokeDasharray="4 4" label={{ value: "S/0", position: "left", fill: "#9ca3af", fontSize: 10 }} />
              <Area type="monotone" dataKey="ingresos" stroke="var(--accent)" fill="url(#gradCashIngresos)" strokeWidth={1.5} />
              <Area type="monotone" dataKey="gastos" stroke="#ef4444" fill="url(#gradCashGastos)" strokeWidth={1.5} />
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
            <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-[var(--dur-slower)]"
                style={{
                  width: `${projProgreso}%`,
                  backgroundColor: projPctTarget > 70 ? "var(--accent)" : projPctTarget >= 40 ? "#f59e0b" : "#ef4444",
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
        <div className="bg-white dark:bg-[var(--color-card)] border-2 border-secondary/40 rounded-xl p-4 sm:p-6 ">
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
            <div className="h-2 w-2 rounded-full" style={{ backgroundColor: healthScore.total > 70 ? "var(--accent)" : healthScore.total >= 40 ? "#f59e0b" : "#ef4444" }} />
            <p className="text-sm font-bold text-[var(--text-primary)]">
              Indicadores de Salud Financiera
              <span className="ml-2 text-xs font-normal px-2 py-0.5 rounded-full" style={{
                backgroundColor: healthScore.total > 70 ? "color-mix(in oklab, var(--accent) 12%, transparent)" : healthScore.total >= 40 ? "#f59e0b20" : "#ef444420",
                color: healthScore.total > 70 ? "var(--accent)" : healthScore.total >= 40 ? "#f59e0b" : "#ef4444",
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
              color={healthScore.margen > 25 ? "var(--accent)" : healthScore.margen >= 15 ? "#f59e0b" : "#ef4444"}
            />
            <GaugeChart
              value={healthScore.liquidez}
              max={4}
              label="Liquidez"
              unit="x"
              color={healthScore.liquidez > 2 ? "var(--accent)" : healthScore.liquidez >= 1 ? "#f59e0b" : "#ef4444"}
            />
            <GaugeChart
              value={healthScore.deudaRatio}
              max={100}
              label="Endeudamiento"
              unit="%"
              color={healthScore.deudaRatio < 10 ? "var(--accent)" : healthScore.deudaRatio <= 30 ? "#f59e0b" : "#ef4444"}
            />
          </div>
        </div>
      )}
      </StaggerItem>

      {/* ════════ SECCION 8: Deudas y Cobros Pendientes ════════ */}
      <StaggerItem index={7}>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Debo a proveedores */}
        <div className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl p-4 sm:p-6 ">
          <div className="flex items-center gap-2 mb-4">
            <Truck className="h-4 w-4 text-secondary" />
            <p className="text-sm font-bold text-[var(--text-primary)]">Debo a proveedores</p>
          </div>
          {topPayables.length > 0 ? (
            <ResponsiveContainer minWidth={0} width="100%" height={Math.max(topPayables.length * 44, 120)}>
              <BarChart data={topPayables} layout="vertical" margin={{ top: 0, right: 60, left: 0, bottom: 0 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#6b7280" }} width={120} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ borderRadius: "10px", border: "1px solid #e5e7eb", fontSize: "12px" }}
                  formatter={(value: unknown) => [formatCurrency(Number(value), { decimals: 0 }), "Monto"]}
                />
                <Bar dataKey="monto" radius={[0, 6, 6, 0]} barSize={20}>
                  {topPayables.map((entry, index) => (
                    <Cell key={`pay-${index}`} fill={entry.vencido ? "#ef4444" : "#f97316"} />
                  ))}
                  <LabelList dataKey="monto" position="right" formatter={(v: unknown) => formatCurrency(Number(v), { decimals: 0 })} style={{ fontSize: 10, fill: "#6b7280", fontWeight: 600 }} />
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
        <div className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl p-4 sm:p-6 ">
          <div className="flex items-center gap-2 mb-4">
            <CreditCard className="h-4 w-4 text-[var(--data-warning-500)]" />
            <p className="text-sm font-bold text-[var(--text-primary)]">Me deben (fiados)</p>
          </div>
          {topFiados.length > 0 ? (
            <ResponsiveContainer minWidth={0} width="100%" height={Math.max(topFiados.length * 44, 120)}>
              <BarChart data={topFiados} layout="vertical" margin={{ top: 0, right: 60, left: 0, bottom: 0 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#6b7280" }} width={120} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ borderRadius: "10px", border: "1px solid #e5e7eb", fontSize: "12px" }}
                  formatter={(value: unknown) => [formatCurrency(Number(value), { decimals: 0 }), "Monto"]}
                />
                <Bar dataKey="monto" radius={[0, 6, 6, 0]} barSize={20}>
                  {topFiados.map((entry, index) => (
                    <Cell key={`fia-${index}`} fill={entry.vencido ? "#ef4444" : "#f59e0b"} />
                  ))}
                  <LabelList dataKey="monto" position="right" formatter={(v: unknown) => formatCurrency(Number(v), { decimals: 0 })} style={{ fontSize: 10, fill: "#6b7280", fontWeight: 600 }} />
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
          <div className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl p-4 sm:p-6 ">
            <div className="flex items-center gap-2 mb-4">
              <div className="h-2 w-2 rounded-full" style={{ backgroundColor: healthScore.total > 70 ? "var(--accent)" : healthScore.total >= 40 ? "#f59e0b" : "#ef4444" }} />
              <p className="text-sm font-bold text-[var(--text-primary)]">Salud del Negocio</p>
              <span className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full" style={{
                backgroundColor: healthScore.total > 70 ? "color-mix(in oklab, var(--accent) 12%, transparent)" : healthScore.total >= 40 ? "#f59e0b20" : "#ef444420",
                color: healthScore.total > 70 ? "var(--accent)" : healthScore.total >= 40 ? "#f59e0b" : "#ef4444",
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
                      <Cell fill={healthScore.total > 70 ? "var(--accent)" : healthScore.total >= 40 ? "#f59e0b" : "#ef4444"} />
                      <Cell fill="#e5e7eb" className="" />
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex items-end justify-center pb-1 pointer-events-none">
                  <span className="text-2xl font-extrabold" style={{ color: healthScore.total > 70 ? "var(--accent)" : healthScore.total >= 40 ? "#f59e0b" : "#ef4444" }}>
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
                    <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-[var(--dur-slow)]" style={{ width: `${(f.pts / f.max) * 100}%`, backgroundColor: f.pts >= f.max * 0.8 ? "var(--accent)" : f.pts >= f.max * 0.5 ? "#f59e0b" : "#ef4444" }} />
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
        <div className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl p-4 sm:p-6 ">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <p className="text-sm font-bold text-[var(--text-primary)]">Comparar Meses</p>
            <div className="flex items-center gap-2">
              <select value={cmpMonth1} onChange={e => setCmpMonth1(e.target.value)} className="text-xs border border-[var(--rule-base)] rounded-lg px-2 py-1 bg-white dark:bg-[var(--color-card)] text-[var(--text-primary)]">
                {monthlyData.map(m => <option key={m.fullMonth} value={m.mes}>{m.mes}</option>)}
              </select>
              <span className="text-xs text-[var(--text-tertiary)]">vs</span>
              <select value={cmpMonth2} onChange={e => setCmpMonth2(e.target.value)} className="text-xs border border-[var(--rule-base)] rounded-lg px-2 py-1 bg-white dark:bg-[var(--color-card)] text-[var(--text-primary)]">
                {monthlyData.map(m => <option key={m.fullMonth} value={m.mes}>{m.mes}</option>)}
              </select>
            </div>
          </div>
          {(() => {
            const d1 = monthlyData.find(m => m.mes === cmpMonth1);
            const d2 = monthlyData.find(m => m.mes === cmpMonth2);
            if (!d1 || !d2) return <EmptyState icon={BarChart3} title="Selecciona meses con datos" description="Los datos apareceran cuando registres ventas" />;
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
                  <div className="text-center p-2 bg-gray-50 rounded-xl">
                    <p className="text-xs text-[var(--text-tertiary)] uppercase font-bold">Ventas</p>
                    <p className={cn("text-sm font-bold", diffIngresos >= 0 ? "text-[var(--data-success-500)]" : "text-[var(--data-error-500)]")}>{diffIngresos >= 0 ? "+" : ""}{diffIngresos}%</p>
                  </div>
                  <div className="text-center p-2 bg-gray-50 rounded-xl">
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
                    <Bar dataKey={cmpMonth2} fill="#f97316" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </>
            );
          })()}
        </div>
      </StaggerItem>

      {/* ════════ Expand Chart Modals ════════ */}
      {expandedChart && (
        <ChartExpandModal title={expandedChart === "ingresos-gastos" ? "Ingresos vs Gastos vs Utilidad" : expandedChart === "flujo-caja" ? "Flujo de Caja" : expandedChart === "gastos-cat" ? "Gastos por Categoria" : expandedChart} onClose={() => setExpandedChart(null)}>
            {expandedChart === "ingresos-gastos" && monthlyData.length > 0 && (
              <ResponsiveContainer minWidth={0} width="100%" height={500}>
                <ComposedChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="mes" tick={{ fontSize: 14 }} />
                  <YAxis tickFormatter={formatSolesShort} tick={{ fontSize: 13 }} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend />
                  <Bar dataKey="ingresos" fill="var(--color-primary)" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="gastos" fill="#e63946" radius={[6, 6, 0, 0]} />
                  <Line type="monotone" dataKey="utilidad" stroke="#3b82f6" strokeWidth={3} dot={{ r: 5, fill: "#3b82f6" }} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
            {expandedChart === "flujo-caja" && cashFlow.length > 0 && (
              <ResponsiveContainer minWidth={0} width="100%" height={500}>
                <AreaChart data={cashFlow}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="dia" tick={{ fontSize: 12 }} />
                  <YAxis tickFormatter={formatSolesShort} tick={{ fontSize: 13 }} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="ingresos" stroke="var(--accent)" fill="color-mix(in oklab, var(--accent) 12%, transparent)" strokeWidth={2} />
                  <Area type="monotone" dataKey="gastos" stroke="#ef4444" fill="#ef444420" strokeWidth={2} />
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

// ── IntelligenceKPIStrip — quick KPIs for Inteligencia tab ───────────────────
function IntelligenceKPIStrip() {
  const [kpis, setKpis] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    fetch("/api/analytics/kpis-v2", { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d) setKpis({
          margen: d.margenPromedio ?? d.margin ?? 0,
          ventasMes: d.ventasMes ?? d.salesMonth ?? 0,
          ticketPromedio: d.ticketPromedio ?? d.avgTicket ?? 0,
          productos: d.productosActivos ?? d.activeProducts ?? 0,
        });
      })
      .catch((err) => logger.warn("[FinanzasModule] fetch failed (non-critical)", { err: String(err).slice(0, 120) }));
  }, []);

  if (!kpis) return null;

  const cards = [
    { label: "Margen", value: `${Number(kpis.margen).toFixed(1)}%`, color: "text-primary" },
    { label: "Ventas/mes", value: formatCurrency(kpis.ventasMes, { decimals: 0 }), color: "text-primary" },
    { label: "Ticket prom.", value: formatCurrency(kpis.ticketPromedio, { decimals: 0 }), color: "text-secondary" },
    { label: "Productos", value: String(kpis.productos), color: "text-[var(--text-primary)]" },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {cards.map(c => (
        <div key={c.label} className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl p-3  text-center">
          <p className="text-xs text-[var(--text-secondary)] font-semibold">{c.label}</p>
          <p className={cn("text-lg font-extrabold mt-0.5", c.color)}>{c.value}</p>
        </div>
      ))}
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function FinanzasModule() {
  const [sub, setSub] = useState(() => {
    if (typeof window === "undefined") return TABS[0].id;
    return (localStorage.getItem(`admin-last-tab-${MODULE_ID}`) as typeof TABS[number]["id"]) || TABS[0].id;
  });
  useEffect(() => { localStorage.setItem(`admin-last-tab-${MODULE_ID}`, sub); }, [sub]);

  // Auto-refresh every 5 minutes
  const [refreshKey, setRefreshKey] = useState(0);
  const autoRefresh = useAutoRefresh({
    intervalSeconds: 300,
    onRefresh: useCallback(() => setRefreshKey(k => k + 1), []),
    enabled: sub === "dashboard",
  });

  return (
    <div className="space-y-6">
      <AdminModuleHeader
        eyebrow="Finanzas · Reportes"
        title="Mi Plata"
        description="Pérdidas y ganancias, gastos, flujo de caja y reportes financieros."
        icon={Wallet}
      >
        {sub === "dashboard" && (
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
        activeTab={sub}
        onTabChange={(id) => setSub(id as typeof TABS[number]["id"])}
        moduleId="finanzas"
      >
      {sub === "dashboard" && (
        <div className="space-y-6" key={refreshKey}>
          <FinanzasDashboard />
          {/* Resumen automático integrado en dashboard */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ProfitLossAutoCard />
            <MonthProjectionCard />
            <BudgetAlertWidget />
            <WeeklyReportCard />
            <MoneyLeakDetector />
          </div>
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
      {sub === "flujo-caja" && (
        <div className="space-y-6">
          {/* Nuevo — diferenciador #1 vs Loyverse/Alegra/Vendemás */}
          <CashflowRollingTable />
          <div className="pt-4 border-t border-[var(--rule-base)] dark:border-white/10">
            <p className="text-xs font-bold text-[var(--text-tertiary)] mb-3">
              Proyección legacy (30 días)
            </p>
            <div className="space-y-4 opacity-90">
              <CashFlowProjection />
              <WeeklyCashFlowTable />
            </div>
          </div>
        </div>
      )}
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
      {sub === "inteligencia" && (
        <Suspense fallback={<S />}>
          <div className="space-y-6">
            <ComparativeReportsTab />
            <IntelligenceKPIStrip />
            <div className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl p-5 ">
              <CardTitle className="text-sm font-bold text-[var(--text-primary)] mb-3">Análisis de Negocio</CardTitle>
              <BusinessIntelligenceTab />
            </div>
            <div className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl p-5 ">
              <CardTitle className="text-sm font-bold text-[var(--text-primary)] mb-3">KPIs Personalizados</CardTitle>
              <CustomKPITab />
            </div>
            <div className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl p-5 ">
              <CardTitle className="text-sm font-bold text-[var(--text-primary)] mb-3">Precios del Mercado</CardTitle>
              <CompetitorPriceTracker />
            </div>
          </div>
        </Suspense>
      )}
      {sub === "tesoreria" && (
        <Suspense fallback={<S />}>
          <TreasuryDashboard />
        </Suspense>
      )}
      </AdminTabBar>
    </div>
  );
}
