"use client";
import { useState, useEffect, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine, PieChart, Pie, Cell } from "recharts";
import { TrendingUp, Calculator } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/currency";
import { logger } from "@/lib/logger";
import { fetchFinanzas, n, calcHealthScore, MESES, type HealthData } from "@/components/admin/finanzas/shared";

export function HealthSemaphore() {
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Brandon 2026-05-16 (audit P1): usa fetchFinanzas para dedupe + cache.
    Promise.all([
      fetchFinanzas<{ totalMonth?: number; total?: number; monthly?: Array<{ month: string; total: number }> } | null>("/api/expenses/summary", null),
      fetchFinanzas<{ ventasMes?: number; salesMonth?: number; cashToday?: number; efectivoHoy?: number; fiadosVencidosMonto?: number; payablesVencidosMonto?: number } | null>("/api/analytics/kpis-v2", null),
    ])
      .then(([expenses, kpis]) => {
        const ingresos = kpis?.ventasMes ?? kpis?.salesMonth ?? 0;
        const gastos = expenses?.totalMonth ?? expenses?.total ?? 0;
        const efectivo = kpis?.cashToday ?? kpis?.efectivoHoy ?? ingresos * 0.3;
        const fiadosVencidos = kpis?.fiadosVencidosMonto ?? 0;
        const payablesVencidos = kpis?.payablesVencidosMonto ?? 0;
        setData({ ingresos, gastos, efectivo, gastosMensuales: gastos, fiadosVencidos, payablesVencidos });
      })
      .catch((err) => logger.warn("[FinanzasModule] fetch failed (non-critical)", { err: String(err).slice(0, 120) }))
      .finally(() => setLoading(false));
  }, []);

  const score = useMemo(() => data ? calcHealthScore(data) : null, [data]);

  if (loading || !score) {
    return (
      <div className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl p-4 animate-pulse">
        <div className="h-20 w-20 rounded-full bg-gray-200 mx-auto" />
      </div>
    );
  }

  const color = score.total > 70 ? "var(--accent)" : score.total >= 40 ? "#ff6b5b" : "#ef4444";
  const label = score.total > 70 ? "Saludable" : score.total >= 40 ? "Precaucion" : "Critico";
  const bgRing = score.total > 70 ? "ring-[var(--data-success-500)]/40" : score.total >= 40 ? "ring-amber-200" : "ring-red-200";

  const factors = [
    { label: "Margen", pts: score.margenPts, max: 33, detail: `${Number(score.margen).toFixed(1)}%` },
    { label: "Liquidez", pts: score.liquidezPts, max: 33, detail: `${Number(score.liquidez).toFixed(1)}x` },
    { label: "Deudas", pts: score.deudaPts, max: 34, detail: `${Number(score.deudaRatio).toFixed(1)}%` },
  ];

  return (
    <div className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl p-4 sm:p-5 ">
      <div className="flex flex-col sm:flex-row items-center gap-4">
        {/* Circulo grande */}
        <div className={`w-20 h-20 rounded-full flex items-center justify-center ring-4 ${bgRing} shrink-0`} style={{ backgroundColor: `${color}20` }}>
          <div className="text-center">
            <span className="text-2xl font-extrabold" style={{ color }}>{score.total}</span>
            <p className="text-xs font-bold" style={{ color }}>{label}</p>
          </div>
        </div>
        {/* Mini barras */}
        <div className="flex-1 w-full space-y-2">
          <p className="text-xs font-bold text-[var(--text-secondary)]">Salud Financiera</p>
          {factors.map(f => (
            <div key={f.label} className="flex items-center gap-2">
              <span className="text-xs font-semibold text-[var(--text-secondary)] w-14">{f.label}</span>
              <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-[var(--dur-slow)]"
                  style={{ width: `${(f.pts / f.max) * 100}%`, backgroundColor: f.pts === f.max ? "var(--accent)" : f.pts >= f.max * 0.6 ? "#ff6b5b" : "#ef4444" }}
                />
              </div>
              <span className="text-xs font-bold text-[var(--text-secondary)] w-10 text-right">{f.detail}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Mejora 12: Gráfica comparativa mes a mes ─────────────────────────────────


export function ComparativoMensual() {
  const [chartData, setChartData] = useState<Array<{ mes: string; ingresos: number; gastos: number; utilidad: number }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Ingresos mensuales agregados SERVER-SIDE (Sale + Order, INGRESO_ORDER_STATUSES).
    // Antes: /api/sales?limit=5000 crudo bucketeado acá (y sumaba SOLO Sale →
    // inconsistente con el trend de P&L). Reusa /api/finanzas/monthly-summary.
    Promise.all([
      fetchFinanzas<{ totalMonth?: number; monthly?: Array<{ month: string; total: number }> } | null>("/api/expenses/summary", null),
      fetchFinanzas<Array<{ month: string; ingresos: number }>>("/api/finanzas/monthly-summary?months=6", []),
    ])
      .then(([expenses, monthly]) => {
        const series = Array.isArray(monthly) ? monthly : [];
        const months = series.map(({ month: monthKey, ingresos }) => {
          const mm = Number(monthKey.split("-")[1]);
          const label = MESES[(mm || 1) - 1];
          let gastos = 0;
          if (expenses?.monthly && Array.isArray(expenses.monthly)) {
            const m = expenses.monthly.find((e: { month: string; total: number }) => e.month === monthKey);
            gastos = m?.total ?? 0;
          } else if (expenses?.totalMonth && monthKey === series[series.length - 1]?.month) {
            gastos = expenses.totalMonth;
          }
          return { mes: label, ingresos: Math.round(ingresos), gastos: Math.round(gastos), utilidad: Math.round(ingresos - gastos) };
        });
        setChartData(months);
      })
      .catch((err) => logger.warn("[FinanzasModule] fetch failed (non-critical)", { err: String(err).slice(0, 120) }))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl p-4 animate-pulse">
        <div className="h-75 bg-gray-100 rounded-xl" />
      </div>
    );
  }

  if (chartData.length === 0 || chartData.every(d => d.ingresos === 0 && d.gastos === 0)) {
    return null;
  }

  return (
    <div className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl p-4 sm:p-5 ">
      <p className="text-xs font-bold text-[var(--text-secondary)] mb-3">Comparativo Mensual</p>
      <ResponsiveContainer minWidth={0} width="100%" height={300}>
        <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => formatCurrency(v, { decimals: 0 })} />
          <Tooltip
            formatter={(value: unknown, name: unknown) => {
              const v = Number(value);
              const n = String(name);
              return [formatCurrency(v, { decimals: 0 }), n === "ingresos" ? "Ingresos" : n === "gastos" ? "Gastos" : "Utilidad"];
            }}
            labelFormatter={(label: unknown) => `${String(label)} 2026`}
          />
          <Legend formatter={(value: unknown) => { const v = String(value); return v === "ingresos" ? "Ingresos" : v === "gastos" ? "Gastos" : "Utilidad"; }} />
          <Bar dataKey="ingresos" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
          <Bar dataKey="gastos" fill="#e63946" radius={[4, 4, 0, 0]} />
          <Bar dataKey="utilidad" fill="#457b9d" radius={[4, 4, 0, 0]} />
          {/* Mejora 14: Linea de punto de equilibrio (promedio gastos) */}
          {(() => {
            const avgGastos = chartData.reduce((s, d) => s + d.gastos, 0) / Math.max(chartData.length, 1);
            return avgGastos > 0 ? (
              <ReferenceLine
                y={avgGastos}
                stroke="#e63946"
                strokeDasharray="5 5"
                strokeWidth={1.5}
                label={{ value: `PE: S/${Math.round(avgGastos)}`, position: "right", fill: "#e63946", fontSize: 10 }}
              />
            ) : null;
          })()}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Mejora 14: Punto de equilibrio visual ─────────────────────────────────────

 
export function PuntoEquilibrio() {
  const [data, setData] = useState<{ gastoDiario: number; ventasHoy: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetchFinanzas<Record<string, unknown> | null>("/api/expenses/summary", null),
      fetchFinanzas<Record<string, unknown> | null>("/api/analytics/kpis-v2", null),
    ])
      .then(([expenses, kpis]) => {
        const gastosMes = n(expenses?.totalMonth ?? expenses?.total);
        const now = new Date();
        const diasTranscurridos = Math.max(1, now.getDate());
        const gastoDiario = gastosMes / diasTranscurridos;
        const ventasHoy = n(kpis?.ventasHoy ?? kpis?.salesToday);
        setData({ gastoDiario: Math.round(gastoDiario), ventasHoy: Math.round(ventasHoy) });
      })
      .catch((err) => logger.warn("[FinanzasModule] fetch failed (non-critical)", { err: String(err).slice(0, 120) }))
      .finally(() => setLoading(false));
  }, []);

  if (loading || !data) {
    return (
      <div className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl p-4 animate-pulse">
        <div className="h-16 bg-gray-100 rounded-xl" />
      </div>
    );
  }

  if (data.gastoDiario === 0) return null;

  const cubierto = data.ventasHoy >= data.gastoDiario;
  const diferencia = Math.abs(data.ventasHoy - data.gastoDiario);
  const pct = Math.min((data.ventasHoy / data.gastoDiario) * 100, 150);

  return (
    <div className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl p-4 sm:p-5 ">
      <p className="text-xs font-bold text-[var(--text-secondary)] mb-3">Punto de Equilibrio Diario</p>
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <div className="relative h-3 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-[var(--dur-slower)]"
              style={{
                width: `${Math.min(pct, 100)}%`,
                backgroundColor: cubierto ? "var(--accent)" : "#ef4444",
              }}
            />
            {/* Linea de punto de equilibrio */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-gray-900"
              style={{ left: `${Math.min(100 / (pct > 100 ? pct / 100 : 1), 100)}%` }}
            />
          </div>
          <div className="flex justify-between mt-1.5 text-xs text-[var(--text-secondary)]">
            <span>S/0</span>
            <span className="font-bold text-[var(--text-primary)]">Meta: S/{data.gastoDiario}</span>
            <span>S/{Math.round(data.gastoDiario * 1.5)}</span>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-lg font-extrabold" style={{ color: cubierto ? "var(--accent)" : "#ef4444" }}>
            S/{data.ventasHoy}
          </p>
          <p className="text-xs text-[var(--text-secondary)]">vendido hoy</p>
        </div>
      </div>
      <p className={`text-xs font-bold mt-2 ${cubierto ? "text-[var(--data-success-500)]" : "text-[var(--data-error-500)]"}`}>
        {cubierto
          ? `Hoy ya cubriste los gastos (+S/${diferencia} de ganancia)`
          : `Faltan S/${diferencia} para cubrir gastos del día`}
      </p>
    </div>
  );
}

// ── Mejora 15: Desglose de gastos con donut ──────────────────────────────────

const EXPENSE_COLORS: Record<string, string> = {
  "Mercaderia": "var(--color-primary)",
  "mercaderia": "var(--color-primary)",
  "Alquiler": "#ff6b5b",
  "alquiler": "#ff6b5b",
  "Servicios": "#457b9d",
  "servicios": "#457b9d",
  "Personal": "#9b5de5",
  "personal": "#9b5de5",
  "Transporte": "#e63946",
  "transporte": "#e63946",
  "Marketing": "#14C2C2",
  "marketing": "#14C2C2",
  "Otros": "#6b7280",
  "otros": "#6b7280",
  "limpieza": "#06b6d4",
};

 
export function GastosDonut() {
  const [gastos, setGastos] = useState<Array<{ category: string; total: number }>>([]);
  // Mejora 13: Promedio historico por categoria para detectar gastos inusuales
  const [categoryAvg, setCategoryAvg] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/expenses?limit=2000")
      .then(r => r.ok ? r.json() : [])
      .then((data) => {
        const items = Array.isArray(data) ? data : (data.expenses ?? []);
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);

        // Group expenses of current month by category
        const map = new Map<string, number>();
        // Mejora 13: Track last 3 months by category for average
        const historyMap = new Map<string, number[]>();
        for (const e of items) {
          const d = new Date(e.date ?? e.createdAt ?? "");
          const cat = e.category ?? "otros";
          if (d >= startOfMonth) {
            map.set(cat, (map.get(cat) ?? 0) + (e.amount ?? 0));
          } else if (d >= threeMonthsAgo && d < startOfMonth) {
            if (!historyMap.has(cat)) historyMap.set(cat, []);
            historyMap.get(cat)!.push(e.amount ?? 0);
          }
        }

        // Compute average per category from last 3 months
        const avgMap = new Map<string, number>();
        for (const [cat, amounts] of historyMap.entries()) {
          const totalHist = amounts.reduce((s, a) => s + a, 0);
          avgMap.set(cat, totalHist / 3); // average over 3 months
        }
        setCategoryAvg(avgMap);

        const result = Array.from(map.entries())
          .map(([category, total]) => ({ category, total: Math.round(total) }))
          .filter(g => g.total > 0)
          .sort((a, b) => b.total - a.total);

        setGastos(result);
      })
      .catch((err) => logger.warn("[FinanzasModule] fetch failed (non-critical)", { err: String(err).slice(0, 120) }))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl p-4 animate-pulse">
        <div className="h-55 bg-gray-100 rounded-xl" />
      </div>
    );
  }

  if (gastos.length === 0) return null;

  const total = gastos.reduce((s, g) => s + g.total, 0);
  const chartData = gastos.map(g => ({
    name: g.category.charAt(0).toUpperCase() + g.category.slice(1),
    value: g.total,
    pct: total > 0 ? Math.round((g.total / total) * 100) : 0,
  }));

  const getColor = (category: string) => EXPENSE_COLORS[category] ?? EXPENSE_COLORS[category.toLowerCase()] ?? "#6b7280";

  return (
    <div className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl p-4 sm:p-5 ">
      <p className="text-xs font-bold text-[var(--text-secondary)] mb-3">Gastos del Mes por Categoria</p>
      <div className="flex flex-col sm:flex-row items-center gap-4">
        <div className="relative w-45 h-45">
          <ResponsiveContainer minWidth={0} width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={80}
                paddingAngle={2}
                dataKey="value"
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={getColor(entry.name)} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: unknown, name: unknown) => [formatCurrency(Number(value), { decimals: 0 }), String(name)]}
              />
            </PieChart>
          </ResponsiveContainer>
          {/* Center label */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center">
              <p className="text-xs text-[var(--text-tertiary)]">Total</p>
              <p className={cn("text-sm font-extrabold", total === 0 ? "text-[var(--text-tertiary)]" : "text-[var(--text-primary)]")}>{formatCurrency(total, { decimals: 0 })}</p>
            </div>
          </div>
        </div>
        <div className="flex-1 space-y-1.5 w-full">
          {chartData.filter(g => g.name).map((g, i) => {
            // Mejora 13: Detectar gasto inusual (> 2x promedio)
            const avg = categoryAvg.get(g.name) ?? categoryAvg.get(g.name.toLowerCase()) ?? 0;
            const isUnusual = avg > 0 && g.value > avg * 2;
            const pctOver = avg > 0 ? Math.round(((g.value - avg) / avg) * 100) : 0;
            return (
              <div key={g.name || i} className="flex items-center gap-2 text-xs">
                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: getColor(g.name) }} />
                <span className="flex-1 text-[var(--text-primary)] font-semibold truncate">{g.name}</span>
                {isUnusual && (
                  <span
                    className="shrink-0 px-1.5 py-0.5 rounded-full bg-[var(--data-warning-100)] text-[var(--data-warning-500)] text-xs font-bold"
                    title={`Este gasto es ${pctOver}% mayor al promedio de S/${Math.round(avg)} en ${g.name}`}
                  >
                    Gasto inusual
                  </span>
                )}
                <span className="text-[var(--text-secondary)]">{formatCurrency(g.value, { decimals: 0 })}</span>
                <span className="text-[var(--text-tertiary)] w-8 text-right">{g.pct}%</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Mejora 16: Proyeccion de cierre de mes ───────────────────────────────────

 
export function ProyeccionCierreMes() {
  const [data, setData] = useState<{
    ventasMes: number;
    gastosMes: number;
    diasTranscurridos: number;
    diasTotales: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetchFinanzas<Record<string, unknown> | null>("/api/expenses/summary", null),
      fetchFinanzas<Record<string, unknown> | null>("/api/analytics/kpis-v2", null),
    ])
      .then(([expenses, kpis]) => {
        const now = new Date();
        const diasTranscurridos = Math.max(1, now.getDate());
        const diasTotales = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        const ventasMes = n(kpis?.ventasMes ?? kpis?.salesMonth);
        const gastosMes = n(expenses?.totalMonth ?? expenses?.total);
        setData({ ventasMes, gastosMes, diasTranscurridos, diasTotales });
      })
      .catch((err) => logger.warn("[FinanzasModule] fetch failed (non-critical)", { err: String(err).slice(0, 120) }))
      .finally(() => setLoading(false));
  }, []);

  if (loading || !data) {
    return (
      <div className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl p-4 animate-pulse">
        <div className="h-32 bg-gray-100 rounded-xl" />
      </div>
    );
  }

  const ventasDiarias = data.ventasMes / data.diasTranscurridos;
  const ventasProyectadas = Math.round(ventasDiarias * data.diasTotales);
  const gastosProyectados = Math.round((data.gastosMes / data.diasTranscurridos) * data.diasTotales);
  const utilidadProyectada = ventasProyectadas - gastosProyectados;
  const progreso = data.diasTotales > 0 ? (data.diasTranscurridos / data.diasTotales) * 100 : 0;
  const mesNombre = new Date().toLocaleDateString("es-PE", { month: "long", year: "numeric" });

  return (
    <div className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl p-4 sm:p-5 ">
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp className="h-4 w-4 text-[var(--text-secondary)]" />
        <p className="text-xs font-bold text-[var(--text-secondary)]">
          Proyeccion {mesNombre.charAt(0).toUpperCase() + mesNombre.slice(1)}
        </p>
      </div>
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="text-center">
          <p className="text-xs font-bold text-[var(--text-tertiary)] uppercase">Ventas proy.</p>
          <p className={cn("text-base font-extrabold", ventasProyectadas === 0 ? "text-[var(--text-tertiary)]" : "text-primary")}>{formatCurrency(ventasProyectadas, { decimals: 0 })}</p>
        </div>
        <div className="text-center">
          <p className="text-xs font-bold text-[var(--text-tertiary)] uppercase">Gastos proy.</p>
          <p className={cn("text-base font-extrabold", gastosProyectados === 0 ? "text-[var(--text-tertiary)]" : "text-[var(--data-error-500)]")}>{formatCurrency(gastosProyectados, { decimals: 0 })}</p>
        </div>
        <div className="text-center">
          <p className="text-xs font-bold text-[var(--text-tertiary)] uppercase">Utilidad est.</p>
          <p className={cn("text-base font-extrabold", utilidadProyectada === 0 ? "text-[var(--text-tertiary)]" : utilidadProyectada >= 0 ? "text-[var(--data-success-500)]" : "text-[var(--data-error-500)]")}>
            {utilidadProyectada >= 0 ? "+" : ""}{formatCurrency(Math.abs(utilidadProyectada), { decimals: 0 })}
          </p>
        </div>
      </div>
      {/* Progress bar */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs text-[var(--text-secondary)]">
          <span>Dia {data.diasTranscurridos} de {data.diasTotales}</span>
          <span>{Math.round(progreso)}% del mes</span>
        </div>
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-[var(--dur-slower)] bg-primary"
            style={{ width: `${progreso}%` }}
          />
        </div>
        <p className="text-xs text-[var(--text-tertiary)] text-center">
          Ventas actuales: {formatCurrency(Math.round(data.ventasMes), { decimals: 0 })} de {formatCurrency(ventasProyectadas, { decimals: 0 })} proyectados
        </p>
      </div>
    </div>
  );
}

// ── Mejora 12: Resumen fiscal mensual ────────────────────────────────────────

 
export function ResumenFiscal() {
  const [data, setData] = useState<{ ventas: number; compras: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetchFinanzas<Record<string, unknown> | null>("/api/analytics/kpis-v2", null),
      fetchFinanzas<Record<string, unknown> | null>("/api/expenses/summary", null),
    ])
      .then(([kpis, expenses]) => {
        const ventas = n(kpis?.ventasMes ?? kpis?.salesMonth);
        const compras = n(expenses?.totalMonth ?? expenses?.total);
        setData({ ventas, compras });
      })
      .catch((err) => logger.warn("[FinanzasModule] fetch failed (non-critical)", { err: String(err).slice(0, 120) }))
      .finally(() => setLoading(false));
  }, []);

  if (loading || !data) {
    return (
      <div className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl p-4 animate-pulse">
        <div className="h-32 bg-gray-100 rounded-xl" />
      </div>
    );
  }

  const igvCobrado = data.ventas * 0.18 / 1.18;
  const igvPagado = data.compras * 0.18 / 1.18;
  const igvNeto = igvCobrado - igvPagado;
  const mesActual = new Date().toLocaleDateString("es-PE", { month: "long", year: "numeric" });

  return (
    <div className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl p-4 sm:p-5 ">
      <div className="flex items-center gap-2 mb-3">
        <Calculator className="h-4 w-4 text-[var(--data-warning-500)]" />
        <p className="text-xs font-bold text-[var(--text-secondary)]">
          Resumen Fiscal — {mesActual.charAt(0).toUpperCase() + mesActual.slice(1)}
        </p>
      </div>
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-[var(--text-secondary)]">Ventas gravadas</span>
          <span className="font-bold text-[var(--text-primary)]">{formatCurrency(Math.round(data.ventas), { decimals: 0 })}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-[var(--text-secondary)]">IGV cobrado (18%)</span>
          <span className="font-bold text-[var(--text-primary)]">{formatCurrency(Math.round(igvCobrado), { decimals: 0 })}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-[var(--text-secondary)]">Compras deducibles</span>
          <span className="font-bold text-[var(--text-primary)]">{formatCurrency(Math.round(data.compras), { decimals: 0 })}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-[var(--text-secondary)]">IGV pagado</span>
          <span className="font-bold text-[var(--text-primary)]">{formatCurrency(Math.round(igvPagado), { decimals: 0 })}</span>
        </div>
        <div className="border-t border-[var(--rule-base)] pt-2 mt-2 flex justify-between text-sm">
          <span className="font-bold text-[var(--text-primary)]">IGV a pagar</span>
          <span className={`font-extrabold ${igvNeto > 0 ? "text-[var(--data-error-500)]" : "text-[var(--data-success-500)]"}`}>
            {igvNeto > 0 ? "" : "-"}{formatCurrency(Math.abs(Math.round(igvNeto)), { decimals: 0 })}
            {igvNeto <= 0 && <span className="text-xs font-normal ml-1">(crédito fiscal)</span>}
          </span>
        </div>
      </div>
      <p className="text-xs text-[var(--text-tertiary)] mt-3 italic">
        Referencia aproximada — consulte con su contador
      </p>
    </div>
  );
}

// ── Mejora 9 nueva: Reporte Bancario ─────────────────────────────────────────


/* Semicircular gauge built from PieChart */
export function GaugeChart({ value, max, label, unit, color }: { value: number; max: number; label: string; unit: string; color: string }) {
  const pct = Math.min(Math.max(value / max, 0), 1);
  const filled = pct * 100;
  const empty = 100 - filled;
  const data = [
    { name: "filled", value: filled },
    { name: "empty", value: empty },
  ];
  return (
    <div className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl p-4  flex flex-col items-center">
      <p className="text-xs font-bold text-[var(--text-secondary)] mb-1">{label}</p>
      <div className="relative w-35 h-20">
        <ResponsiveContainer minWidth={0} width="100%" height={80}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="100%"
              startAngle={180}
              endAngle={0}
              innerRadius={45}
              outerRadius={65}
              dataKey="value"
              stroke="none"
            >
              <Cell fill={color} />
              <Cell fill="#e5e7eb" className="" />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex items-end justify-center pb-0 pointer-events-none">
          <span className="text-lg font-extrabold" style={{ color }}>{unit === "%" ? `${value.toFixed(0)}%` : `${value.toFixed(1)}x`}</span>
        </div>
      </div>
    </div>
  );
}



// Flat wrapper (animations removed for professional style)
export function StaggerItem({ children }: { children: React.ReactNode; index?: number }) {
  return <div>{children}</div>;
}



