"use client";

/**
 * MarketplaceDashboard — Resumen del PROPIO negocio dentro del marketplace.
 *
 * Brandon 2026-06-01 (rediseño "solo datos reales del negocio"): antes este
 * panel pintaba `buildMockData()` — tiendas inventadas ("Bodega San Martín",
 * "El Sol"…), canales/categorías/conversión con seed determinista y métricas
 * cross-store ("tiendas activas por mes", "top 5 tiendas"). Nada de eso es del
 * negocio ni es real.
 *
 * Ahora consume EXCLUSIVAMENTE `/api/marketplace/analytics` (scoped a
 * tenantId + store.id del vendor en el server) → muestra solo el movimiento
 * real de ESTA tienda dentro del marketplace:
 *   - KPIs: pedidos del mes, ventas del mes, ticket promedio, comisión.
 *   - Ventas diarias reales (últimos 7 días).
 *   - Tus productos más vendidos (reales).
 *   - Qué atender: pedidos pendientes, stock bajo, reseñas por moderar (reales).
 * Sin datos decorativos ni de otros negocios. Si no hay actividad → empty-state.
 */

import { useEffect, useState } from "react";
import { StatCard } from "@buleje/design-system";
import {
  ShoppingCart,
  DollarSign,
  TrendingUp,
  Package,
  AlertCircle,
  MessageSquare,
  ExternalLink,
  ArrowRight,
  Store,
} from "@buleje/design-system/icons";
import {
  BarChart, Bar, LabelList,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import {
  ChartCard,
  ChartTooltip,
  CHART_TOKENS,
  MicroList,
} from "@/components/admin/inicio/_shared";

const T = CHART_TOKENS;

interface VendorAnalytics {
  store: { name: string; slug: string; rating: number; reviewCount: number };
  today: { orders: number; revenue: number };
  month: { orders: number; revenue: number; avgTicket: number; revenueGrowth: number };
  week: { orders: number; revenue: number };
  products: { published: number; total: number; lowStock: number };
  pendingOrders: number;
  pendingReviews: number;
  topProducts: { name: string; qty: number; revenue: number }[];
  recentOrders: { id: string; customerName: string; total: number; status: string; createdAt: string }[];
  dailySales: { date: string; revenue: number; orders: number }[];
}

interface MarketplaceDashboardProps {
  kpis: { publishedProducts: number; monthOrders: number; pendingCommissions: number };
  loading?: boolean;
}

const fmtMoney = (n: number) =>
  `S/ ${n >= 1000 ? `${(n / 1000).toFixed(1)}k` : n.toFixed(2)}`;

export default function MarketplaceDashboard({ kpis, loading }: MarketplaceDashboardProps) {
  const [data, setData] = useState<VendorAnalytics | null>(null);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    // flag `cancelled` (no AbortController) — evita el AbortError al desmontar.
    let cancelled = false;
    setFetching(true);
    (async () => {
      try {
        const r = await fetch("/api/marketplace/analytics");
        if (cancelled) return;
        const d = r.ok ? await r.json() : null;
        if (!cancelled && d && typeof d === "object") setData(d as VendorAnalytics);
      } catch {
        /* silent — el empty-state cubre el caso sin datos */
      } finally {
        if (!cancelled) setFetching(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading || fetching) return <DashboardSkeleton />;

  // Sin actividad real → empty-state honesto (nada de números inventados).
  const noActivity =
    !data ||
    (data.month.orders === 0 &&
      data.today.orders === 0 &&
      data.week.orders === 0 &&
      data.topProducts.length === 0);

  if (noActivity) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20 rounded-2xl border-2 border-dashed border-[var(--rule-base)] bg-[var(--surface-sunken)]">
        <div className="h-16 w-16 rounded-2xl bg-[var(--accent-soft)] flex items-center justify-center">
          <Store className="h-8 w-8 text-[color:var(--accent,var(--text-primary))]" />
        </div>
        <div className="text-center max-w-lg px-6">
          <h3 className="text-xl font-extrabold text-[var(--text-primary)] mb-2">
            Tu tienda todavía no registra ventas en el marketplace
          </h3>
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
            Cuando entren pedidos vas a ver acá tus números reales: ventas de los
            últimos 30 días, ticket promedio, ventas diarias y tus productos más
            vendidos. No mostramos números inventados.
          </p>
        </div>
      </div>
    );
  }

  // ── Datos reales del negocio ──────────────────────────────────────────────
  const daily = data.dailySales.map((d) => ({
    dia: new Date(d.date).toLocaleDateString("es-PE", { day: "2-digit", month: "short" }),
    gmv: d.revenue,
    orders: d.orders,
  }));
  const maxGmv = Math.max(...daily.map((d) => d.gmv), 1);
  const windowTotal = daily.reduce((s, d) => s + d.gmv, 0);
  const isDailyEmpty = daily.every((d) => d.gmv === 0);

  const topProducts = data.topProducts
    .filter((p) => p.revenue > 0 || p.qty > 0)
    // Ordenar por ingreso real (qty × precio); la API los devuelve por suma de
    // precio unitario, lo que dejaba el ranking visual desordenado.
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5)
    .map((p) => ({
      name: p.name,
      value: p.revenue,
      label: fmtMoney(p.revenue),
      sublabel: `${p.qty} vendido${p.qty === 1 ? "" : "s"}`,
    }));

  const hasAlerts =
    data.pendingOrders > 0 || data.products.lowStock > 0 || data.pendingReviews > 0;

  return (
    <div className="space-y-5">
      {/* ── KPIs reales del negocio ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Pedidos (30 días)"
          value={String(data.month.orders)}
          icon={ShoppingCart}
        />
        <StatCard
          label="Ventas (30 días)"
          value={fmtMoney(data.month.revenue)}
          icon={DollarSign}
          delta={data.month.revenueGrowth !== 0 ? data.month.revenueGrowth : null}
          emphasis={data.month.revenue > 0 ? "success" : "neutral"}
        />
        <StatCard
          label="Ticket promedio"
          value={fmtMoney(data.month.avgTicket)}
          icon={TrendingUp}
        />
        <StatCard
          label="Comisión pendiente"
          value={fmtMoney(kpis.pendingCommissions)}
          icon={DollarSign}
        />
      </div>

      {/* ── Mini-row: hoy + reseñas + productos publicados (reales) ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3">
          <p className="text-xl font-extrabold text-[var(--text-primary)] tabular-nums">{fmtMoney(data.today.revenue)}</p>
          <p className="text-[length:var(--ts-2xs)] text-[var(--text-secondary)] mt-0.5">Ventas de hoy</p>
          <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mt-0.5">{data.today.orders} pedido{data.today.orders === 1 ? "" : "s"}</p>
        </div>
        <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3">
          <p className="text-xl font-extrabold text-[var(--data-warning-500)] tabular-nums">★ {Number(data.store.rating).toFixed(1)}</p>
          <p className="text-[length:var(--ts-2xs)] text-[var(--text-secondary)] mt-0.5">Calificación</p>
          <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mt-0.5">{data.store.reviewCount} reseña{data.store.reviewCount === 1 ? "" : "s"}</p>
        </div>
        <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3 col-span-2 sm:col-span-1">
          <p className="text-xl font-extrabold text-[var(--text-primary)] tabular-nums">{data.products.published}/{data.products.total}</p>
          <p className="text-[length:var(--ts-2xs)] text-[var(--text-secondary)] mt-0.5">Productos publicados</p>
          <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mt-0.5">{data.week.orders} pedido{data.week.orders === 1 ? "" : "s"} esta semana</p>
        </div>
      </div>

      {/* ── Qué atender (alertas reales) ── */}
      {hasAlerts && (
        <div className="flex flex-wrap gap-2">
          {data.pendingOrders > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--data-warning-50)] text-[var(--data-warning-500)] text-xs font-semibold">
              <ShoppingCart className="h-3.5 w-3.5" />
              {data.pendingOrders} pedido{data.pendingOrders === 1 ? "" : "s"} por confirmar
            </span>
          )}
          {data.products.lowStock > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--data-error-50)] text-[var(--data-error-500)] text-xs font-semibold">
              <AlertCircle className="h-3.5 w-3.5" />
              {data.products.lowStock} producto{data.products.lowStock === 1 ? "" : "s"} con stock bajo
            </span>
          )}
          {data.pendingReviews > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--accent-soft)] text-[var(--accent)] text-xs font-semibold">
              <MessageSquare className="h-3.5 w-3.5" />
              {data.pendingReviews} reseña{data.pendingReviews === 1 ? "" : "s"} por moderar
            </span>
          )}
        </div>
      )}

      {/* ── Ventas diarias reales (7 días) ── */}
      <ChartCard
        title="Tus ventas diarias"
        Icon={TrendingUp}
        height={280}
        description="Cuánto vendió tu tienda cada día en el marketplace (últimos 30 días)."
        isEmpty={isDailyEmpty}
        emptyText="Sin ventas registradas en los últimos 30 días"
        badge={
          <div className="text-right">
            <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">
              Total 30 días
            </p>
            <p className="text-xl sm:text-2xl font-extrabold text-[var(--text-primary)] tabular-nums">
              {fmtMoney(windowTotal)}
            </p>
          </div>
        }
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={daily} margin={{ top: 28, right: 16, left: 0, bottom: 4 }} barCategoryGap="14%">
            <XAxis
              dataKey="dia"
              tick={{ fontSize: 11, fill: T.tickFill, fontWeight: 600 }}
              axisLine={false}
              tickLine={false}
              tickMargin={8}
              interval={Math.max(0, Math.floor(daily.length / 6))}
            />
            <YAxis
              tick={{ fontSize: 12, fill: T.tickFill, fontWeight: 600 }}
              axisLine={false}
              tickLine={false}
              tickCount={4}
              tickFormatter={(v) => (v >= 1000 ? `S/${(v / 1000).toFixed(0)}k` : `S/${v}`)}
              width={50}
            />
            <Tooltip content={<ChartTooltip prefix="S/" />} cursor={{ fill: T.brand, fillOpacity: 0.08 }} />
            <Bar dataKey="gmv" name="Ventas" radius={[4, 4, 0, 0]} maxBarSize={22}>
              {daily.map((entry, i) => (
                <Cell key={i} fill={T.brand} fillOpacity={entry.gmv === maxGmv && maxGmv > 0 ? 1 : 0.45} />
              ))}
              {/* A 30 barras los labels por barra saturan → solo tooltip + eje Y. */}
              {daily.length <= 10 && (
                <LabelList
                  dataKey="gmv"
                  position="top"
                  formatter={(v) => {
                    const n = Number(v);
                    if (!n) return "";
                    return n >= 1000 ? `S/${(n / 1000).toFixed(1)}k` : `S/${Math.round(n)}`;
                  }}
                  style={{ fill: T.primary, fontSize: 10, fontWeight: 700 }}
                />
              )}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* ── Tus productos más vendidos (reales) + ver tienda ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="Tus productos más vendidos"
          Icon={Package}
          height={240}
          description="Lo que más se vende de tu tienda (últimos 30 días)."
          isEmpty={topProducts.length === 0}
          emptyText="Todavía no hay productos vendidos en los últimos 30 días"
        >
          <MicroList items={topProducts} barColor={T.brand} showRank />
        </ChartCard>

        <div className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 flex flex-col">
          <h4 className="text-sm font-bold text-[var(--text-primary)] mb-3">Tu tienda en el marketplace</h4>
          {data.recentOrders.length > 0 ? (
            <div className="space-y-2.5 flex-1">
              {data.recentOrders.slice(0, 5).map((o) => (
                <div key={o.id} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-[var(--text-primary)] truncate">{o.customerName || "Cliente"}</p>
                    <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                      {new Date(o.createdAt).toLocaleDateString("es-PE", { day: "numeric", month: "short" })}
                    </p>
                  </div>
                  <span className="text-xs font-bold text-[var(--data-success-500)] shrink-0 tabular-nums">{fmtMoney(o.total)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-[var(--text-tertiary)] flex-1">Sin pedidos recientes.</p>
          )}
          {data.store.slug && (
            <a
              href={`/marketplace/${data.store.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center justify-between gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-2.5 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)] transition-colors group"
            >
              <span className="inline-flex items-center gap-2">
                <ExternalLink className="h-4 w-4" />
                Ver mi tienda pública
              </span>
              <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="bg-[var(--surface-sunken)] rounded-xl h-28" />)}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => <div key={i} className="bg-[var(--surface-sunken)] rounded-xl h-20" />)}
      </div>
      <div className="bg-[var(--surface-sunken)] rounded-xl h-[320px]" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="bg-[var(--surface-sunken)] rounded-xl h-[280px]" />
        <div className="bg-[var(--surface-sunken)] rounded-xl h-[280px]" />
      </div>
    </div>
  );
}
