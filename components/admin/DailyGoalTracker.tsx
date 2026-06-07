"use client";

import { SectionTitle } from "@buleje/design-system";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  Target, TrendingUp, TrendingDown, RefreshCw, Pencil, Check, X,
  ShoppingCart, Activity, Clock, Sparkles,
} from "@buleje/design-system/icons";

interface Sale {
  id: string;
  total: number;
  createdAt: string;
}

interface HourlyBucket {
  hour: number;
  label: string;
  revenue: number;
  count: number;
}

const DEFAULT_DAILY_GOAL = 3000;
const REFRESH_INTERVAL_MS = 30 * 1000;
const OPENING_HOUR = 6;
const CLOSING_HOUR = 21;
const MAX_DAILY_GOAL = 1_000_000; // S/1M cap — evita inputs accidentales

// FIX 2026-05-07 (B2): tenant-scoped localStorage key. Antes "daily-goal" era
// global → si el dueño cambia entre tenants, ve la meta de otro.
function getDailyGoalKey(): string {
  if (typeof window === "undefined") return "daily-goal:main";
  const pathMatch = window.location.pathname.match(/^\/t\/([^/]+)/);
  const slug = pathMatch ? decodeURIComponent(pathMatch[1]) : "main";
  return `daily-goal:${slug}`;
}

// FIX 2026-05-07 (S1): valida shape de cada sale. Si el backend retorna
// total: undefined o malformed, todoTotal acumula NaN. Filtramos en origen.
function isValidSale(s: unknown): s is Sale {
  if (!s || typeof s !== "object") return false;
  const o = s as Record<string, unknown>;
  return typeof o.id === "string"
    && typeof o.total === "number"
    && Number.isFinite(o.total)
    && typeof o.createdAt === "string";
}

function fmt(n: number): string {
  return `S/${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtShort(n: number): string {
  return `S/${n.toLocaleString("es-PE", { maximumFractionDigits: 0 })}`;
}

function getHourLabel(hour: number): string {
  if (hour === 0) return "12am";
  if (hour < 12) return `${hour}am`;
  if (hour === 12) return "12pm";
  return `${hour - 12}pm`;
}

function buildHourlyBuckets(sales: Sale[]): HourlyBucket[] {
  const buckets: HourlyBucket[] = Array.from({ length: 24 }, (_, h) => ({
    hour: h, label: getHourLabel(h), revenue: 0, count: 0,
  }));
  for (const s of sales) {
    const d = new Date(s.createdAt);
    buckets[d.getHours()].revenue += s.total;
    buckets[d.getHours()].count += 1;
  }
  return buckets;
}

function trimBuckets(buckets: HourlyBucket[]): HourlyBucket[] {
  const currentHour = new Date().getHours();
  const firstWithSales = buckets.findIndex((b) => b.revenue > 0);
  const start = firstWithSales === -1 ? Math.max(0, currentHour - 8) : Math.max(0, firstWithSales);
  const end = Math.min(23, currentHour + 1);
  return buckets.slice(start, end + 1);
}

function findBestHour(buckets: HourlyBucket[]): HourlyBucket | null {
  let best: HourlyBucket | null = null;
  for (const b of buckets) {
    if (b.revenue > 0 && (!best || b.revenue > best.revenue)) best = b;
  }
  return best;
}

function computeForecast(total: number, currentHour: number): number | null {
  if (currentHour < OPENING_HOUR) return null;
  const hoursElapsed = Math.max(1, currentHour - OPENING_HOUR + 1);
  const totalHours = CLOSING_HOUR - OPENING_HOUR + 1;
  const remainingHours = Math.max(0, CLOSING_HOUR - currentHour);
  if (remainingHours === 0) return total;
  const ratePerHour = total / hoursElapsed;
  return Math.round(total + ratePerHour * remainingHours);
}

function getMotivationalMessage(pct: number, currentHour: number): string {
  // FIX 2026-05-07 (B5): mensaje específico fuera de horario.
  if (currentHour < OPENING_HOUR) return "Aún no abre — alistá el día";
  if (currentHour > CLOSING_HOUR) {
    return pct >= 100 ? "Día cerrado con la meta cumplida" : "Día cerrado — descansá";
  }
  const hourFraction = (currentHour - OPENING_HOUR) / (CLOSING_HOUR - OPENING_HOUR);
  const pace = pct / 100;
  if (pct >= 100) return "Meta cumplida — seguí sumando!";
  if (pace >= hourFraction + 0.1) return "Vas adelantado al ritmo — buen día";
  if (pace >= hourFraction - 0.05) return "Estás en ritmo para alcanzar la meta";
  if (pace >= hourFraction - 0.2) return "Un empujón más y te alcanzás";
  return "Activá promociones — el día está lento";
}

function Confetti() {
  const colors = ["var(--accent)", "#f97316", "#14C2C2", "#f4d03f", "#e76f51"];
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl">
      {Array.from({ length: 24 }).map((_, i) => (
        <div
          key={i}
          className="absolute top-0 animate-bounce"
          style={{
            left: `${(i * 4.2) % 100}%`,
            backgroundColor: colors[i % colors.length],
            width: 6 + (i % 4) * 2,
            height: 6 + (i % 4) * 2,
            borderRadius: i % 2 === 0 ? "50%" : "2px",
            animationDelay: `${(i * 0.12) % 1.2}s`,
            animationDuration: `${0.8 + (i % 4) * 0.2}s`,
            opacity: 0.8,
          }}
        />
      ))}
    </div>
  );
}

function HourlyChart({ buckets }: { buckets: HourlyBucket[] }) {
  if (buckets.length === 0) return null;
  const maxRev = Math.max(...buckets.map((b) => b.revenue), 1);
  const currentHour = new Date().getHours();

  return (
    <div>
      <p className="text-xs font-medium text-[var(--text-tertiary)] mb-3">Ventas por hora</p>
      <div className="flex items-end gap-1 h-20">
        {buckets.map((b) => {
          const heightPct = (b.revenue / maxRev) * 100;
          const isCurrent = b.hour === currentHour;
          return (
            <div key={b.hour} className="flex-1 flex flex-col items-center gap-1 group relative" title={`${b.label}: ${fmt(b.revenue)} (${b.count})`}>
              {b.revenue > 0 && (
                <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-[length:var(--ts-2xs)] rounded px-1.5 py-0.5 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                  {fmt(b.revenue)}
                </div>
              )}
              <div className="w-full flex items-end" style={{ height: "64px" }}>
                <div
                  className={cn(
                    "w-full rounded-t transition-all duration-[var(--dur-slow)]",
                    isCurrent
                      ? "bg-[var(--data-warning-500)]"
                      : b.revenue > 0
                      ? "bg-primary"
                      : "bg-[var(--surface-sunken)]"
                  )}
                  style={{ height: `${Math.max(heightPct, b.revenue > 0 ? 8 : 2)}%` }}
                />
              </div>
              <span className={cn("text-[length:var(--ts-2xs)] leading-none", isCurrent ? "text-[var(--data-warning-500)] font-bold" : "text-[var(--text-tertiary)]")}>
                {b.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface KPIProps {
  label: string;
  value: string;
  sub?: string;
  delta?: number | null;
  icon: React.ElementType;
  accent?: "success" | "warning" | "danger" | "neutral";
}

function KPICard({ label, value, sub, delta, icon: Icon, accent = "neutral" }: KPIProps) {
  const accentText = {
    success: "text-[var(--data-success-500)]",
    warning: "text-[var(--data-warning-500)]",
    danger:  "text-[var(--data-error-500)]",
    neutral: "text-[var(--text-primary)]",
  }[accent];

  return (
    <div className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl p-4 flex flex-col gap-2 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)] truncate">{label}</span>
        <Icon className="h-4 w-4 text-[var(--text-tertiary)] shrink-0" />
      </div>
      <p className={cn("text-2xl font-extrabold tabular-nums leading-none truncate", accentText)}>{value}</p>
      <div className="flex items-center gap-1.5 text-xs">
        {delta != null && (
          <span className={cn(
            "inline-flex items-center gap-0.5 font-bold",
            delta >= 0 ? "text-[var(--data-success-500)]" : "text-[var(--data-error-500)]"
          )}>
            {delta >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {Math.abs(Math.round(delta))}%
          </span>
        )}
        {sub && <span className="text-[var(--text-tertiary)] truncate">{sub}</span>}
      </div>
    </div>
  );
}

interface DailyGoalTrackerProps {
  dailyGoal?: number;
}

export default function DailyGoalTracker({ dailyGoal: initialGoal = DEFAULT_DAILY_GOAL }: DailyGoalTrackerProps) {
  const [dailyGoal, setDailyGoal] = useState<number>(initialGoal);
  const [editing, setEditing] = useState(false);
  const [tempGoal, setTempGoal] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [allSales, setAllSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [celebrated, setCelebrated] = useState(false);
  // FIX 2026-05-07 (B4): inicializar prevTotalRef como null en mount para
  // que el primer fetch NO dispare confetti espuriamente si ya hay total>=goal
  // (caso: dueño abre el panel a las 18h y ya superó la meta).
  const prevTotalRef = useRef<number | null>(null);
  const fetchAbortRef = useRef<AbortController | null>(null);

  // Cargar meta diaria persistida (FIX B2: key tenant-scoped)
  useEffect(() => {
    try {
      const stored = localStorage.getItem(getDailyGoalKey());
      const n = stored ? Number(stored) : NaN;
      if (Number.isFinite(n) && n > 0) setDailyGoal(n);
    } catch { /* ignore */ }
  }, []);

  const saveGoal = () => {
    const v = Number(tempGoal);
    // FIX 2026-05-07 (F4): validación con feedback visible al dueño.
    if (!Number.isFinite(v) || v <= 0) {
      setEditError("Ingresá un monto mayor a 0");
      return;
    }
    if (v > MAX_DAILY_GOAL) {
      setEditError(`Máximo permitido: S/${MAX_DAILY_GOAL.toLocaleString("es-PE")}`);
      return;
    }
    setEditError(null);
    setDailyGoal(v);
    try { localStorage.setItem(getDailyGoalKey(), String(v)); } catch { /* ignore */ }
    setEditing(false);
  };

  const fetchSales = useCallback(async () => {
    // FIX 2026-05-07 (S3 + B8): cancelar request en curso antes de iniciar uno
    // nuevo. Previene race conditions y handlers de unmount.
    fetchAbortRef.current?.abort();
    const ctrl = new AbortController();
    fetchAbortRef.current = ctrl;
    try {
      // FIX 2026-05-07 (S2): cache: 'no-store' para que el polling de 30s
      // siempre vea datos frescos, no cache del browser.
      const res = await fetch("/api/sales?limit=500", {
        credentials: "include",
        cache: "no-store",
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const raw: unknown = await res.json();
      const list = Array.isArray(raw) ? raw : [];
      // FIX S1: filtrar shape inválido para no inflar NaN al sumar totals.
      const valid = list.filter(isValidSale);
      setAllSales(valid);
      setLastUpdated(new Date());
      setError(null);
    } catch (e) {
      // Aborts intencionales no son errores visibles al dueño.
      if (e instanceof DOMException && e.name === "AbortError") return;
      setError(e instanceof Error ? e.message : "Error al cargar");
    } finally {
      setLoading(false);
    }
  }, []);

  // FIX 2026-05-07 (B1): polling pausa con visibilitychange. Antes consumía
  // requests cada 30s aunque el dueño tuviera la pestaña minimizada.
  useEffect(() => {
    void fetchSales();
    let interval: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (interval) return;
      interval = setInterval(() => void fetchSales(), REFRESH_INTERVAL_MS);
    };
    const stop = () => {
      if (interval) { clearInterval(interval); interval = null; }
    };

    if (typeof document !== "undefined" && document.visibilityState === "visible") {
      start();
    }
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void fetchSales();
        start();
      } else {
        stop();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
      fetchAbortRef.current?.abort();
    };
  }, [fetchSales]);

  // ─── Stats computados ─────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const now = new Date();
    const todayStr = now.toDateString();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toDateString();
    const currentHour = now.getHours();

    const todaySales: Sale[] = [];
    const yesterdaySales: Sale[] = [];
    const yesterdayUntilNowSales: Sale[] = [];

    for (const s of allSales) {
      const d = new Date(s.createdAt);
      const dStr = d.toDateString();
      if (dStr === todayStr) todaySales.push(s);
      else if (dStr === yesterdayStr) {
        yesterdaySales.push(s);
        if (d.getHours() <= currentHour) yesterdayUntilNowSales.push(s);
      }
    }

    const todayTotal = todaySales.reduce((a, s) => a + s.total, 0);
    const todayCount = todaySales.length;
    const todayAOV = todayCount > 0 ? todayTotal / todayCount : 0;
    const yesterdayTotal = yesterdaySales.reduce((a, s) => a + s.total, 0);
    const yesterdayUntilNowTotal = yesterdayUntilNowSales.reduce((a, s) => a + s.total, 0);

    const buckets = buildHourlyBuckets(todaySales);
    const bestHour = findBestHour(buckets);

    const forecast = computeForecast(todayTotal, currentHour);
    const deltaVsYesterday = yesterdayUntilNowTotal > 0
      ? ((todayTotal - yesterdayUntilNowTotal) / yesterdayUntilNowTotal) * 100
      : null;

    return {
      currentHour,
      todayTotal, todayCount, todayAOV,
      yesterdayTotal, yesterdayUntilNowTotal,
      buckets, bestHour, forecast, deltaVsYesterday,
    };
  }, [allSales]);

  // Trigger confetti SOLO cuando se cruza la meta dentro de esta sesión.
  // FIX B4: si prevTotalRef es null (primer mount), inicializamos sin
  // disparar — evita confetti al abrir el panel con meta ya superada.
  // FIX D6: cleanup del setTimeout para no setear estado tras unmount.
  useEffect(() => {
    if (prevTotalRef.current === null) {
      prevTotalRef.current = stats.todayTotal;
      return;
    }
    if (
      stats.todayTotal >= dailyGoal &&
      prevTotalRef.current < dailyGoal &&
      !celebrated &&
      stats.todayTotal > 0
    ) {
      setCelebrated(true);
      const t = setTimeout(() => setCelebrated(false), 4000);
      prevTotalRef.current = stats.todayTotal;
      return () => clearTimeout(t);
    }
    prevTotalRef.current = stats.todayTotal;
  }, [stats.todayTotal, dailyGoal, celebrated]);

  const pct = Math.min(100, dailyGoal > 0 ? (stats.todayTotal / dailyGoal) * 100 : 0);
  const isGoalMet = pct >= 100;
  const remaining = Math.max(0, dailyGoal - stats.todayTotal);
  const trimmedBuckets = trimBuckets(stats.buckets);

  const barColor =
    pct >= 100 ? "bg-[var(--data-success-500)]" :
    pct >= 80  ? "bg-primary" :
    pct >= 50  ? "bg-[var(--data-warning-500)]" :
    "bg-[var(--data-error-500)]";

  const statusLabel =
    pct >= 100 ? "Meta alcanzada" :
    pct >= 80  ? "Muy cerca de la meta" :
    pct >= 50  ? "En camino" :
    "Debajo del objetivo";

  const statusColor =
    pct >= 100 ? "text-[var(--data-success-500)]" :
    pct >= 80  ? "text-primary" :
    pct >= 50  ? "text-[var(--data-warning-500)]" :
    "text-[var(--data-error-500)]";

  const motivational = getMotivationalMessage(pct, stats.currentHour);

  // FIX 2026-05-07 (F3): alerta crítica si > 70% del horario y < 50% de meta.
  // Calcula cuánto debe vender por hora restante para alcanzarla.
  const isUrgent = useMemo(() => {
    if (isGoalMet) return null;
    if (stats.currentHour < OPENING_HOUR || stats.currentHour > CLOSING_HOUR) return null;
    const elapsedHours = Math.max(1, stats.currentHour - OPENING_HOUR + 1);
    const hourFraction = elapsedHours / (CLOSING_HOUR - OPENING_HOUR + 1);
    const remainingHours = Math.max(1, CLOSING_HOUR - stats.currentHour);
    if (hourFraction > 0.7 && pct < 50) {
      return {
        ratePerHour: Math.round(remaining / remainingHours),
        remainingHours,
      };
    }
    return null;
  }, [stats.currentHour, pct, isGoalMet, remaining]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Target className="w-5 h-5 text-primary" />
          <div>
            <SectionTitle className="text-lg font-semibold text-[var(--text-primary)]">Meta del dia</SectionTitle>
            <p className="text-xs text-[var(--text-tertiary)]">
              {lastUpdated ? `Actualizado ${lastUpdated.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}` : "Cargando..."}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!editing ? (
            <button
              onClick={() => { setTempGoal(String(dailyGoal)); setEditing(true); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] transition-colors"
            >
              <Pencil className="w-3 h-3" />
              Editar meta
            </button>
          ) : (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1">
                <span className="text-xs text-[var(--text-secondary)]">S/</span>
                <input
                  type="number"
                  value={tempGoal}
                  onChange={(e) => { setTempGoal(e.target.value); if (editError) setEditError(null); }}
                  onKeyDown={(e) => e.key === "Enter" && saveGoal()}
                  min={1}
                  max={MAX_DAILY_GOAL}
                  autoFocus
                  aria-invalid={!!editError}
                  aria-describedby={editError ? "daily-goal-error" : undefined}
                  className={cn(
                    "w-24 px-2 py-1 text-xs rounded-lg border bg-white dark:bg-[var(--color-card)] text-[var(--text-primary)] outline-none",
                    editError ? "border-[var(--data-error-500)] focus:border-[var(--data-error-500)]" : "border-[var(--rule-base)] focus:border-primary",
                  )}
                />
                <button onClick={saveGoal} aria-label="Guardar meta" className="p-1 rounded-lg hover:bg-[var(--accent-soft)] text-[var(--data-success-500)]">
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => { setEditing(false); setEditError(null); }} aria-label="Cancelar" className="p-1 rounded-lg hover:bg-[var(--data-error-500)]/10 text-[var(--data-error-500)]">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              {editError && (
                <p id="daily-goal-error" role="alert" className="text-xs font-semibold text-[var(--data-error-500)]">
                  {editError}
                </p>
              )}
            </div>
          )}
          <button
            onClick={() => void fetchSales()}
            disabled={loading}
            aria-label="Refrescar"
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
              "text-primary hover:bg-[var(--accent-soft)]",
              loading && "opacity-50 cursor-not-allowed"
            )}
          >
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* Tarjeta principal */}
      <div className={cn(
        "relative rounded-xl border-2 p-6 overflow-hidden transition-all duration-[var(--dur-slow)]",
        isGoalMet ? "border-[var(--data-success-500)]/30 bg-[var(--accent-soft)]" : "border-[var(--rule-base)] bg-[var(--surface-raised)]"
      )}>
        {celebrated && <Confetti />}

        {error ? (
          <div className="text-center py-4">
            <p className="text-sm text-[var(--data-error-500)]">{error}</p>
            <button onClick={() => void fetchSales()} className="text-xs underline text-[var(--data-error-500)] mt-1">Reintentar</button>
          </div>
        ) : loading && stats.todayTotal === 0 ? (
          <div className="space-y-3 animate-pulse">
            <div className="h-8 bg-[var(--surface-sunken)] rounded w-1/2 mx-auto" />
            <div className="h-4 bg-[var(--surface-sunken)] rounded w-full" />
          </div>
        ) : (
          <>
            {/* FIX D1: jerarquía visual reforzada — monto hero text-5xl/6xl,
                meta como subtítulo claro, status como pill. */}
            <div className="text-center mb-5">
              <div className="text-5xl sm:text-6xl font-black text-[var(--text-primary)] tracking-tight leading-none tabular-nums">
                {fmt(stats.todayTotal)}
              </div>
              <div className="text-sm sm:text-base text-[var(--text-secondary)] mt-2 font-medium">
                de <span className="font-bold tabular-nums">{fmt(dailyGoal)}</span> · meta diaria
              </div>
              <div className={cn(
                "inline-flex items-center gap-1.5 mt-3 px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wider",
                pct >= 100 && "bg-[var(--data-success-500)]/15 text-[var(--data-success-500)]",
                pct >= 80 && pct < 100 && "bg-primary/15 text-primary",
                pct >= 50 && pct < 80 && "bg-[var(--data-warning-500)]/15 text-[var(--data-warning-500)]",
                pct < 50 && "bg-[var(--data-error-500)]/15 text-[var(--data-error-500)]",
              )}>
                {statusLabel}
              </div>
              <p className="text-xs sm:text-sm text-[var(--text-tertiary)] mt-2.5 italic max-w-md mx-auto">
                {motivational}
              </p>
            </div>

            <div className="space-y-2 mb-5">
              <div className="flex justify-between text-sm">
                <span className="text-[var(--text-tertiary)]">Progreso</span>
                <span className={cn("font-bold text-base", statusColor)}>{pct.toFixed(1)}%</span>
              </div>
              <div className="h-6 bg-[var(--surface-sunken)] rounded-full overflow-hidden">
                <div
                  className={cn("h-full rounded-full transition-all duration-[var(--dur-slower)] relative", barColor)}
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

            {isGoalMet ? (
              <div className="text-center py-2 rounded-xl bg-[var(--accent-soft)]">
                <p className="text-[var(--data-success-500)] font-bold text-sm">Meta superada por {fmt(stats.todayTotal - dailyGoal)}</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-[var(--surface-sunken)] p-3 text-center">
                  <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-0.5">Faltan</p>
                  <p className="font-extrabold text-[var(--text-primary)] tabular-nums">{fmt(remaining)}</p>
                </div>
                <div className="rounded-xl bg-[var(--surface-sunken)] p-3 text-center">
                  <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-0.5">Vendido</p>
                  <p className="font-extrabold text-primary tabular-nums">{fmt(stats.todayTotal)}</p>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* FIX F3: alerta urgente — fin del día cerca y meta lejos */}
      {isUrgent && !loading && !error && (
        <div className="rounded-xl border-2 border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/5 p-4 flex items-start gap-3">
          <TrendingDown className="h-5 w-5 shrink-0 mt-0.5 text-[var(--data-error-500)]" strokeWidth={2.5} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-extrabold text-[var(--data-error-500)]">
              Te queda poco tiempo
            </p>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              Necesitás vender <span className="font-bold text-[var(--text-primary)]">{fmt(isUrgent.ratePerHour)}</span> por hora durante las próximas {isUrgent.remainingHours}h para alcanzar la meta. Activá una promo o llamá a clientes habituales.
            </p>
          </div>
        </div>
      )}

      {/* Forecast banner — FIX D4: muestra placeholder si aún no hay forecast */}
      {!loading && !error && stats.forecast == null && stats.currentHour < OPENING_HOUR && (
        <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 flex items-start gap-3">
          <Clock className="h-5 w-5 shrink-0 mt-0.5 text-[var(--text-tertiary)]" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-[var(--text-primary)]">Esperando que abra el día</p>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              El pronóstico aparece a partir de las {OPENING_HOUR}:00.
            </p>
          </div>
        </div>
      )}
      {stats.forecast != null && stats.forecast > 0 && !loading && !error && (
        <div className={cn(
          "rounded-xl border p-4 flex items-start gap-3",
          stats.forecast >= dailyGoal
            ? "border-[var(--data-success-500)]/30 bg-[var(--accent-soft)]"
            : "border-[var(--data-warning-500)]/30 bg-[var(--data-warning-50)]"
        )}>
          <Sparkles className={cn(
            "h-5 w-5 shrink-0 mt-0.5",
            stats.forecast >= dailyGoal ? "text-[var(--data-success-500)]" : "text-[var(--data-warning-500)]"
          )} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-[var(--text-primary)]">
              A este ritmo terminás el día con {fmt(stats.forecast)}
            </p>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              {stats.forecast >= dailyGoal
                ? `Vas a superar la meta por ${fmt(stats.forecast - dailyGoal)}.`
                : `Te van a faltar ${fmt(Math.max(0, dailyGoal - stats.forecast))} para alcanzar la meta. Acelerá el ritmo.`}
            </p>
          </div>
        </div>
      )}

      {/* 4 KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICard
          label="Ventas hoy"
          value={fmtShort(stats.todayTotal)}
          icon={Target}
          accent={pct >= 100 ? "success" : pct >= 50 ? "neutral" : "danger"}
          delta={stats.deltaVsYesterday}
          sub={stats.deltaVsYesterday != null ? "vs ayer al mismo horario" : undefined}
        />
        <KPICard
          label="Transacciones"
          value={String(stats.todayCount)}
          icon={ShoppingCart}
          sub={`Ayer cerró ${stats.yesterdayTotal > 0 ? Math.round((stats.yesterdayUntilNowTotal / Math.max(1, stats.yesterdayTotal)) * 100) : 0}% a esta hora`}
        />
        <KPICard
          label="Ticket promedio"
          value={stats.todayAOV > 0 ? fmtShort(stats.todayAOV) : "Sin ventas"}
          icon={Activity}
          accent={stats.todayAOV > 0 ? "neutral" : undefined}
        />
        <KPICard
          label="Mejor hora"
          value={stats.bestHour ? stats.bestHour.label : "—"}
          icon={Clock}
          sub={stats.bestHour ? `${fmtShort(stats.bestHour.revenue)} · ${stats.bestHour.count} ${stats.bestHour.count === 1 ? "venta" : "ventas"}` : "Aún sin ventas"}
        />
      </div>

      {/* Hourly chart */}
      {!loading && trimmedBuckets.length > 0 && (
        <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-[var(--text-secondary)]">Actividad por hora</span>
            <span className="ml-auto text-xs text-[var(--data-warning-500)]">hora actual</span>
          </div>
          <HourlyChart buckets={trimmedBuckets} />
        </div>
      )}

      <p className="text-xs text-center text-[var(--text-tertiary)]">Se actualiza cada 30 segundos automáticamente</p>
    </div>
  );
}
