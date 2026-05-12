"use client";

import { CardTitle, LoadingState, PageTitle } from "@buleje/design-system";
import { useState, useEffect, useMemo } from "react";
import {
  TrendingUp, Download, AlertTriangle,
  ArrowUp, ArrowDown, Wallet, DollarSign, Loader2, RefreshCw,
} from "@buleje/design-system/icons";
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
  base:      { label: "Base",      color: "text-[var(--data-success-500)]"    },
  optimista: { label: "Optimista", color: "text-[var(--data-success-500)]" },
  pesimista: { label: "Pesimista", color: "text-[var(--data-error-500)]"     },
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
      <LoadingState message="Cargando datos financieros..." />
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <AlertTriangle className="h-10 w-10 text-[var(--data-error-500)]" />
        <p className="text-[var(--text-secondary)] dark:text-muted text-sm">Error cargando datos</p>
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
          <PageTitle className="text-xl sm:text-2xl font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)] flex flex-wrap items-center gap-2">
            <TrendingUp className="h-6 w-6 text-primary" /> Proyección de Liquidez
          </PageTitle>
          <p className="text-sm text-[var(--text-secondary)] dark:text-muted mt-0.5">
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
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-white dark:bg-surface text-sm font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)] hover:bg-[var(--surface-alt)] dark:hover:bg-accent transition-colors"
        >
          <Download className="h-4 w-4" /> Exportar
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Saldo inicial", value: fmt(openingBalance), color: "text-[var(--data-success-500)]", bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]", icon: Wallet },
          { label: "Mínimo proyectado", value: fmt(stats.minCum), color: stats.minCum < 0 ? "text-[var(--data-error-500)]" : "text-[var(--data-success-500)]", bg: stats.minCum < 0 ? "bg-[var(--data-error-50)] dark:bg-red-950/30" : "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]", icon: ArrowDown },
          { label: "Máximo proyectado", value: fmt(stats.maxCum), color: "text-[var(--data-success-500)]", bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]", icon: ArrowUp },
          { label: "Semanas en déficit", value: String(stats.deficitWeeks), color: stats.deficitWeeks > 0 ? "text-[var(--data-error-500)]" : "text-[var(--data-success-500)]", bg: stats.deficitWeeks > 0 ? "bg-[var(--data-error-50)] dark:bg-red-950/30" : "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]", icon: AlertTriangle },
        ].map(({ label, value, color, bg, icon: Icon }) => (
          <div key={label} className={cn("rounded-xl p-4 flex items-start gap-3", bg)}>
            <Icon className={cn("h-5 w-5 mt-0.5", color)} />
            <div>
              <p className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted">{label}</p>
              <p className={cn("text-xl font-extrabold", color)}>{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Controles */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Horizonte */}
        <div className="flex rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] overflow-hidden">
          {([30, 60, 90] as const).map((h) => (
            <button
              key={h}
              onClick={() => setHorizon(h)}
              className={cn(
                "px-3 py-2 text-sm font-semibold transition-colors",
                horizon === h
                  ? "bg-primary text-white"
                  : "text-[var(--text-secondary)] dark:text-muted hover:bg-[var(--surface-alt)] dark:hover:bg-surface"
              )}
            >
              {h} días
            </button>
          ))}
        </div>

        {/* Escenario */}
        <div className="flex rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-[var(--surface-sunken)] dark:bg-surface p-1 gap-1">
          {(Object.keys(SCENARIO_META) as Scenario[]).map((k) => (
            <button
              key={k}
              onClick={() => setScenario(k)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-sm font-bold transition-colors",
                scenario === k
                  ? "bg-[var(--surface-raised)] text-[var(--text-primary)] dark:text-[var(--text-primary)] "
                  : "text-[var(--text-secondary)] dark:text-muted hover:text-[var(--text-primary)]"
              )}
            >
              {SCENARIO_META[k].label}
            </button>
          ))}
        </div>
      </div>

      {/* Alerta de déficit */}
      {stats.deficitWeeks > 0 && (
        <div className="bg-[var(--data-error-50)] dark:bg-red-950/20 border border-[var(--data-error-500)] dark:border-[var(--data-error-500)]/40 rounded-xl p-3 flex flex-wrap items-start gap-2">
          <AlertTriangle className="h-5 w-5 text-[var(--data-error-500)] shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-[var(--data-error-500)] dark:text-[var(--data-error-500)]">
              Alerta: {stats.deficitWeeks} semana(s) con saldo negativo — escenario {SCENARIO_META[scenario].label}
            </p>
            <p className="text-xs text-[var(--data-error-500)]/80">
              Considera adelantar cobros o postergar pagos a proveedores
            </p>
          </div>
        </div>
      )}

      {/* Gráfico de barras */}
      <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-4 space-y-3">
        <CardTitle className="text-sm font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">
          Ingresos vs Egresos semanales ({horizon} días)
        </CardTitle>
        {weeks.length === 0 ? (
          <p className="text-center text-sm text-[var(--text-tertiary)] dark:text-muted py-8">
            Sin datos suficientes para proyectar. Registra ventas para ver la proyección.
          </p>
        ) : (
          <div className="space-y-2">
            {weeks.map((w) => (
              <div key={w.weekLabel} className="flex flex-wrap items-center gap-2 text-xs">
                <span className="w-32 text-[var(--text-secondary)] dark:text-muted shrink-0 truncate">
                  {w.weekLabel.split("(")[0]}
                </span>
                <div className="flex-1 flex flex-col gap-0.5 min-w-[100px]">
                  <div
                    className="h-3 rounded-full bg-[var(--accent-soft)]"
                    style={{ width: `${(w.inflows / barMax) * 100}%` }}
                  />
                  <div
                    className="h-3 rounded-full bg-[var(--data-error-500)]"
                    style={{ width: `${(w.outflows / barMax) * 100}%` }}
                  />
                </div>
                <span
                  className={cn(
                    "w-24 text-right font-bold",
                    w.balance >= 0 ? "text-[var(--data-success-500)]" : "text-[var(--data-error-500)]"
                  )}
                >
                  {w.balance >= 0 ? "+" : ""}
                  {fmt(w.balance)}
                </span>
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-4 text-xs text-[var(--text-tertiary)] mt-2">
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-full bg-[var(--accent-soft)]" /> Ingresos (proyectados)
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-full bg-[var(--data-error-500)]" /> Egresos (proyectados)
          </span>
        </div>
      </div>

      {/* Tabla detallada */}
      <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead>
              <tr className="text-left text-xs font-bold text-[var(--text-tertiary)] bg-[var(--surface-alt)] dark:bg-surface">
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
                    "border-t border-[var(--rule-soft)] dark:border-[var(--rule-base)]",
                    w.cumulative < 0 && "bg-[var(--data-error-50)]/50 dark:bg-red-950/10"
                  )}
                >
                  <td className="px-4 py-3 font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] text-xs">
                    {w.weekLabel}
                  </td>
                  <td className="px-4 py-3 text-[var(--data-success-500)] font-bold flex items-center gap-1">
                    <ArrowUp className="h-3 w-3" />
                    {fmt(w.inflows)}
                  </td>
                  <td className="px-4 py-3 text-[var(--data-error-500)] font-bold">
                    <span className="flex items-center gap-1">
                      <ArrowDown className="h-3 w-3" />
                      {fmt(w.outflows)}
                    </span>
                  </td>
                  <td
                    className={cn(
                      "px-4 py-3 font-extrabold",
                      w.balance >= 0 ? "text-[var(--data-success-500)]" : "text-[var(--data-error-500)]"
                    )}
                  >
                    {w.balance >= 0 ? "+" : ""}
                    {fmt(w.balance)}
                  </td>
                  <td
                    className={cn(
                      "px-4 py-3 font-extrabold",
                      w.cumulative >= 0 ? "text-[var(--data-success-500)]" : "text-[var(--data-error-500)]"
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
        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-4">
          <CardTitle className="text-sm font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] mb-3">
            Compromisos pendientes de pago ({payables.filter((p) => p.status !== "pagado").length} total)
          </CardTitle>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[400px] text-sm">
              <thead>
                <tr className="text-xs text-[var(--text-tertiary)] border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)]">
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
                    <tr key={p.id} className={cn(isOverdue && "bg-[var(--data-warning-50)]/50 dark:bg-amber-950/10")}>
                      <td className="py-2 font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)]">
                        {p.supplierName || "Proveedor"}
                      </td>
                      <td className="py-2 text-right text-[var(--text-secondary)] dark:text-muted">{fmt(p.amount)}</td>
                      <td className="py-2 text-right text-[var(--data-success-500)]">{fmt(p.paidAmount)}</td>
                      <td className="py-2 text-right font-bold text-[var(--data-error-500)]">{fmt(remaining)}</td>
                      <td
                        className={cn(
                          "py-2 text-right text-xs",
                          isOverdue ? "text-[var(--data-error-500)] font-bold" : "text-[var(--text-secondary)] dark:text-muted"
                        )}
                      >
                        {new Date(p.dueDate).toLocaleDateString("es-PE")}
                        {isOverdue && " !"}
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
      <div className="flex flex-wrap items-center gap-4 bg-[var(--surface-alt)] dark:bg-surface rounded-xl p-3 text-sm">
        <div>
          <span className="text-[var(--text-tertiary)]">Total ingresos proyect.: </span>
          <span className="font-extrabold text-[var(--data-success-500)] flex items-center gap-1 inline-flex">
            <DollarSign className="h-3.5 w-3.5" />
            {fmt(stats.totalInflows)}
          </span>
        </div>
        <div>
          <span className="text-[var(--text-tertiary)]">Total egresos proyect.: </span>
          <span className="font-extrabold text-[var(--data-error-500)] flex items-center gap-1 inline-flex">
            <DollarSign className="h-3.5 w-3.5" />
            {fmt(stats.totalOutflows)}
          </span>
        </div>
        <div>
          <span className="text-[var(--text-tertiary)]">Neto: </span>
          <span
            className={cn(
              "font-extrabold",
              stats.totalInflows - stats.totalOutflows >= 0 ? "text-[var(--data-success-500)]" : "text-[var(--data-error-500)]"
            )}
          >
            {fmt(stats.totalInflows - stats.totalOutflows)}
          </span>
        </div>
      </div>
    </div>
  );
}
