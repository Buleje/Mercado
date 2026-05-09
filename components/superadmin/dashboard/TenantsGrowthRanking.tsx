"use client";

/**
 * TenantsGrowthRanking — leaderboard de tiendas por crecimiento.
 *
 * Renderiza un ranking ordenado por volumen (orders | revenue) en el rango
 * elegido. Top 3 con podio destacado, resto en lista compacta. Cada fila
 * muestra: posición, nombre, plan, sparkline mini, total y delta vs período
 * anterior (cuando aplica).
 *
 * Filtros: día (1d), semana (7d), mes (30d), trimestre (90d), año (1y).
 * Métricas: pedidos | ingresos.
 */

import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
} from "recharts";
import {
  ShoppingBag,
  Banknote,
  Loader2,
  TrendingUp,
  TrendingDown,
  Minus,
} from "@buleje/design-system/icons";
import SuperadminChartCard from "@/components/superadmin/_shared/SuperadminChartCard";

type Range = "1d" | "7d" | "30d" | "90d" | "1y";

interface TenantSeries {
  tenantId: string;
  tenantName: string;
  slug: string;
  plan: string;
  color: string;
  points: Array<{ date: string; value: number }>;
  total: number;
}

interface GrowthData {
  range: string;
  metric: "orders" | "revenue";
  dates: string[];
  series: TenantSeries[];
}

const RANGE_LABELS: Record<Range, string> = {
  "1d": "Hoy",
  "7d": "7 días",
  "30d": "30 días",
  "90d": "90 días",
  "1y": "1 año",
};

const PLAN_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  free: { bg: "bg-zinc-100 dark:bg-zinc-800", text: "text-zinc-700 dark:text-zinc-300", label: "Free" },
  pro: { bg: "bg-amber-100 dark:bg-amber-950/40", text: "text-amber-800 dark:text-amber-300", label: "Pro" },
  business: { bg: "bg-sky-100 dark:bg-sky-950/40", text: "text-sky-800 dark:text-sky-300", label: "Business" },
  enterprise: { bg: "bg-emerald-100 dark:bg-emerald-950/40", text: "text-emerald-800 dark:text-emerald-300", label: "Enterprise" },
};

const fmtSoles = (n: number) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN", maximumFractionDigits: 0 }).format(n);

function PodiumIcon({ position }: { position: number }) {
  // Medallas para top 3
  const styles = [
    "bg-linear-to-br from-yellow-300 to-yellow-500 text-yellow-950 ring-2 ring-yellow-200",
    "bg-linear-to-br from-zinc-300 to-zinc-400 text-zinc-900 ring-2 ring-zinc-200",
    "bg-linear-to-br from-orange-300 to-orange-400 text-orange-950 ring-2 ring-orange-200",
  ];
  return (
    <div className={`h-9 w-9 rounded-full flex items-center justify-center font-extrabold text-base shrink-0 ${styles[position - 1]}`}>
      {position}
    </div>
  );
}

function DeltaPill({ value }: { value: number }) {
  if (value === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--text-tertiary)]">
        <Minus className="h-3.5 w-3.5" /> 0%
      </span>
    );
  }
  const positive = value > 0;
  return (
    <span
      className={`inline-flex items-center gap-1 text-sm font-bold ${
        positive ? "text-[var(--data-success-600)] dark:text-emerald-400" : "text-[var(--data-error-500)] dark:text-[var(--data-error-500)]"
      }`}
    >
      {positive ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
      {positive ? "+" : ""}{value.toFixed(0)}%
    </span>
  );
}

export default function TenantsGrowthRanking() {
  const [range, setRange] = useState<Range>("30d");
  const [revenueData, setRevenueData] = useState<GrowthData | null>(null);
  const [ordersData, setOrdersData] = useState<GrowthData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    // Para "1d" usamos 7d con foco en el último día (la API mínima es 7d).
    const apiRange = range === "1d" ? "7d" : range;
    // Fetch BOTH metrics simultáneamente — el ranking muestra el combo.
    Promise.all([
      fetch(`/api/superadmin/dashboard/tenant-growth?range=${apiRange}&metric=revenue&top=20`, { credentials: "include" }).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/superadmin/dashboard/tenant-growth?range=${apiRange}&metric=orders&top=20`, { credentials: "include" }).then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([rev, ord]) => {
        if (cancelled) return;
        setRevenueData(rev);
        setOrdersData(ord);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [range]);

  // Combinamos ambas series en un único array por tenant. Sort por revenue
  // descendente (es el valor monetario más relevante).
  const combined = useMemo(() => {
    if (!revenueData?.series) return [];
    const ordersByTenantId = new Map(
      (ordersData?.series ?? []).map((s) => [s.tenantId, s] as const),
    );
    const merged = revenueData.series.map((revSeries) => {
      const ordSeries = ordersByTenantId.get(revSeries.tenantId);
      const ordersTotal = ordSeries?.total ?? 0;
      const half = Math.floor(revSeries.points.length / 2);
      const revPrev = revSeries.points.slice(0, half).reduce((sum, p) => sum + p.value, 0);
      const revDelta = revPrev > 0 ? ((revSeries.total - revPrev) / revPrev) * 100 : revSeries.total > 0 ? 100 : 0;
      const ordPrev = (ordSeries?.points ?? []).slice(0, half).reduce((sum, p) => sum + p.value, 0);
      const ordDelta = ordPrev > 0 ? ((ordersTotal - ordPrev) / ordPrev) * 100 : ordersTotal > 0 ? 100 : 0;
      return {
        ...revSeries,
        revenue: revSeries.total,
        orders: ordersTotal,
        revenueDelta: revDelta,
        ordersDelta: ordDelta,
        // Línea de revenue (punto a punto) para el sparkline.
        revenuePoints: revSeries.points,
        ordersPoints: ordSeries?.points ?? revSeries.points.map((p) => ({ ...p, value: 0 })),
      };
    });
    // Ranking: orden por revenue descendente.
    return merged.sort((a, b) => b.revenue - a.revenue);
  }, [revenueData, ordersData]);

  // Para "1d" reemplazamos los totales por el último punto del array (último día).
  const adjusted = useMemo(() => {
    if (range !== "1d") return combined;
    return combined.map((s) => {
      const lastRev = s.revenuePoints[s.revenuePoints.length - 1]?.value ?? 0;
      const lastOrd = s.ordersPoints[s.ordersPoints.length - 1]?.value ?? 0;
      return { ...s, revenue: lastRev, orders: lastOrd };
    });
  }, [combined, range]);

  return (
    <SuperadminChartCard
      kicker="RANKING"
      title="Crecimiento de tiendas"
      description={`Las tiendas ranqueadas por ingresos + pedidos en ${RANGE_LABELS[range].toLowerCase()}.`}
      actions={
        <>
          {/* Range picker */}
          <div className="inline-flex rounded-xl border-2 border-[var(--rule-base)] p-1 text-base">
            {(["1d", "7d", "30d", "90d", "1y"] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                className={[
                  "px-3 py-1.5 rounded-lg font-bold transition-colors text-sm",
                  range === r
                    ? "bg-[var(--accent-600,var(--accent))] text-white"
                    : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]",
                ].join(" ")}
              >
                {RANGE_LABELS[r]}
              </button>
            ))}
          </div>

          {/* Indicador combinado: ambas métricas siempre visibles */}
          <div className="inline-flex items-center gap-3 rounded-xl border-2 border-[var(--rule-base)] px-3 py-1.5">
            <span className="inline-flex items-center gap-1.5 text-sm font-bold text-[var(--text-secondary)]">
              <ShoppingBag className="h-4 w-4" /> Pedidos
            </span>
            <span className="h-4 w-px bg-[var(--rule-base)]" aria-hidden />
            <span className="inline-flex items-center gap-1.5 text-sm font-bold text-[var(--accent)]">
              <Banknote className="h-4 w-4" /> Ingresos
            </span>
          </div>
        </>
      }
    >

      {loading && (
        <div className="flex items-center justify-center py-16 text-base text-[var(--text-tertiary)]">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Cargando ranking…
        </div>
      )}

      {!loading && adjusted.length === 0 && (
        <div className="py-16 text-center text-base text-[var(--text-tertiary)]">
          Sin actividad en el rango seleccionado.
        </div>
      )}

      {!loading && adjusted.length > 0 && (
        <ol className="space-y-2">
          {adjusted.map((tenant, idx) => {
            const position = idx + 1;
            const isPodium = position <= 3;
            const planMeta = PLAN_COLORS[tenant.plan] ?? PLAN_COLORS.free;

            return (
              <li
                key={tenant.tenantId}
                className={[
                  "flex items-center gap-4 rounded-xl px-4 py-3 transition-colors border",
                  isPodium
                    ? "bg-[var(--accent-soft)] border-[var(--accent)]/30"
                    : "bg-[var(--surface-canvas)] border-[var(--rule-soft)] hover:bg-[var(--surface-sunken)]",
                ].join(" ")}
              >
                {isPodium ? (
                  <PodiumIcon position={position} />
                ) : (
                  <span className="h-9 w-9 rounded-full bg-[var(--surface-sunken)] text-[var(--text-secondary)] flex items-center justify-center font-bold text-base shrink-0">
                    {position}
                  </span>
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-base font-extrabold text-[var(--text-primary)] truncate">
                      {tenant.tenantName}
                    </p>
                    <span className={`inline-flex items-center text-xs font-bold px-2 py-0.5 rounded-full ${planMeta.bg} ${planMeta.text}`}>
                      {planMeta.label}
                    </span>
                  </div>
                  <p className="text-sm text-[var(--text-tertiary)] truncate">
                    {tenant.slug}
                  </p>
                </div>

                {/* Sparkline de revenue */}
                <div className="hidden sm:block w-32 h-14 shrink-0">
                  <ResponsiveContainer minWidth={0} width="100%" height="100%">
                    <AreaChart data={tenant.revenuePoints} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
                      <defs>
                        <linearGradient id={`spark-${tenant.tenantId}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={tenant.color} stopOpacity={0.45} />
                          <stop offset="100%" stopColor={tenant.color} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <Area
                        type="monotone"
                        dataKey="value"
                        stroke={tenant.color}
                        strokeWidth={2.5}
                        fill={`url(#spark-${tenant.tenantId})`}
                        isAnimationActive={false}
                      />
                      <XAxis dataKey="date" hide />
                      <YAxis hide />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                {/* Doble métrica: pedidos + ingresos lado a lado */}
                <div className="grid grid-cols-2 gap-4 shrink-0 min-w-[200px]">
                  <div className="text-right">
                    <p className="text-[length:var(--ts-2xs)] uppercase font-bold tracking-wider text-[var(--text-tertiary)] flex items-center justify-end gap-1">
                      <ShoppingBag className="h-3 w-3" /> Pedidos
                    </p>
                    <p className="text-lg sm:text-xl font-extrabold text-[var(--text-primary)] tabular-nums mt-0.5">
                      {tenant.orders}
                    </p>
                    <DeltaPill value={tenant.ordersDelta} />
                  </div>
                  <div className="text-right">
                    <p className="text-[length:var(--ts-2xs)] uppercase font-bold tracking-wider text-[var(--accent)] flex items-center justify-end gap-1">
                      <Banknote className="h-3 w-3" /> Ingresos
                    </p>
                    <p className="text-lg sm:text-xl font-extrabold text-[var(--text-primary)] tabular-nums mt-0.5">
                      {fmtSoles(tenant.revenue)}
                    </p>
                    <DeltaPill value={tenant.revenueDelta} />
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </SuperadminChartCard>
  );
}
