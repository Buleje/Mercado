"use client";

import { useState, useEffect, useMemo } from "react";
import {
  TrendingUp, Download, AlertTriangle,
  ArrowUp, ArrowDown, Wallet, DollarSign, Loader2, RefreshCw,
} from "lucide-react";
import { cn, exportToCSV } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type SaleRecord = {
  id: string;
  total: number;
  createdAt: string;
  payment?: string;
};

type PayableRecord = {
  id: string;
  amount: number;
  paidAmount: number;
  status: string;
  dueDate: string;
  supplierName?: string;
};

type ForecastWeek = {
  weekLabel: string;
  startDate: string;
  inflows: number;
  outflows: number;
  balance: number;
  cumulative: number;
};

type Scenario = "base" | "optimista" | "pesimista";

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  "S/ " + n.toLocaleString("es-PE", { minimumFractionDigits: 2 });

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  return d;
}

function formatDateShort(d: Date): string {
  return d.toLocaleDateString("es-PE", { day: "2-digit", month: "short" });
}

function buildForecast(
  sales: SaleRecord[],
  payables: PayableRecord[],
  scenario: Scenario,
  openingBalance: number
): ForecastWeek[] {
  const now = new Date();
  const WEEKS = 13; // ~90 días = 13 semanas

  // Calcular ingresos promedio semanal de los últimos 30 días
  const last30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const recentSales = sales.filter((s) => new Date(s.createdAt) >= last30);
  const avgWeeklySales =
    recentSales.length > 0
      ? (recentSales.reduce((s, r) => s + r.total, 0) / 4.3) // ~4.3 semanas en 30 días
      : 0;

  // Pendientes reales de pago agrupados por semana de vencimiento
  const pendingPayables = payables.filter(
    (p) => p.status !== "pagado" && p.status !== "anulado"
  );
  const payablesByWeek = new Map<number, number>();
  pendingPayables.forEach((p) => {
    const due = new Date(p.dueDate);
    const weekIdx = Math.floor(
      (due.getTime() - startOfWeek(now).getTime()) / (7 * 24 * 60 * 60 * 1000)
    );
    if (weekIdx >= 0 && weekIdx < WEEKS) {
      const remaining = p.amount - p.paidAmount;
      payablesByWeek.set(weekIdx, (payablesByWeek.get(weekIdx) ?? 0) + remaining);
    }
  });

  // Multiplicadores por escenario
  const multipliers: Record<Scenario, { inflow: number; outflow: number }> = {
    base:      { inflow: 1.0,  outflow: 1.0  },
    optimista: { inflow: 1.2,  outflow: 0.9  },
    pesimista: { inflow: 0.75, outflow: 1.15 },
  };
  const { inflow: im, outflow: om } = multipliers[scenario];

  let cumulative = openingBalance;
  return Array.from({ length: WEEKS }, (_, i) => {
    const startDate = addDays(startOfWeek(now), i * 7);
    const inflows = Math.round(avgWeeklySales * im);
    const scheduledOutflow = payablesByWeek.get(i) ?? 0;
    // Gastos operativos fijos estimados
    const fixedWeeklyOpex = Math.round(avgWeeklySales * 0.15 * om);
    const outflows = Math.round(scheduledOutflow * om + fixedWeeklyOpex);
    const balance = inflows - outflows;
    cumulative += balance;
    const _monthStr = startDate.toLocaleDateString("es-PE", { month: "short" });
    const weekLabel = `Sem ${i + 1} (${formatDateShort(startDate)})`;
    return {
      weekLabel,
      startDate: startDate.toISOString().split("T")[0],
      inflows,
      outflows,
      balance,
      cumulative,
    };
  });
}

const SCENARIO_META: Record<Scenario, { label: string; color: string }> = {
  base:      { label: "Base",      color: "text-emerald-600"    },
  optimista: { label: "Optimista", color: "text-emerald-600" },
  pesimista: { label: "Pesimista", color: "text-red-600"     },
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function LiquidityForecastTab() {
  const [mountTime] = useState(() => Date.now());
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [payables, setPayables] = useState<PayableRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [scenario, setScenario] = useState<Scenario>("base");
  const [horizon, setHorizon] = useState<30 | 60 | 90>(90);

  const load = () => {
    setLoading(true);
    setError(false);
    Promise.all([
      fetch("/api/sales").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/payables").then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([s, p]) => {
        setSales(Array.isArray(s) ? s : []);
        setPayables(Array.isArray(p) ? p : []);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  };

  useEffect(() => { load(); }, []);

  // Saldo inicial = saldo de caja estimado (suma de ventas últimos 7 días)
  const openingBalance = useMemo(() => {
    const last7 = new Date(mountTime - 7 * 24 * 60 * 60 * 1000);
    return sales
      .filter((s) => new Date(s.createdAt) >= last7)
      .reduce((sum, s) => sum + s.total, 0);
  }, [sales]);

  const allWeeks = useMemo(
    () => buildForecast(sales, payables, scenario, openingBalance),
    [sales, payables, scenario, openingBalance]
  );

  const weeksToShow = horizon === 30 ? 4 : horizon === 60 ? 9 : 13;
  const weeks = useMemo(() => allWeeks.slice(0, weeksToShow), [allWeeks, weeksToShow]);

  const stats = useMemo(() => {
    const minCum = Math.min(...weeks.map((w) => w.cumulative));
    const maxCum = Math.max(...weeks.map((w) => w.cumulative));
    const deficitWeeks = weeks.filter((w) => w.cumulative < 0).length;
    const totalInflows = weeks.reduce((s, w) => s + w.inflows, 0);
    const totalOutflows = weeks.reduce((s, w) => s + w.outflows, 0);
    return { minCum, maxCum, deficitWeeks, totalInflows, totalOutflows };
  }, [weeks]);

  const barMax = useMemo(
    () => Math.max(...weeks.map((w) => Math.max(w.inflows, w.outflows)), 1),
    [weeks]
  );

  const pendingPayables = useMemo(
    () => payables.filter((p) => p.status !== "pagado" && p.status !== "anulado").slice(0, 10),
    [payables]
  );

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-gray-500 dark:text-muted">Cargando datos financieros...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <AlertTriangle className="h-10 w-10 text-red-400" />
        <p className="text-gray-500 dark:text-muted text-sm">Error cargando datos</p>
        <button
          onClick={load}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold"
        >
          <RefreshCw className="h-4 w-4" /> Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-gray-900 dark:text-foreground flex flex-wrap items-center gap-2">
            <TrendingUp className="h-6 w-6 text-primary" /> Proyección de Liquidez
          </h1>
          <p className="text-sm text-gray-500 dark:text-muted mt-0.5">
            Flujo de caja proyectado con base en {sales.length} ventas y {payables.length} cuentas por pagar
          </p>
        </div>
        <button
          onClick={() =>
            exportToCSV(
              weeks.map((w) => ({
                semana: w.weekLabel,
                ingresos: w.inflows,
                egresos: w.outflows,
                saldo_semanal: w.balance,
                acumulado: w.cumulative,
              })),
              `liquidez-${scenario}`
            )
          }
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-sm font-semibold text-gray-700 dark:text-foreground hover:bg-gray-50 dark:hover:bg-accent transition-colors"
        >
          <Download className="h-4 w-4" /> Exportar
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Saldo inicial", value: fmt(openingBalance), color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/30", icon: Wallet },
          { label: "Mínimo proyectado", value: fmt(stats.minCum), color: stats.minCum < 0 ? "text-red-600" : "text-emerald-600", bg: stats.minCum < 0 ? "bg-red-50 dark:bg-red-950/30" : "bg-emerald-50 dark:bg-emerald-950/30", icon: ArrowDown },
          { label: "Máximo proyectado", value: fmt(stats.maxCum), color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/30", icon: ArrowUp },
          { label: "Semanas en déficit", value: String(stats.deficitWeeks), color: stats.deficitWeeks > 0 ? "text-red-600" : "text-emerald-600", bg: stats.deficitWeeks > 0 ? "bg-red-50 dark:bg-red-950/30" : "bg-emerald-50 dark:bg-emerald-950/30", icon: AlertTriangle },
        ].map(({ label, value, color, bg, icon: Icon }) => (
          <div key={label} className={cn("rounded-xl p-4 flex items-start gap-3", bg)}>
            <Icon className={cn("h-5 w-5 mt-0.5", color)} />
            <div>
              <p className="text-xs font-semibold text-gray-500 dark:text-muted">{label}</p>
              <p className={cn("text-xl font-extrabold", color)}>{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Controles */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Horizonte */}
        <div className="flex rounded-xl border border-gray-200 dark:border-card-border overflow-hidden">
          {([30, 60, 90] as const).map((h) => (
            <button
              key={h}
              onClick={() => setHorizon(h)}
              className={cn(
                "px-3 py-2 text-sm font-semibold transition-colors",
                horizon === h
                  ? "bg-primary text-white"
                  : "text-gray-600 dark:text-muted hover:bg-gray-50 dark:hover:bg-surface"
              )}
            >
              {h} días
            </button>
          ))}
        </div>

        {/* Escenario */}
        <div className="flex rounded-xl border border-gray-200 dark:border-card-border bg-gray-100 dark:bg-surface p-1 gap-1">
          {(Object.keys(SCENARIO_META) as Scenario[]).map((k) => (
            <button
              key={k}
              onClick={() => setScenario(k)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-sm font-bold transition-colors",
                scenario === k
                  ? "bg-white dark:bg-card text-gray-900 dark:text-foreground "
                  : "text-gray-500 dark:text-muted hover:text-gray-700"
              )}
            >
              {SCENARIO_META[k].label}
            </button>
          ))}
        </div>
      </div>

      {/* Alerta de déficit */}
      {stats.deficitWeeks > 0 && (
        <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800/40 rounded-xl p-3 flex flex-wrap items-start gap-2">
          <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-red-700 dark:text-red-400">
              Alerta: {stats.deficitWeeks} semana(s) con saldo negativo — escenario {SCENARIO_META[scenario].label}
            </p>
            <p className="text-xs text-red-600/80">
              Considera adelantar cobros o postergar pagos a proveedores
            </p>
          </div>
        </div>
      )}

      {/* Gráfico de barras */}
      <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl p-4 space-y-3">
        <h3 className="text-sm font-bold text-gray-700 dark:text-foreground">
          Ingresos vs Egresos semanales ({horizon} días)
        </h3>
        {weeks.length === 0 ? (
          <p className="text-center text-sm text-gray-400 dark:text-muted py-8">
            Sin datos suficientes para proyectar. Registra ventas para ver la proyección.
          </p>
        ) : (
          <div className="space-y-2">
            {weeks.map((w) => (
              <div key={w.weekLabel} className="flex flex-wrap items-center gap-2 text-xs">
                <span className="w-32 text-gray-500 dark:text-muted shrink-0 truncate">
                  {w.weekLabel.split("(")[0]}
                </span>
                <div className="flex-1 flex flex-col gap-0.5 min-w-[100px]">
                  <div
                    className="h-3 rounded-full bg-emerald-500"
                    style={{ width: `${(w.inflows / barMax) * 100}%` }}
                  />
                  <div
                    className="h-3 rounded-full bg-red-500"
                    style={{ width: `${(w.outflows / barMax) * 100}%` }}
                  />
                </div>
                <span
                  className={cn(
                    "w-24 text-right font-bold",
                    w.balance >= 0 ? "text-emerald-600" : "text-red-600"
                  )}
                >
                  {w.balance >= 0 ? "+" : ""}
                  {fmt(w.balance)}
                </span>
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-4 text-xs text-gray-400 mt-2">
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-full bg-emerald-500" /> Ingresos (proyectados)
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-full bg-red-500" /> Egresos (proyectados)
          </span>
        </div>
      </div>

      {/* Tabla detallada */}
      <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead>
              <tr className="text-left text-xs font-bold text-gray-400 bg-gray-50 dark:bg-surface">
                <th className="px-4 py-3">Semana</th>
                <th className="px-4 py-3">Ingresos</th>
                <th className="px-4 py-3">Egresos</th>
                <th className="px-4 py-3">Saldo semanal</th>
                <th className="px-4 py-3">Acumulado</th>
              </tr>
            </thead>
            <tbody>
              {weeks.map((w) => (
                <tr
                  key={w.weekLabel}
                  className={cn(
                    "border-t border-gray-100 dark:border-card-border",
                    w.cumulative < 0 && "bg-red-50/50 dark:bg-red-950/10"
                  )}
                >
                  <td className="px-4 py-3 font-bold text-gray-700 dark:text-foreground text-xs">
                    {w.weekLabel}
                  </td>
                  <td className="px-4 py-3 text-emerald-600 font-bold flex items-center gap-1">
                    <ArrowUp className="h-3 w-3" />
                    {fmt(w.inflows)}
                  </td>
                  <td className="px-4 py-3 text-red-600 font-bold">
                    <span className="flex items-center gap-1">
                      <ArrowDown className="h-3 w-3" />
                      {fmt(w.outflows)}
                    </span>
                  </td>
                  <td
                    className={cn(
                      "px-4 py-3 font-extrabold",
                      w.balance >= 0 ? "text-emerald-600" : "text-red-600"
                    )}
                  >
                    {w.balance >= 0 ? "+" : ""}
                    {fmt(w.balance)}
                  </td>
                  <td
                    className={cn(
                      "px-4 py-3 font-extrabold",
                      w.cumulative >= 0 ? "text-emerald-600" : "text-red-600"
                    )}
                  >
                    {fmt(w.cumulative)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Compromisos pendientes */}
      {pendingPayables.length > 0 && (
        <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl p-4">
          <h3 className="text-sm font-bold text-gray-700 dark:text-foreground mb-3">
            Compromisos pendientes de pago ({payables.filter((p) => p.status !== "pagado").length} total)
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[400px] text-sm">
              <thead>
                <tr className="text-xs text-gray-400 border-b border-gray-100 dark:border-card-border">
                  <th className="text-left pb-2">Proveedor</th>
                  <th className="text-right pb-2">Monto</th>
                  <th className="text-right pb-2">Pagado</th>
                  <th className="text-right pb-2">Saldo</th>
                  <th className="text-right pb-2">Vencimiento</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-card-border">
                {pendingPayables.map((p) => {
                  const remaining = p.amount - p.paidAmount;
                  const isOverdue = new Date(p.dueDate) < new Date();
                  return (
                    <tr key={p.id} className={cn(isOverdue && "bg-amber-50/50 dark:bg-amber-950/10")}>
                      <td className="py-2 font-semibold text-gray-800 dark:text-foreground">
                        {p.supplierName || "Proveedor"}
                      </td>
                      <td className="py-2 text-right text-gray-600 dark:text-muted">{fmt(p.amount)}</td>
                      <td className="py-2 text-right text-emerald-600">{fmt(p.paidAmount)}</td>
                      <td className="py-2 text-right font-bold text-red-600">{fmt(remaining)}</td>
                      <td
                        className={cn(
                          "py-2 text-right text-xs",
                          isOverdue ? "text-red-600 font-bold" : "text-gray-500 dark:text-muted"
                        )}
                      >
                        {new Date(p.dueDate).toLocaleDateString("es-PE")}
                        {isOverdue && " ⚠"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Totales */}
      <div className="flex flex-wrap items-center gap-4 bg-gray-50 dark:bg-surface rounded-xl p-3 text-sm">
        <div>
          <span className="text-gray-400">Total ingresos proyect.: </span>
          <span className="font-extrabold text-emerald-600 flex items-center gap-1 inline-flex">
            <DollarSign className="h-3.5 w-3.5" />
            {fmt(stats.totalInflows)}
          </span>
        </div>
        <div>
          <span className="text-gray-400">Total egresos proyect.: </span>
          <span className="font-extrabold text-red-600 flex items-center gap-1 inline-flex">
            <DollarSign className="h-3.5 w-3.5" />
            {fmt(stats.totalOutflows)}
          </span>
        </div>
        <div>
          <span className="text-gray-400">Neto: </span>
          <span
            className={cn(
              "font-extrabold",
              stats.totalInflows - stats.totalOutflows >= 0 ? "text-emerald-600" : "text-red-600"
            )}
          >
            {fmt(stats.totalInflows - stats.totalOutflows)}
          </span>
        </div>
      </div>
    </div>
  );
}
