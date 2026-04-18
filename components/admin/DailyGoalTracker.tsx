"use client";

import { SectionTitle } from "@buleje/design-system";
import { useState, useEffect, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import { Target, TrendingUp, RefreshCw } from "@buleje/design-system/icons";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Sale {
  id: string;
  total: number;
  createdAt: string;
}

interface HourlyBucket {
  hour: number;        // 0-23
  label: string;       // "8am", "12pm"...
  revenue: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const DEFAULT_DAILY_GOAL = 3000;
const REFRESH_INTERVAL_MS = 30 * 1000; // 30 segundos

function fmt(n: number): string {
  return `S/${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function getHourLabel(hour: number): string {
  if (hour === 0) return "12am";
  if (hour < 12) return `${hour}am`;
  if (hour === 12) return "12pm";
  return `${hour - 12}pm`;
}

function buildHourlyBuckets(sales: Sale[]): HourlyBucket[] {
  const buckets: HourlyBucket[] = Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    label: getHourLabel(h),
    revenue: 0,
  }));

  const today = new Date().toDateString();
  for (const s of sales) {
    const d = new Date(s.createdAt);
    if (d.toDateString() !== today) continue;
    buckets[d.getHours()].revenue += s.total;
  }

  return buckets;
}

// Solo mostrar horas desde la primera con ventas hasta la hora actual + 1
function trimBuckets(buckets: HourlyBucket[]): HourlyBucket[] {
  const currentHour = new Date().getHours();
  const firstWithSales = buckets.findIndex((b) => b.revenue > 0);
  const start = firstWithSales === -1 ? Math.max(0, currentHour - 8) : Math.max(0, firstWithSales);
  const end = Math.min(23, currentHour + 1);
  return buckets.slice(start, end + 1);
}

// ─── Confetti visual simple ────────────────────────────────────────────────────

function Confetti() {
  const colors = ["#00B4A6", "#f97316", "#2dd4bf", "#f4d03f", "#e76f51"];

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl">
      {Array.from({ length: 24 }).map((_, i) => {
        const color = colors[i % colors.length];
        const left = `${(i * 4.2) % 100}%`;
        const delay = `${(i * 0.12) % 1.2}s`;
        const size = 6 + (i % 4) * 2;
        return (
          <div
            key={i}
            className="absolute top-0 animate-bounce"
            style={{
              left,
              backgroundColor: color,
              width: size,
              height: size,
              borderRadius: i % 2 === 0 ? "50%" : "2px",
              animationDelay: delay,
              animationDuration: `${0.8 + (i % 4) * 0.2}s`,
              opacity: 0.8,
            }}
          />
        );
      })}
    </div>
  );
}

// ─── Subcomponente: Mini grafico de barras por hora ───────────────────────────

function HourlyChart({ buckets }: { buckets: HourlyBucket[] }) {
  if (buckets.length === 0) return null;
  const maxRev = Math.max(...buckets.map((b) => b.revenue), 1);
  const currentHour = new Date().getHours();

  return (
    <div>
      <p className="text-xs font-medium text-[var(--text-tertiary)] mb-3">
        Ventas por hora
      </p>
      <div className="flex items-end gap-1 h-20">
        {buckets.map((b) => {
          const heightPct = (b.revenue / maxRev) * 100;
          const isCurrent = b.hour === currentHour;
          return (
            <div
              key={b.hour}
              className="flex-1 flex flex-col items-center gap-1 group relative"
              title={`${b.label}: ${fmt(b.revenue)}`}
            >
              {/* Tooltip */}
              {b.revenue > 0 && (
                <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-gray-800 dark:bg-gray-600 text-white text-[length:var(--ts-2xs)] rounded px-1.5 py-0.5 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                  {fmt(b.revenue)}
                </div>
              )}

              {/* Barra */}
              <div className="w-full flex items-end" style={{ height: "64px" }}>
                <div
                  className={cn(
                    "w-full rounded-t transition-all duration-[var(--dur-slow)]",
                    isCurrent
                      ? "bg-[#f97316]"
                      : b.revenue > 0
                      ? "bg-[#00B4A6] dark:bg-[#2dd4bf]"
                      : "bg-[var(--surface-sunken)]"
                  )}
                  style={{ height: `${Math.max(heightPct, b.revenue > 0 ? 8 : 2)}%` }}
                />
              </div>

              {/* Etiqueta hora */}
              <span className={cn(
                "text-[length:var(--ts-2xs)] leading-none",
                isCurrent
                  ? "text-[#f97316] font-bold"
                  : "text-[var(--text-tertiary)]"
              )}>
                {b.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

interface DailyGoalTrackerProps {
  dailyGoal?: number;
}

export default function DailyGoalTracker({ dailyGoal = DEFAULT_DAILY_GOAL }: DailyGoalTrackerProps) {
  const [totalToday, setTotalToday] = useState(0);
  const [hourlyBuckets, setHourlyBuckets] = useState<HourlyBucket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [celebrated, setCelebrated] = useState(false);
  const prevTotalRef = useRef(0);

  const pct = Math.min(100, (totalToday / dailyGoal) * 100);
  const isGoalMet = pct >= 100;
  const remaining = Math.max(0, dailyGoal - totalToday);

  const fetchSales = useCallback(async () => {
    try {
      const res = await fetch("/api/sales?today=1", { credentials: "include" });
      if (!res.ok) throw new Error(`Error ${res.status}`);

      const data: Sale[] = await res.json();
      const today = new Date().toDateString();
      const todaySales = Array.isArray(data)
        ? data.filter((s) => new Date(s.createdAt).toDateString() === today)
        : [];

      const total = todaySales.reduce((s, sale) => s + sale.total, 0);
      const buckets = buildHourlyBuckets(todaySales);

      // Detectar llegada al 100% para confetti
      if (total >= dailyGoal && prevTotalRef.current < dailyGoal && !celebrated) {
        setCelebrated(true);
        setTimeout(() => setCelebrated(false), 4000);
      }
      prevTotalRef.current = total;

      setTotalToday(total);
      setHourlyBuckets(trimBuckets(buckets));
      setLastUpdated(new Date());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar");
    } finally {
      setLoading(false);
    }
  }, [dailyGoal, celebrated]);

  // Carga inicial + auto-refresh cada 30s
  useEffect(() => {
    fetchSales();
    const interval = setInterval(fetchSales, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchSales]);

  // ── Color segun progreso
  const barColor =
    pct >= 100
      ? "bg-[var(--data-success)]"
      : pct >= 80
      ? "bg-[var(--brand-primary)]"
      : pct >= 50
      ? "bg-[var(--data-warning)]"
      : "bg-[var(--data-error)]";

  const statusLabel =
    pct >= 100
      ? "Meta alcanzada"
      : pct >= 80
      ? "Muy cerca de la meta"
      : pct >= 50
      ? "En camino"
      : "Debajo del objetivo";

  const statusColor =
    pct >= 100
      ? "text-[var(--data-success)] dark:text-[var(--data-success)]"
      : pct >= 80
      ? "text-[#00B4A6] dark:text-[var(--data-success)]"
      : pct >= 50
      ? "text-[#f97316]"
      : "text-[var(--data-error)] dark:text-[var(--data-error)]";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Target className="w-5 h-5 text-[#00B4A6] dark:text-[var(--data-success)]" />
          <div>
            <SectionTitle className="text-lg font-semibold text-[var(--text-primary)]">
              Meta del dia
            </SectionTitle>
            <p className="text-xs text-[var(--text-tertiary)]">
              {lastUpdated
                ? `Actualizado ${lastUpdated.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`
                : "Cargando..."}
            </p>
          </div>
        </div>

        <button
          onClick={fetchSales}
          disabled={loading}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
            "text-[#00B4A6] dark:text-[var(--data-success)] hover:bg-[var(--accent-soft)] dark:hover:bg-[var(--accent-muted)]",
            loading && "opacity-50 cursor-not-allowed"
          )}
        >
          <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
        </button>
      </div>

      {/* Tarjeta principal */}
      <div className={cn(
        "relative rounded-xl border-2 p-6 overflow-hidden transition-all duration-[var(--dur-slow)]",
        isGoalMet
          ? "border-[var(--data-success)]/30 dark:border-[var(--data-success)]/30 bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]"
          : "border-[var(--rule-base)] bg-[var(--surface-raised)]"
      )}>
        {/* Confetti */}
        {celebrated && <Confetti />}

        {error ? (
          <div className="text-center py-4">
            <p className="text-sm text-[var(--data-error)] dark:text-[var(--data-error)]">{error}</p>
            <button onClick={fetchSales} className="text-xs underline text-[var(--data-error)] mt-1">
              Reintentar
            </button>
          </div>
        ) : loading && totalToday === 0 ? (
          <div className="space-y-3 animate-pulse">
            <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/2 mx-auto" />
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-full" />
          </div>
        ) : (
          <>
            {/* Cifras principales */}
            <div className="text-center mb-5">
              <div className="text-4xl font-extrabold text-[var(--text-primary)] tracking-tight">
                {fmt(totalToday)}
              </div>
              <div className="text-base text-[var(--text-tertiary)] mt-1">
                de {fmt(dailyGoal)} · meta diaria
              </div>
              <div className={cn("text-sm font-semibold mt-1.5", statusColor)}>
                {statusLabel}
              </div>
            </div>

            {/* Barra de progreso grande */}
            <div className="space-y-2 mb-5">
              <div className="flex justify-between text-sm">
                <span className="text-[var(--text-tertiary)]">Progreso</span>
                <span className={cn("font-bold text-base", statusColor)}>
                  {pct.toFixed(1)}%
                </span>
              </div>
              <div className="h-6 bg-[var(--surface-sunken)] rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-[var(--dur-slower)] relative",
                    barColor
                  )}
                  style={{ width: `${pct}%` }}
                >
                  {pct >= 10 && (
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-white text-xs font-bold">
                      {pct.toFixed(0)}%
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Faltan X / Meta alcanzada */}
            {isGoalMet ? (
              <div className="text-center py-2 rounded-xl bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]">
                <p className="text-[var(--data-success)] dark:text-[var(--data-success)] font-bold text-sm">
                  Meta superada por {fmt(totalToday - dailyGoal)}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-gray-50 dark:bg-gray-700/50 p-3 text-center">
                  <p className="text-xs text-[var(--text-tertiary)] mb-0.5">Faltan</p>
                  <p className="font-bold text-[var(--text-primary)]">{fmt(remaining)}</p>
                </div>
                <div className="rounded-xl bg-gray-50 dark:bg-gray-700/50 p-3 text-center">
                  <p className="text-xs text-[var(--text-tertiary)] mb-0.5">Vendido</p>
                  <p className="font-bold text-[#00B4A6] dark:text-[var(--data-success)]">{fmt(totalToday)}</p>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Mini grafico por hora */}
      {!loading && hourlyBuckets.length > 0 && (
        <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-[#00B4A6] dark:text-[var(--data-success)]" />
            <span className="text-sm font-medium text-[var(--text-secondary)]">
              Actividad por hora
            </span>
            <span className="ml-auto text-xs text-[#f97316]">
              hora actual
            </span>
          </div>
          <HourlyChart buckets={hourlyBuckets} />
        </div>
      )}

      {/* Auto-refresh info */}
      <p className="text-xs text-center text-[var(--text-tertiary)] dark:text-[var(--text-secondary)]">
        Se actualiza cada 30 segundos automaticamente
      </p>
    </div>
  );
}
