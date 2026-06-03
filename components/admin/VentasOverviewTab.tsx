"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Image from "next/image";
import {
  Store,
  ShoppingBag,
  ShoppingCart,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Banknote,
  Wallet,
  Package,
  AlertCircle,
  RefreshCw,
  Clock,
  CheckCircle2,
  XCircle,
  Activity,
  Trophy,
  Receipt,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import {
  LazyBarChart,
  LazyAreaChart,
  LazyPieChart,
  ChartSkeleton,
} from "@/components/charts";
import {
  Bar,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
  Pie,
  ResponsiveContainer,
} from "recharts";
import ProductImagePlaceholder from "@/components/store/ProductImagePlaceholder";

// ── Tipos del contrato de API ────────────────────────────────────────────────

type Range = "hoy" | "7d" | "30d";

interface ChannelStat {
  label: string;
  revenue: number;
  orders: number;
}

interface SeriesPoint {
  date: string;
  marketplace: number;
  tienda: number;
  pos: number;
}

interface HourBucket {
  hour: number;
  revenue: number;
  orders: number;
}

interface Payments {
  efectivo: number;
  yape: number;
  plin: number;
  tarjeta: number;
  fiado: number;
}

interface CashState {
  abierta: boolean;
  saldoActual: number;
  ingresos: number;
  egresos: number;
}

interface TopProduct {
  name: string;
  image: string | null;
  qty: number;
  revenue: number;
}

interface OverviewData {
  range: Range;
  channels: {
    marketplace: ChannelStat;
    tienda: ChannelStat;
    pos: ChannelStat;
  };
  totals: { revenue: number; orders: number };
  previous: { revenue: number; orders: number };
  series: SeriesPoint[];
  hourly: HourBucket[];
  payments: Payments;
  cash: CashState;
  topProducts: TopProduct[];
}

// ── Paleta de marca resuelta en runtime ───────────────────────────────────────
// recharts NO resuelve var(--token) dentro del SVG, así que leemos los valores
// reales con getComputedStyle y los re-leemos si cambia el tema (light/dark) o el
// tenant (ThemeInjector). Marca: primary teal #00B4A6 · secondary naranja #f97316.

interface Palette {
  marketplace: string;
  tienda: string;
  pos: string;
  grid: string;
  axis: string;
  success: string;
  warning: string;
  error: string;
  info: string;
  payments: string[];
}

const FALLBACK_PALETTE: Palette = {
  marketplace: "#00B4A6",
  tienda: "#f97316",
  pos: "#6366f1",
  grid: "#e5e7eb",
  axis: "#94a3b8",
  success: "#00B4A6",
  warning: "#f59e0b",
  error: "#ef4444",
  info: "#0ea5e9",
  payments: ["#00B4A6", "#8b5cf6", "#0ea5e9", "#f59e0b", "#f97316"],
};

function useBrandPalette(): Palette {
  const [palette, setPalette] = useState<Palette>(FALLBACK_PALETTE);

  useEffect(() => {
    const read = () => {
      const cs = getComputedStyle(document.documentElement);
      const v = (name: string, fb: string) => {
        const raw = cs.getPropertyValue(name).trim();
        return raw || fb;
      };
      const primary = v("--color-primary", FALLBACK_PALETTE.marketplace);
      const secondary = v("--color-secondary", FALLBACK_PALETTE.tienda);
      const info = v("--data-info-500", FALLBACK_PALETTE.info);
      const success = v("--data-success-500", FALLBACK_PALETTE.success);
      const warning = v("--data-warning-500", FALLBACK_PALETTE.warning);
      const error = v("--data-error-500", FALLBACK_PALETTE.error);
      setPalette({
        marketplace: primary,
        tienda: secondary,
        pos: FALLBACK_PALETTE.pos,
        grid: v("--rule-soft", FALLBACK_PALETTE.grid),
        axis: v("--text-tertiary", FALLBACK_PALETTE.axis),
        success,
        warning,
        error,
        info,
        payments: [success, "#8b5cf6", info, warning, secondary],
      });
    };
    read();
    // Re-leer si cambia el tema (clase .dark o style inline del ThemeInjector).
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });
    return () => obs.disconnect();
  }, []);

  return palette;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtMoney(n: number) {
  return `S/ ${(n || 0).toFixed(2)}`;
}

function fmtMoneyRound(n: number) {
  return `S/ ${Math.round(n || 0).toLocaleString("es-PE")}`;
}

function pct(part: number, total: number) {
  if (total === 0) return "0%";
  return `${Math.round((part / total) * 100)}%`;
}

function shortDate(iso: string) {
  const parts = iso.split("-");
  if (parts.length < 3) return iso;
  return `${parts[2]}/${parts[1]}`;
}

type TrendDir = "up" | "down" | "flat";

function trendOf(cur: number, prev: number): { dir: TrendDir; pct: number } {
  if (prev <= 0) return { dir: cur > 0 ? "up" : "flat", pct: cur > 0 ? 100 : 0 };
  const d = ((cur - prev) / prev) * 100;
  return { dir: d > 0.5 ? "up" : d < -0.5 ? "down" : "flat", pct: Math.abs(Math.round(d)) };
}

// ── Badge de tendencia ─────────────────────────────────────────────────────────

function TrendBadge({ dir, value }: { dir: TrendDir; value: number }) {
  const cfg = {
    up: {
      cls: "bg-[var(--data-success-50)] text-[var(--data-success-600)]",
      Icon: ArrowUpRight,
    },
    down: {
      cls: "bg-[var(--data-error-50)] text-[var(--data-error-600)]",
      Icon: ArrowDownRight,
    },
    flat: {
      cls: "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]",
      Icon: Minus,
    },
  }[dir];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-extrabold tabular-nums",
        cfg.cls,
      )}
      title="vs. período anterior"
    >
      <cfg.Icon className="h-3 w-3" strokeWidth={2.5} />
      {dir === "flat" ? "—" : `${value}%`}
    </span>
  );
}

// ── Sparkline (mini área sin ejes) ─────────────────────────────────────────────

function Sparkline({ data, color }: { data: { v: number }[]; color: string }) {
  if (data.length < 2) return null;
  return (
    <ResponsiveContainer width="100%" height={40}>
      <LazyAreaChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="spark" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.4} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={2}
          fill="url(#spark)"
          dot={false}
          isAnimationActive={false}
        />
      </LazyAreaChart>
    </ResponsiveContainer>
  );
}

// ── KPI card (hero) ────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  trend,
  icon,
  spark,
  sparkColor,
  emphasis,
}: {
  label: string;
  value: string;
  sub?: string;
  trend?: { dir: TrendDir; pct: number };
  icon: React.ReactNode;
  spark?: { v: number }[];
  sparkColor?: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border p-4 flex flex-col gap-2",
        emphasis
          ? "border-[var(--accent)] bg-linear-to-br from-[var(--accent-soft)] to-transparent shadow-[var(--shadow-sm)]"
          : "border-[var(--rule-base)] bg-[var(--surface-raised)]",
      )}
    >
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--text-tertiary)]">
          {icon}
          {label}
        </span>
        {trend && <TrendBadge dir={trend.dir} value={trend.pct} />}
      </div>
      <p
        className={cn(
          "font-extrabold tracking-tight leading-none tabular-nums",
          emphasis ? "text-2xl text-[var(--text-primary)]" : "text-xl text-[var(--text-primary)]",
        )}
      >
        {value}
      </p>
      {sub && <span className="text-xs text-[var(--text-tertiary)] truncate">{sub}</span>}
      {spark && spark.length > 1 && (
        <div className="mt-auto -mb-1 -mx-1">
          <Sparkline data={spark} color={sparkColor ?? "var(--accent)"} />
        </div>
      )}
    </div>
  );
}

// ── Card de canal (con barra de participación) ─────────────────────────────────

function ChannelCard({
  label,
  revenue,
  orders,
  totalRevenue,
  icon,
  color,
}: {
  label: string;
  revenue: number;
  orders: number;
  totalRevenue: number;
  icon: React.ReactNode;
  color: string;
}) {
  const share = totalRevenue > 0 ? (revenue / totalRevenue) * 100 : 0;
  return (
    <div className="relative overflow-hidden rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 flex flex-col gap-3">
      <div className="absolute top-0 left-0 right-0 h-1" style={{ background: color }} />
      <div className="flex items-center justify-between gap-2 pt-1">
        <span className="inline-flex items-center gap-2 min-w-0">
          <span
            className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl"
            style={{ background: `${color}1a`, color }}
          >
            {icon}
          </span>
          <span className="text-xs font-bold text-[var(--text-secondary)] leading-tight truncate">{label}</span>
        </span>
        <span
          className="text-xs font-extrabold tabular-nums rounded-full px-2 py-0.5 flex-shrink-0"
          style={{ background: `${color}1a`, color }}
        >
          {pct(revenue, totalRevenue)}
        </span>
      </div>
      <div>
        <p className="text-xl font-extrabold text-[var(--text-primary)] tracking-tight leading-none tabular-nums">
          {fmtMoneyRound(revenue)}
        </p>
        <span className="text-xs text-[var(--text-tertiary)]">{orders} operaciones</span>
      </div>
      <div className="h-1.5 rounded-full bg-[var(--surface-sunken)] overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${Math.max(share, 2)}%`, background: color }}
        />
      </div>
    </div>
  );
}

// ── Tooltips ───────────────────────────────────────────────────────────────────

function CustomSeriesTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s, e) => s + e.value, 0);
  return (
    <div className="bg-[var(--surface-canvas)] border border-[var(--rule-base)] rounded-xl p-3 shadow-[var(--shadow-md)] text-xs space-y-1.5 min-w-[170px]">
      <p className="font-bold text-[var(--text-primary)] mb-1">{label}</p>
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: entry.color }} />
            <span className="text-[var(--text-secondary)]">{entry.name}</span>
          </div>
          <span className="font-bold text-[var(--text-primary)] tabular-nums">{fmtMoney(entry.value)}</span>
        </div>
      ))}
      <div className="border-t border-[var(--rule-soft)] pt-1.5 flex justify-between font-bold">
        <span className="text-[var(--text-secondary)]">Total</span>
        <span className="text-[var(--text-primary)] tabular-nums">{fmtMoney(total)}</span>
      </div>
    </div>
  );
}

function SimpleTooltip({ active, payload, label, suffix }: {
  active?: boolean;
  payload?: { value: number; payload?: { fill?: string } }[];
  label?: string;
  suffix?: string;
}) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  return (
    <div className="bg-[var(--surface-canvas)] border border-[var(--rule-base)] rounded-xl p-2.5 shadow-[var(--shadow-md)] text-xs">
      <div className="flex items-center gap-1.5">
        {item.payload?.fill && (
          <span className="w-2 h-2 rounded-full" style={{ background: item.payload.fill }} />
        )}
        <span className="text-[var(--text-secondary)]">{label}{suffix}</span>
      </div>
      <p className="font-bold text-[var(--text-primary)] mt-0.5 tabular-nums">{fmtMoney(item.value)}</p>
    </div>
  );
}

// ── Estados ──────────────────────────────────────────────────────────────────

function SkeletonBox({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-xl bg-[var(--surface-sunken)]", className)} />;
}

function LoadingState() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => <SkeletonBox key={i} className="h-28" />)}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[...Array(3)].map((_, i) => <SkeletonBox key={i} className="h-28" />)}
      </div>
      <ChartSkeleton height={260} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartSkeleton height={200} />
        <ChartSkeleton height={200} />
      </div>
    </div>
  );
}

function EmptyState({ range }: { range: Range }) {
  const label = range === "hoy" ? "hoy" : range === "7d" ? "los últimos 7 días" : "los últimos 30 días";
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-[var(--text-tertiary)]">
      <TrendingUp className="h-10 w-10 opacity-30" />
      <p className="text-sm font-semibold">Aún no hay ventas en {label}</p>
      <p className="text-xs">Cuando se registren ventas aparecerán aquí automáticamente.</p>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3 text-[var(--data-error-500)]">
      <AlertCircle className="h-8 w-8 opacity-70" />
      <p className="text-sm font-semibold">No se pudo cargar el tablero</p>
      <button
        onClick={onRetry}
        className="flex items-center gap-1.5 text-xs font-bold underline underline-offset-2 hover:opacity-70 transition-opacity"
      >
        <RefreshCw className="h-3.5 w-3.5" />
        Reintentar
      </button>
    </div>
  );
}

// ── Card contenedora ───────────────────────────────────────────────────────────

function Panel({ title, icon, action, children, className }: {
  title: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl p-4", className)}>
      <div className="flex items-center justify-between mb-3">
        <p className="inline-flex items-center gap-2 text-xs font-bold text-[var(--text-primary)]">
          {icon}
          {title}
        </p>
        {action}
      </div>
      {children}
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function VentasOverviewTab() {
  const [range, setRange] = useState<Range>("7d");
  const [data, setData] = useState<OverviewData | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "error" | "empty">("loading");
  const abortRef = useRef<AbortController | null>(null);
  const palette = useBrandPalette();

  const fetchData = useCallback(async (r: Range) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setStatus("loading");
    setData(null);
    try {
      const res = await fetch(`/api/admin/ventas-overview?range=${r}`, { signal: ctrl.signal });
      if (!res.ok) { setStatus("error"); return; }
      const json: OverviewData = await res.json();
      setData(json);
      const hasData =
        json.totals.revenue > 0 ||
        json.totals.orders > 0 ||
        json.series.some((s) => s.marketplace + s.tienda + s.pos > 0);
      setStatus(hasData ? "ok" : "empty");
    } catch (err: unknown) {
      if ((err as { name?: string }).name === "AbortError") return;
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    void fetchData(range);
    return () => abortRef.current?.abort();
  }, [range, fetchData]);

  // ── Datos derivados para recharts ──
  const seriesData = useMemo(
    () =>
      (data?.series ?? []).map((p) => ({
        date: shortDate(p.date),
        Marketplace: p.marketplace,
        "Tienda online": p.tienda,
        "Punto de venta": p.pos,
      })),
    [data],
  );

  const sparkTotals = useMemo(
    () => (data?.series ?? []).map((p) => ({ v: p.marketplace + p.tienda + p.pos })),
    [data],
  );

  const hourlyData = useMemo(
    () => (data?.hourly ?? []).map((h) => ({ label: `${h.hour}`, hour: h.hour, revenue: h.revenue })),
    [data],
  );

  const peakHour = useMemo(() => {
    if (!data?.hourly?.length) return null;
    const top = [...data.hourly].sort((a, b) => b.revenue - a.revenue)[0];
    return top.revenue > 0 ? top : null;
  }, [data]);

  const paymentsData = useMemo(
    () =>
      data
        ? [
            { name: "Efectivo", value: data.payments.efectivo, fill: palette.payments[0] },
            { name: "Yape", value: data.payments.yape, fill: palette.payments[1] },
            { name: "Plin", value: data.payments.plin, fill: palette.payments[2] },
            { name: "Tarjeta", value: data.payments.tarjeta, fill: palette.payments[3] },
            { name: "Fiado", value: data.payments.fiado, fill: palette.payments[4] },
          ].filter((p) => p.value > 0)
        : [],
    [data, palette],
  );

  const bestChannel = useMemo(() => {
    if (!data) return null;
    const arr = [data.channels.marketplace, data.channels.tienda, data.channels.pos];
    return arr.reduce((best, c) => (c.revenue > best.revenue ? c : best));
  }, [data]);

  const maxTopRevenue = useMemo(
    () => Math.max(1, ...(data?.topProducts ?? []).map((p) => p.revenue)),
    [data],
  );

  const RANGE_TABS: { id: Range; label: string }[] = [
    { id: "hoy", label: "Hoy" },
    { id: "7d", label: "7 días" },
    { id: "30d", label: "30 días" },
  ];

  const ticket = data && data.totals.orders > 0 ? data.totals.revenue / data.totals.orders : 0;
  const prevTicket =
    data && data.previous.orders > 0 ? data.previous.revenue / data.previous.orders : 0;

  return (
    <div className="space-y-5 pb-6">
      {/* ── Header + segmented control ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-wide">
            Tablero de ventas
          </p>
          <p className="text-sm text-[var(--text-secondary)] mt-0.5">
            Marketplace · Tienda online · Punto de venta — comparado con el período anterior
          </p>
        </div>
        <div className="flex items-center rounded-xl border border-[var(--rule-base)] overflow-hidden bg-[var(--surface-sunken)] p-0.5 gap-0.5">
          {RANGE_TABS.map((rt) => (
            <button
              key={rt.id}
              onClick={() => setRange(rt.id)}
              aria-pressed={range === rt.id}
              className={cn(
                "px-3 py-1.5 text-xs font-bold rounded-lg transition-all",
                range === rt.id
                  ? "bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-[var(--shadow-sm)]"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
              )}
            >
              {rt.label}
            </button>
          ))}
        </div>
      </div>

      {status === "loading" && <LoadingState />}
      {status === "error" && <ErrorState onRetry={() => void fetchData(range)} />}
      {status === "empty" && <EmptyState range={range} />}

      {status === "ok" && data && (
        <div className="space-y-5">
          {/* ── Hero KPIs ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard
              label="Ingresos totales"
              value={fmtMoneyRound(data.totals.revenue)}
              trend={trendOf(data.totals.revenue, data.previous.revenue)}
              icon={<Banknote className="h-3.5 w-3.5" />}
              spark={sparkTotals}
              sparkColor={palette.marketplace}
              emphasis
            />
            <KpiCard
              label="Operaciones"
              value={String(data.totals.orders)}
              sub={`${data.previous.orders} en el período anterior`}
              trend={trendOf(data.totals.orders, data.previous.orders)}
              icon={<Receipt className="h-3.5 w-3.5" />}
            />
            <KpiCard
              label="Ticket promedio"
              value={fmtMoney(ticket)}
              sub="Por operación"
              trend={trendOf(ticket, prevTicket)}
              icon={<TrendingUp className="h-3.5 w-3.5" />}
            />
            <KpiCard
              label="Mejor canal"
              value={bestChannel?.label ?? "—"}
              sub={bestChannel ? fmtMoneyRound(bestChannel.revenue) : undefined}
              icon={<Trophy className="h-3.5 w-3.5" />}
            />
          </div>

          {/* ── Cards de canal ── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <ChannelCard
              label={data.channels.marketplace.label}
              revenue={data.channels.marketplace.revenue}
              orders={data.channels.marketplace.orders}
              totalRevenue={data.totals.revenue}
              icon={<Store className="h-4 w-4" />}
              color={palette.marketplace}
            />
            <ChannelCard
              label={data.channels.tienda.label}
              revenue={data.channels.tienda.revenue}
              orders={data.channels.tienda.orders}
              totalRevenue={data.totals.revenue}
              icon={<ShoppingBag className="h-4 w-4" />}
              color={palette.tienda}
            />
            <ChannelCard
              label={data.channels.pos.label}
              revenue={data.channels.pos.revenue}
              orders={data.channels.pos.orders}
              totalRevenue={data.totals.revenue}
              icon={<ShoppingCart className="h-4 w-4" />}
              color={palette.pos}
            />
          </div>

          {/* ── Chart principal: área apilada con gradientes ── */}
          <Panel title="Ingresos por día y canal" icon={<Activity className="h-4 w-4 text-[var(--text-secondary)]" />}>
            {seriesData.length === 0 ? (
              <ChartSkeleton height={260} />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <LazyAreaChart data={seriesData} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
                  <defs>
                    <linearGradient id="gMkt" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={palette.marketplace} stopOpacity={0.5} />
                      <stop offset="95%" stopColor={palette.marketplace} stopOpacity={0.03} />
                    </linearGradient>
                    <linearGradient id="gTienda" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={palette.tienda} stopOpacity={0.5} />
                      <stop offset="95%" stopColor={palette.tienda} stopOpacity={0.03} />
                    </linearGradient>
                    <linearGradient id="gPos" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={palette.pos} stopOpacity={0.5} />
                      <stop offset="95%" stopColor={palette.pos} stopOpacity={0.03} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={palette.grid} vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: palette.axis }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: palette.axis }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: number) => `S/${Math.round(v)}`}
                    width={52}
                  />
                  <Tooltip content={<CustomSeriesTooltip />} cursor={{ stroke: palette.grid }} />
                  <Legend
                    wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                    formatter={(value) => (
                      <span style={{ color: "var(--text-secondary)" }}>{value}</span>
                    )}
                  />
                  <Area type="monotone" dataKey="Marketplace" stackId="1" stroke={palette.marketplace} strokeWidth={2} fill="url(#gMkt)" />
                  <Area type="monotone" dataKey="Tienda online" stackId="1" stroke={palette.tienda} strokeWidth={2} fill="url(#gTienda)" />
                  <Area type="monotone" dataKey="Punto de venta" stackId="1" stroke={palette.pos} strokeWidth={2} fill="url(#gPos)" />
                </LazyAreaChart>
              </ResponsiveContainer>
            )}
          </Panel>

          {/* ── Horas pico + Métodos de pago ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Horas pico */}
            <Panel
              title="Horas pico"
              icon={<Clock className="h-4 w-4 text-[var(--text-secondary)]" />}
              action={
                peakHour ? (
                  <span className="text-[length:var(--ts-2xs)] font-bold text-[var(--accent)] bg-[var(--accent-soft)] rounded-full px-2 py-0.5">
                    Pico {peakHour.hour}:00 h
                  </span>
                ) : null
              }
            >
              <ResponsiveContainer width="100%" height={200}>
                <LazyBarChart data={hourlyData} margin={{ top: 4, right: 4, bottom: 0, left: -8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={palette.grid} vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 9, fill: palette.axis }}
                    axisLine={false}
                    tickLine={false}
                    interval={2}
                    tickFormatter={(v: string) => `${v}h`}
                  />
                  <YAxis
                    tick={{ fontSize: 9, fill: palette.axis }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: number) => `S/${Math.round(v)}`}
                    width={48}
                  />
                  <Tooltip
                    content={<SimpleTooltip suffix=":00 h" />}
                    cursor={{ fill: "var(--surface-sunken)" }}
                  />
                  <Bar dataKey="revenue" radius={[3, 3, 0, 0]} maxBarSize={18}>
                    {hourlyData.map((h) => (
                      <Cell
                        key={h.hour}
                        fill={peakHour && h.hour === peakHour.hour ? palette.marketplace : `${palette.marketplace}55`}
                      />
                    ))}
                  </Bar>
                </LazyBarChart>
              </ResponsiveContainer>
            </Panel>

            {/* Métodos de pago */}
            <Panel title="Métodos de pago" icon={<Wallet className="h-4 w-4 text-[var(--text-secondary)]" />}>
              {paymentsData.length === 0 ? (
                <p className="text-xs text-[var(--text-tertiary)] py-12 text-center">Sin pagos registrados</p>
              ) : (
                <div className="flex flex-col sm:flex-row items-center gap-4">
                  <div className="relative w-44 h-44 flex-shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <LazyPieChart>
                        <Pie
                          data={paymentsData}
                          cx="50%"
                          cy="50%"
                          innerRadius={52}
                          outerRadius={78}
                          paddingAngle={3}
                          dataKey="value"
                          stroke="none"
                        >
                          {paymentsData.map((entry) => (
                            <Cell key={entry.name} fill={entry.fill} />
                          ))}
                        </Pie>
                        <Tooltip content={<SimpleTooltip />} />
                      </LazyPieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <span className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)] uppercase">Total</span>
                      <span className="text-base font-extrabold text-[var(--text-primary)] tabular-nums">
                        {fmtMoneyRound(data.totals.revenue)}
                      </span>
                    </div>
                  </div>
                  <div className="flex-1 space-y-2 w-full">
                    {paymentsData.map((p) => (
                      <div key={p.name} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="inline-flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full" style={{ background: p.fill }} />
                            <span className="text-[var(--text-secondary)] font-semibold">{p.name}</span>
                          </span>
                          <span className="font-bold text-[var(--text-primary)] tabular-nums">{fmtMoney(p.value)}</span>
                        </div>
                        <div className="h-1.5 bg-[var(--surface-sunken)] rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{ width: pct(p.value, data.totals.revenue), background: p.fill }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Panel>
          </div>

          {/* ── Estado de caja + Top productos ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Estado de caja */}
            <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-[var(--text-primary)]">Estado de Caja</p>
                <div
                  className={cn(
                    "flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full",
                    data.cash.abierta
                      ? "bg-[var(--data-success-50)] text-[var(--data-success-600)]"
                      : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]",
                  )}
                >
                  {data.cash.abierta ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                  {data.cash.abierta ? "Abierta" : "Cerrada"}
                </div>
              </div>
              <div className="text-center py-3 border-y border-[var(--rule-soft)]">
                <p className="text-xs text-[var(--text-tertiary)] mb-0.5">Saldo actual</p>
                <p className="text-2xl font-extrabold text-[var(--text-primary)] tabular-nums">
                  {fmtMoney(data.cash.saldoActual)}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-[var(--data-success-50)] rounded-xl p-2.5">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Banknote className="h-3.5 w-3.5 text-[var(--data-success-600)]" />
                    <span className="text-xs font-bold text-[var(--data-success-600)]">Ingresos</span>
                  </div>
                  <p className="text-sm font-extrabold text-[var(--data-success-600)] tabular-nums">
                    {fmtMoney(data.cash.ingresos)}
                  </p>
                </div>
                <div className="bg-[var(--data-error-50)] rounded-xl p-2.5">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Wallet className="h-3.5 w-3.5 text-[var(--data-error-600)]" />
                    <span className="text-xs font-bold text-[var(--data-error-600)]">Egresos</span>
                  </div>
                  <p className="text-sm font-extrabold text-[var(--data-error-600)] tabular-nums">
                    {fmtMoney(data.cash.egresos)}
                  </p>
                </div>
              </div>
              {!data.cash.abierta && (
                <div className="flex items-center gap-1.5 text-xs text-[var(--text-tertiary)] bg-[var(--surface-sunken)] rounded-xl px-3 py-2">
                  <Clock className="h-3.5 w-3.5 flex-shrink-0" />
                  Caja cerrada — abre un turno para registrar movimientos
                </div>
              )}
            </div>

            {/* Top productos */}
            <div className="lg:col-span-2 bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Package className="h-4 w-4 text-[var(--text-secondary)]" />
                <p className="text-xs font-bold text-[var(--text-primary)]">Top productos</p>
              </div>
              {data.topProducts.length === 0 ? (
                <p className="text-xs text-[var(--text-tertiary)] py-8 text-center">Sin productos vendidos en este rango</p>
              ) : (
                <div className="space-y-2.5">
                  {data.topProducts.slice(0, 6).map((prod, i) => (
                    <div key={prod.name} className="flex items-center gap-3">
                      <span
                        className={cn(
                          "inline-flex h-5 w-5 items-center justify-center rounded-md text-[length:var(--ts-2xs)] font-extrabold flex-shrink-0",
                          i === 0
                            ? "bg-[var(--accent)] text-white"
                            : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]",
                        )}
                      >
                        {i + 1}
                      </span>
                      <div className="relative h-11 w-11 flex-shrink-0 rounded-xl overflow-hidden border border-[var(--rule-soft)] bg-[var(--surface-sunken)]">
                        {prod.image ? (
                          <Image
                            src={prod.image}
                            alt={prod.name}
                            fill
                            sizes="44px"
                            className="object-cover"
                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                          />
                        ) : (
                          <ProductImagePlaceholder showLabel={false} size={18} />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold text-[var(--text-primary)] truncate">{prod.name}</p>
                          <span className="text-xs font-bold text-[var(--text-primary)] tabular-nums flex-shrink-0">
                            {fmtMoney(prod.revenue)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex-1 h-1.5 bg-[var(--surface-sunken)] rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-700"
                              style={{
                                width: `${Math.max((prod.revenue / maxTopRevenue) * 100, 3)}%`,
                                background: palette.marketplace,
                              }}
                            />
                          </div>
                          <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] whitespace-nowrap">
                            {prod.qty} {prod.qty === 1 ? "u." : "u."}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
