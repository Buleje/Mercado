"use client";

import { LoadingState, PageTitle } from "@buleje/design-system";
import { useState, useEffect, useCallback } from "react";
import { TrendingUp, TrendingDown, Minus, Loader2, RefreshCw } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────

type Sale = {
  id: string;
  createdAt: string;
  total: number;
};

type MonthStats = {
  total: number;
  byDay: { day: number; total: number }[];
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getDayOfMonth() {
  return new Date().getDate();
}

function computeMonthStats(sales: Sale[], year: number, month: number): MonthStats {
  const filtered = sales.filter(s => {
    const d = new Date(s.createdAt);
    return d.getFullYear() === year && d.getMonth() === month;
  });
  const total = filtered.reduce((sum, s) => sum + (s.total ?? 0), 0);

  const dayMap: Record<number, number> = {};
  for (const s of filtered) {
    const day = new Date(s.createdAt).getDate();
    dayMap[day] = (dayMap[day] ?? 0) + (s.total ?? 0);
  }
  const byDay = Object.entries(dayMap)
    .map(([d, t]) => ({ day: Number(d), total: t }))
    .sort((a, b) => a.day - b.day);

  return { total, byDay };
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function MonthProjectionCard() {
  const [allSales, setAllSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSales = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/sales");
      if (!res.ok) throw new Error("Error al obtener ventas");
      const data = await res.json();
      setAllSales(Array.isArray(data) ? data : []);
    } catch {
      setError("No se pudo cargar las ventas.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSales();
  }, [fetchSales]);

  // Calculos
  const now = new Date();
  const curYear = now.getFullYear();
  const curMonth = now.getMonth();
  const prevMonth = curMonth === 0 ? 11 : curMonth - 1;
  const prevYear = curMonth === 0 ? curYear - 1 : curYear;

  const daysElapsed = getDayOfMonth();
  const daysTotal = getDaysInMonth(curYear, curMonth);
  const daysInPrevMonth = getDaysInMonth(prevYear, prevMonth);

  const currentStats = computeMonthStats(allSales, curYear, curMonth);
  const prevStats = computeMonthStats(allSales, prevYear, prevMonth);

  const dailyAvg = daysElapsed > 0 ? currentStats.total / daysElapsed : 0;
  const projection = dailyAvg * daysTotal;
  const delta = prevStats.total > 0 ? ((projection - prevStats.total) / prevStats.total) * 100 : 0;

  // Mini barras: ultimos 7 dias del mes actual acumulados
  const MINI_BARS = 7;
  const recentDays: { label: string; total: number }[] = [];
  for (let i = MINI_BARS - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const day = d.getDate();
    const dayMonth = d.getMonth();
    const dayYear = d.getFullYear();
    const found = allSales
      .filter(s => {
        const sd = new Date(s.createdAt);
        return sd.getDate() === day && sd.getMonth() === dayMonth && sd.getFullYear() === dayYear;
      })
      .reduce((sum, s) => sum + (s.total ?? 0), 0);
    recentDays.push({ label: String(day), total: found });
  }

  const maxBar = Math.max(...recentDays.map(d => d.total), 1);

  const trendIcon =
    delta > 0 ? <TrendingUp className="h-4 w-4" /> :
    delta < 0 ? <TrendingDown className="h-4 w-4" /> :
    <Minus className="h-4 w-4" />;

  const trendColor =
    delta > 0 ? "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]" :
    delta < 0 ? "text-[var(--data-error-500)] dark:text-[var(--data-error-500)]" :
    "text-[var(--text-tertiary)]";

  const MONTHS = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]  overflow-hidden">
      {/* Header */}
      <div className="bg-primary px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-white" />
          <span className="text-white font-semibold text-sm">Proyeccion de Cierre</span>
        </div>
        <button
          onClick={fetchSales}
          disabled={loading}
          className="text-white/70 hover:text-white transition-colors"
          aria-label="Actualizar"
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </button>
      </div>

      {/* Body */}
      <div className="p-5">
        {loading ? (
          <LoadingState />
        ) : error ? (
          <p className="text-sm text-[var(--data-error-500)] dark:text-[var(--data-error-500)] text-center py-6">{error}</p>
        ) : (
          <div className="space-y-5">
            {/* Mes actual */}
            <div>
              <p className="text-xs text-[var(--text-tertiary)] mb-1">
                {MONTHS[curMonth]} {curYear} — dia {daysElapsed} de {daysTotal}
              </p>
              <PageTitle as="p">{fmt(projection)}</PageTitle>
              <p className="text-xs text-[var(--text-tertiary)] mt-0.5">proyeccion de cierre</p>
            </div>

            {/* Comparacion vs mes anterior */}
            <div className="flex items-center gap-2 rounded-lg bg-[var(--surface-sunken)] px-3 py-2.5">
              <span className={cn("flex items-center gap-1 font-semibold text-sm", trendColor)}>
                {trendIcon}
                {delta >= 0 ? "+" : ""}{delta.toFixed(1)}%
              </span>
              <span className="text-xs text-[var(--text-tertiary)]">
                vs {MONTHS[prevMonth]} ({fmt(prevStats.total)} real en {daysInPrevMonth} dias)
              </span>
            </div>

            {/* Datos del mes */}
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-[var(--surface-sunken)] p-3">
                <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mb-0.5">Acumulado</p>
                <p className="text-sm font-semibold text-[var(--text-primary)]">{fmt(currentStats.total)}</p>
              </div>
              <div className="rounded-lg bg-[var(--surface-sunken)] p-3">
                <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mb-0.5">Prom. diario</p>
                <p className="text-sm font-semibold text-[var(--text-primary)]">{fmt(dailyAvg)}</p>
              </div>
            </div>

            {/* Mini grafico — ultimos 7 dias */}
            <div>
              <p className="text-[length:var(--ts-2xs)] font-medium text-[var(--text-tertiary)] mb-2">
                Ultimos 7 dias (ventas reales)
              </p>
              <div className="flex items-end gap-1 h-14">
                {recentDays.map((d, i) => {
                  const h = maxBar > 0 ? (d.total / maxBar) * 100 : 0;
                  const isToday = i === recentDays.length - 1;
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                      <div
                        className={cn(
                          "w-full rounded-t-sm min-h-[2px] transition-all",
                          isToday
                            ? "bg-[var(--data-warning-500)] dark:bg-[var(--data-warning-500)]"
                            : "bg-primary dark:bg-[var(--accent-soft)]"
                        )}
                        style={{ height: `${Math.max(h, 2)}%` }}
                        title={`Dia ${d.label}: ${fmt(d.total)}`}
                      />
                      <span className={cn(
                        "text-[length:var(--ts-2xs)]",
                        isToday ? "text-[var(--data-warning-500)] font-semibold" : "text-[var(--text-tertiary)]"
                      )}>
                        {d.label}
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mt-1 text-right">
                naranja = hoy
              </p>
            </div>

            {/* Dias restantes */}
            <div className="text-xs text-[var(--text-tertiary)] text-center">
              Faltan <span className="font-semibold text-[var(--text-secondary)]">{daysTotal - daysElapsed}</span> dias para cerrar {MONTHS[curMonth]}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
