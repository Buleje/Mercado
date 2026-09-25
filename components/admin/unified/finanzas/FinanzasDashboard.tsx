"use client";

/**
 * El tablero de «Resumen» de Mi Plata.
 *
 * Vivía dentro de `FinanzasModule.tsx`, que llegó a 1.420 líneas y mezclaba la
 * navegación del hub con el dibujo de sus ocho KPIs y sus nueve gráficos. Acá
 * queda el tablero solo; el módulo queda con la navegación sola.
 */

import { CardTitle, DataTable, StatCard, type StatCardEmphasis } from "@buleje/design-system";
import { useState, useEffect, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  ReferenceLine, PieChart, Pie, Cell, LabelList,
  ComposedChart, Line, AreaChart, Area,
} from "recharts";
import {
  TrendingUp, TrendingDown, Target,
  Calculator,
  DollarSign,
  BarChart3, Percent, Truck, CreditCard, RefreshCw, AlertTriangle, Maximize2, X as XIcon,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/currency";
import { ChartTooltip } from "@/lib/chart-tooltip";
import { formatSolesShort } from "@/lib/chart-helpers";
import { SERIES, SERIE, colorMedioPago } from "@/components/admin/shared/chart-palette";
import FavStar from "@/components/admin/shared/FavStar";
import ChartExpandModal from "@/components/admin/shared/ChartExpandModal";
import EmptyState from "@/components/admin/shared/EmptyState";
import ExportButton from "@/components/admin/shared/ExportButton";
import PeriodSelector from "@/components/admin/shared/PeriodSelector";
import { useFavoriteCharts } from "@/hooks/use-favorite-charts";
import { GaugeChart, StaggerItem } from "@/components/admin/finanzas/charts";
import {
  fetchFinanzas, n, calcHealthScore, MESES,
  type ExpenseRaw, type PayableRaw, type FiadoRaw, type HealthData,
  ingresosDelMes, gastosDelMes,
} from "@/components/admin/finanzas/shared";
import { formatMonthYear } from "@/lib/format";

// ── Dashboard de Finanzas (Premium) ──────────────────────────────────────────

// Colores de serie desde la paleta única del admin (chart-palette.ts). Antes
// este archivo declaraba 101 hex sueltos y su propio mapa de medios de pago
// —duplicado del que arman otros módulos— y ninguno era theme-aware.
const DASHBOARD_EXPENSE_COLORS = SERIES;
const PM_FALLBACK_COLORS = SERIES;

type KpiDef = { key: string; label: string; icon: typeof TrendingUp; color: string };
const KPI_DEFS: KpiDef[] = [
  { key: "ingresos", label: "Ingresos del mes", icon: TrendingUp, color: "var(--accent)" },
  { key: "gastos", label: "Gastos del mes", icon: TrendingDown, color: SERIE.gastos },
  { key: "utilidad", label: "Utilidad neta", icon: DollarSign, color: SERIE.utilidad },
  { key: "margen", label: "Margen %", icon: Percent, color: SERIES[3] },
  { key: "deuda", label: "Deuda proveedores", icon: Truck, color: SERIE.alerta },
  { key: "fiados", label: "Fiados pendientes", icon: CreditCard, color: SERIE.alerta },
  { key: "igv", label: "IGV a pagar", icon: Calculator, color: SERIE.gastos },
  { key: "puntoEq", label: "Punto equilibrio", icon: Target, color: "var(--color-primary)" },
];
export default function FinanzasDashboard() {
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
      const inicioDelMes = new Date(now.getFullYear(), now.getMonth(), 1);

      /*
       * LOS DOS KPIs QUE MANDAN EN ESTE MÓDULO LEÍAN CAMPOS QUE NADIE MANDA.
       *
       * Medido 2026-09-06 en un tenant con datos completos (15 ventas, 25
       * pedidos y 10 gastos, todos del mes): «Ingresos del mes S/0», «Gastos
       * del mes S/0», margen 0 %, IGV 0, punto de equilibrio 0. Todo el
       * módulo en cero teniendo la plata cargada.
       *
       *   /api/analytics/kpis-v2 devuelve  ingresosHoy · ticketPromedio ·
       *     margenOperativo · clientesActivos · fiadoPendiente ·
       *     rotacionInventario.  NO existe `ventasMes` ni `salesMonth`.
       *   /api/expenses/summary devuelve un ARRAY [{category,total,count}]
       *     (agrupado por categoría, sin filtro de fecha). Un array no tiene
       *     `.totalMonth` ni `.total`, así que la lectura daba undefined.
       *
       * Se conserva la lectura del contrato esperado —si algún día el endpoint
       * manda esos campos, mandan ellos— y se agrega el fallback derivado de
       * datos que ESTA MISMA carga ya trajo, igual que hacen `deuda` y
       * `fiados` acá abajo. Un KPI en cero que debería tener plata es peor que
       * uno ausente: parece un negocio parado.
       */
      const itemsGasto = (Array.isArray(expensesRaw)
        ? expensesRaw
        : ((expensesRaw as { expenses?: unknown[] } | null)?.expenses ?? [])) as ExpenseRaw[];

      // ── KPIs ──
      const ingresos = ingresosDelMes(kpisData, monthlySummary, now);
      const gastosMes = gastosDelMes(expSummary, itemsGasto, now);
      const utilidad = ingresos - gastosMes;
      const margen = ingresos > 0 ? Math.round(((ingresos - gastosMes) / ingresos) * 100) : 0;
      const deuda = n(kpisData?.payablesVencidosMonto)
        || (payablesRaw as PayableRaw[]).reduce((s, p) => s + n(p.amount ?? p.total), 0);
      const fiados = n(kpisData?.fiadosPendienteMonto ?? kpisData?.fiadosVencidosMonto)
        /* El fallback sumaba `total` —lo que se fió— cuando el KPI se llama
           «fiados pendientes». Medido en datos reales: se fiaron S/496.30 a
           cinco clientes, uno ya pagó y quedan S/345.50 por cobrar; el panel
           anunciaba S/461 (la suma de los totales de los que siguen activos).
           33 % de más sobre una cifra que el dueño usa para decidir a quién
           llamar. Lo que deben es el saldo. */
        || (fiadosRaw as FiadoRaw[]).reduce((s, f) => s + n(f.saldo ?? f.balance ?? f.total ?? f.amount), 0);
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
        const fullLabel = formatMonthYear(d, { largo: true });
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
      const items = itemsGasto;
      const startOfMonth = inicioDelMes;
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

  const mesNombre = formatMonthYear(new Date(), { largo: true });
  const mesCapitalized = mesNombre.charAt(0).toUpperCase() + mesNombre.slice(1);

  // Empty state
  if (Object.values(kpis).every(v => v === 0) && monthlyData.every(m => m.ingresos === 0 && m.gastos === 0)) {
    return (
      <div className="text-center py-16">
        <div className="h-16 w-16 rounded-xl bg-[var(--surface-sunken)] flex items-center justify-center mx-auto mb-4">
          <BarChart3 className="h-8 w-8 text-[var(--text-tertiary)] dark:text-muted" />
        </div>
        <CardTitle className="text-lg font-semibold text-[var(--text-primary)]">Sin datos financieros</CardTitle>
        <p className="text-sm text-muted mt-1">Registra tus primeras ventas y gastos para ver el dashboard</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">

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
        {KPI_DEFS.map((def) => {
          const val = kpis[def.key] ?? 0;
          let display: string;
          let subValue: string | undefined;
          let emphasis: StatCardEmphasis = "neutral";
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
            subValue = val > 25 ? "Excelente" : val >= 15 ? "Aceptable" : "Bajo";
            emphasis = val > 25 ? "success" : val >= 15 ? "warning" : "error";
          } else if (def.key === "utilidad") {
            display = `${val >= 0 ? "+" : "-"}${formatCurrency(Math.abs(val), { decimals: 0 })}`;
            emphasis = val >= 0 ? "success" : "error";
          } else if (def.key === "igv") {
            display = formatCurrency(Math.abs(val), { decimals: 0 });
            subValue = val > 0 ? "A pagar" : "Crédito fiscal";
            emphasis = val > 0 ? "error" : "success";
          } else if (def.key === "puntoEq") {
            display = formatCurrency(val, { decimals: 0 });
            subValue = "por día";
          } else {
            display = formatCurrency(val, { decimals: 0 });
          }
          // Nota: se retira el gris de "valor en cero" del hand-rolled original
          // (StatCardEmphasis no tiene un tono "neutral-tenue") — mismo criterio
          // que ya usa VentasDashboard.tsx con este primitivo.

          // Sparkline REAL desde la serie mensual (antes era val*0.7..0.95 fabricado).
          // Solo para Ingresos/Gastos/Utilidad, que existen en monthlyData.
          const sparkData = (monthlyData.length >= 2 && (def.key === "ingresos" || def.key === "gastos" || def.key === "utilidad"))
            ? monthlyData.map(m => m[def.key as "ingresos" | "gastos" | "utilidad"])
            : null;

          return (
            <StatCard
              key={def.key}
              label={def.label}
              value={display}
              subValue={subValue}
              icon={def.icon}
              emphasis={emphasis}
              delta={change ?? undefined}
              sparkline={sparkData ? { data: sparkData, color: def.color } : undefined}
            />
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
                <button aria-label="Quitar" onClick={() => setGastosPieFilter(null)} className="hover:bg-primary/20 rounded-full p-0.5 transition-colors"><XIcon className="h-3 w-3" /></button>
              </span>
            )}
            <button onClick={() => setExpandedChart("gastos-cat")} className="p-1 hover:bg-[var(--surface-sunken)] rounded transition-colors" title="Expandir"><Maximize2 className="h-3.5 w-3.5 text-[var(--text-tertiary)]" /></button>
          </div>
          {expensesByCategory.length > 0 ? (
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <div className="relative w-45 h-45 shrink-0">
                <ResponsiveContainer initialDimension={{ width: 1, height: 1 }} minWidth={0} width="100%" height="100%">
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
                <ResponsiveContainer initialDimension={{ width: 1, height: 1 }} minWidth={0} width="100%" height="100%">
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
            <DataTable className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--rule-base)]">
                  <th className="text-left py-2 text-xs font-bold text-[var(--text-tertiary)]">Concepto</th>
                  <th className="text-right py-2 text-xs font-bold text-[var(--text-tertiary)]">Monto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--rule-soft)]">
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
            </DataTable>
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
              <select aria-label="Primer mes a comparar" value={cmpMonth1} onChange={e => setCmpMonth1(e.target.value)} className="text-xs border border-[var(--rule-base)] rounded-xl px-2 py-1 bg-[var(--surface-raised)] text-[var(--text-primary)]">
                {monthlyData.map(m => <option key={m.fullMonth} value={m.mes}>{m.mes}</option>)}
              </select>
              <span className="text-xs text-[var(--text-tertiary)]">vs</span>
              <select aria-label="Segundo mes a comparar" value={cmpMonth2} onChange={e => setCmpMonth2(e.target.value)} className="text-xs border border-[var(--rule-base)] rounded-xl px-2 py-1 bg-[var(--surface-raised)] text-[var(--text-primary)]">
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
