"use client";

/**
 * StoreAnalyticsModule — Vista de analítica de productos para el bodeguero.
 *
 * Consume /api/admin/store-analytics y muestra:
 *   - 4 KPIs (vistas, adds-to-cart, conversiones, revenue)
 *   - Funnel: views → addsToCart → conversions con rates
 *   - Top 10 productos por views
 *   - Top 10 productos por revenue
 *   - Sparkline de revenue diario
 *
 * Sin librerías externas — sparkline en SVG inline. Tokens estrictos.
 */

import { useEffect, useState } from "react";
import {
  Eye,
  ShoppingCart,
  CheckCircle2,
  TrendingUp,
  AlertTriangle,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────────────
interface AnalyticsData {
  ok: boolean;
  period: { days: number; since: string };
  kpis: {
    views: number;
    clicks: number;
    addsToCart: number;
    conversions: number;
    revenue: number;
    conversionRate: number;
    cartAbandonRate: number;
  };
  topByViews: TopRow[];
  topByRevenue: TopRow[];
  dailyTrend: Array<{ date: string; views: number; addsToCart: number; conversions: number; revenue: number }>;
}

interface TopRow {
  productId: number;
  name: string;
  image: string | null;
  category: string | null;
  price: number;
  views: number;
  addsToCart: number;
  conversions: number;
  revenue: number;
  conversionRate: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmtN = new Intl.NumberFormat("es-PE");
const fmtPen = new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" });
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

function Sparkline({ values, height = 40 }: { values: number[]; height?: number }) {
  if (values.length === 0) return null;
  const max = Math.max(...values, 1);
  const w = 100;
  const points = values
    .map((v, i) => `${(i / Math.max(1, values.length - 1)) * w},${height - (v / max) * height}`)
    .join(" ");
  return (
    <svg
      viewBox={`0 0 ${w} ${height}`}
      preserveAspectRatio="none"
      className="w-full h-full"
      aria-hidden
    >
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={points}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

// ── Subcomponents ────────────────────────────────────────────────────────────
function KpiCard({
  label,
  value,
  hint,
  Icon,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  Icon: typeof Eye;
  accent?: boolean;
}) {
  return (
    <div className={cn(
      "rounded-xl border p-4 flex items-start gap-3",
      accent
        ? "bg-[var(--accent)]/10 border-[var(--accent)]/30"
        : "bg-[var(--surface-raised)] border-[var(--rule-soft)]",
    )}>
      <span className={cn(
        "shrink-0 inline-flex h-9 w-9 items-center justify-center rounded-lg",
        accent ? "bg-[var(--accent)]/20 text-[var(--accent)]" : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
      )}>
        <Icon className="h-4 w-4" strokeWidth={2} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
          {label}
        </p>
        <p className="text-2xl font-black text-[var(--text-primary)] tabular-nums leading-tight">{value}</p>
        {hint && <p className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)] mt-0.5">{hint}</p>}
      </div>
    </div>
  );
}

function FunnelBar({ label, value, max, pctTotal, color }: { label: string; value: number; max: number; pctTotal: number; color: string }) {
  const widthPct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-xs mb-1">
        <span className="font-bold text-[var(--text-primary)]">{label}</span>
        <span className="text-[var(--text-tertiary)] tabular-nums">
          {fmtN.format(value)} <span className="opacity-60">· {pct(pctTotal)}</span>
        </span>
      </div>
      <div className="h-2.5 rounded-full bg-[var(--surface-sunken)] overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${widthPct}%` }} />
      </div>
    </div>
  );
}

function TopProductRow({ row, metric }: { row: TopRow; metric: "views" | "revenue" }) {
  return (
    <div className="flex items-center gap-3 py-2 border-b border-[var(--rule-soft)] last:border-0">
      <div className="h-9 w-9 shrink-0 rounded-lg bg-[var(--surface-sunken)] border border-[var(--rule-soft)] overflow-hidden flex items-center justify-center">
        {row.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={row.image} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <span className="text-[var(--text-tertiary)] text-[length:var(--ts-2xs)] font-bold">{row.name.slice(0, 2).toUpperCase()}</span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-[var(--text-primary)] truncate">{row.name}</p>
        <p className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)] truncate">
          {row.category ?? "—"} · {fmtPen.format(row.price)}
        </p>
      </div>
      <div className="text-right shrink-0 tabular-nums">
        {metric === "views" ? (
          <>
            <p className="text-sm font-black text-[var(--text-primary)]">{fmtN.format(row.views)}</p>
            <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">vistas · {pct(row.conversionRate)} conv</p>
          </>
        ) : (
          <>
            <p className="text-sm font-black text-[var(--accent)]">{fmtPen.format(row.revenue)}</p>
            <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{fmtN.format(row.conversions)} ventas</p>
          </>
        )}
      </div>
    </div>
  );
}

// ── Main module ──────────────────────────────────────────────────────────────
export default function StoreAnalyticsModule() {
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async (selectedDays: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/store-analytics?days=${selectedDays}`, { cache: "no-store" });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      const json = (await res.json()) as AnalyticsData;
      setData(json);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchData(days);
  }, [days]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-20 text-[var(--text-tertiary)]">
        <Loader2 className="h-6 w-6 animate-spin mr-2" strokeWidth={2} />
        <span className="text-sm font-bold">Cargando analíticas…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl bg-[var(--data-error)]/10 border border-[var(--data-error)]/30 p-5 flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-[var(--data-error)] shrink-0 mt-0.5" strokeWidth={2} />
        <div className="flex-1">
          <p className="font-bold text-[var(--text-primary)]">No se pudieron cargar las analíticas</p>
          <p className="text-sm text-[var(--text-secondary)] mt-1">{error}</p>
          <button
            type="button"
            onClick={() => fetchData(days)}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[var(--surface-raised)] border border-[var(--rule-base)] px-3 py-1.5 text-xs font-bold hover:bg-[var(--surface-sunken)]"
          >
            <RefreshCw className="h-3.5 w-3.5" strokeWidth={2} />
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { kpis, topByViews, topByRevenue, dailyTrend } = data;
  const isEmpty = kpis.views === 0 && kpis.conversions === 0 && kpis.revenue === 0;

  // Funnel max para escalar las barras visualmente
  const funnelMax = Math.max(kpis.views, kpis.addsToCart, kpis.conversions, 1);
  const revenueSeries = dailyTrend.map((d) => d.revenue);

  return (
    <div className="space-y-5">
      {/* Header con selector de período */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black tracking-tight text-[var(--text-primary)]">Analítica de productos</h2>
          <p className="text-sm text-[var(--text-tertiary)] mt-0.5">
            Datos del último período seleccionado · vistas, conversión y ventas por producto
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-lg bg-[var(--surface-sunken)] border border-[var(--rule-soft)] p-1">
          {([7, 30, 90] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs font-bold transition-colors",
                days === d
                  ? "bg-[var(--accent)] text-white"
                  : "text-[var(--text-secondary)] hover:bg-[var(--surface-raised)]",
              )}
            >
              {d}d
            </button>
          ))}
          <button
            type="button"
            onClick={() => fetchData(days)}
            className="ml-1 inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-[var(--surface-raised)] text-[var(--text-secondary)]"
            title="Refrescar"
            aria-label="Refrescar analíticas"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} strokeWidth={2} />
          </button>
        </div>
      </header>

      {isEmpty && (
        <div className="rounded-xl bg-[var(--surface-sunken)] border border-[var(--rule-soft)] p-6 text-center">
          <p className="text-sm font-bold text-[var(--text-primary)]">Sin datos en el período seleccionado</p>
          <p className="text-xs text-[var(--text-tertiary)] mt-1">
            Cuando haya tráfico y ventas en tus productos, los verás acá. Probá con un período más amplio o esperá a que registremos eventos.
          </p>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Vistas" value={fmtN.format(kpis.views)} Icon={Eye} />
        <KpiCard label="Adds al carrito" value={fmtN.format(kpis.addsToCart)} Icon={ShoppingCart} />
        <KpiCard label="Conversiones" value={fmtN.format(kpis.conversions)} hint={`${pct(kpis.conversionRate)} de las vistas`} Icon={CheckCircle2} accent />
        <KpiCard label="Ingresos" value={fmtPen.format(kpis.revenue)} hint={`${pct(kpis.cartAbandonRate)} abandono carrito`} Icon={TrendingUp} accent />
      </div>

      {/* Sparkline + Funnel */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl bg-[var(--surface-raised)] border border-[var(--rule-soft)] p-5">
          <h3 className="text-sm font-black text-[var(--text-primary)] mb-3">Ingresos diarios</h3>
          <div className="text-[var(--accent)] h-12 mb-2">
            <Sparkline values={revenueSeries} height={48} />
          </div>
          <p className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)] tabular-nums">
            {dailyTrend[0]?.date ?? "—"} → {dailyTrend[dailyTrend.length - 1]?.date ?? "—"}
          </p>
        </div>

        <div className="rounded-xl bg-[var(--surface-raised)] border border-[var(--rule-soft)] p-5">
          <h3 className="text-sm font-black text-[var(--text-primary)] mb-4">Funnel de conversión</h3>
          <div className="space-y-3">
            <FunnelBar label="Vistas" value={kpis.views} max={funnelMax} pctTotal={1} color="bg-[var(--text-secondary)]" />
            <FunnelBar
              label="Agregaron al carrito"
              value={kpis.addsToCart}
              max={funnelMax}
              pctTotal={kpis.views > 0 ? kpis.addsToCart / kpis.views : 0}
              color="bg-amber-500"
            />
            <FunnelBar
              label="Compraron"
              value={kpis.conversions}
              max={funnelMax}
              pctTotal={kpis.views > 0 ? kpis.conversions / kpis.views : 0}
              color="bg-[var(--data-success)]"
            />
          </div>
        </div>
      </div>

      {/* Top tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl bg-[var(--surface-raised)] border border-[var(--rule-soft)] p-5">
          <h3 className="text-sm font-black text-[var(--text-primary)] mb-3">Más vistos</h3>
          {topByViews.length === 0 ? (
            <p className="text-sm text-[var(--text-tertiary)]">Sin datos.</p>
          ) : (
            <div className="space-y-1">
              {topByViews.map((r) => <TopProductRow key={`v-${r.productId}`} row={r} metric="views" />)}
            </div>
          )}
        </div>

        <div className="rounded-xl bg-[var(--surface-raised)] border border-[var(--rule-soft)] p-5">
          <h3 className="text-sm font-black text-[var(--text-primary)] mb-3">Más ingresos</h3>
          {topByRevenue.length === 0 ? (
            <p className="text-sm text-[var(--text-tertiary)]">Sin datos.</p>
          ) : (
            <div className="space-y-1">
              {topByRevenue.map((r) => <TopProductRow key={`r-${r.productId}`} row={r} metric="revenue" />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
