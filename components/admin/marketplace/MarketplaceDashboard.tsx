"use client";

/**
 * MarketplaceDashboard — Resumen del PROPIO negocio dentro del marketplace.
 * Sólo `/api/marketplace/analytics` (scoped a tenantId + store.id en el server):
 * pedidos, ventas y ticket de 30 días, hoy, ventas diarias y lo que más vendes.
 * Sin datos decorativos ni de otros negocios (Brandon 2026-06-01); sin
 * actividad → empty-state.
 */

import { useEffect, useState } from "react";
import { SectionTitle, StatCard } from "@buleje/design-system";
import ChartsEmptyState from "@/components/admin/shared/ChartsEmptyState";
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
  Calendar,
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
import { useKpisPlegables } from "@/components/admin/forestal/kpis-plegables";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { useAccionesDeVista } from "@/components/admin/marketplace/acciones-de-vista";
import { formatCurrency, formatDateShort } from "@/lib/format";

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

/** Monto completo. Antes pasaba «3.1k» como TEXTO a formatCurrency y S/ 3 120 salía «S/ 3.10» (11-10). */
const fmtMoney = (n: number) => formatCurrency(n);

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/**
 * Qué se sacó (11-10, «ninguna cifra dos veces» en el hub): la comisión pendiente
 * (es «Por pagar» de Comisiones), la calificación (Reseñas), «publicados X/Y»
 * (Productos), los últimos pedidos (la tabla de Órdenes, por fecha) y el «Total
 * 30 días» del gráfico, que sumaba en el navegador lo mismo que «Ventas».
 */
export default function MarketplaceDashboard({ onIrA }: { onIrA?: (vista: string) => void }) {
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

  const slug = data?.store.slug ?? "";
  useAccionesDeVista(
    slug
      ? [{ id: "ver-tienda", label: "Ver mi tienda pública", hint: `/marketplace/${slug}, en otra pestaña`, icon: ExternalLink, onSelect: () => window.open(`/marketplace/${slug}`, "_blank", "noopener,noreferrer") }]
      : [],
  );

  const m = data?.month;
  const kpis = useKpisPlegables({
    claveMemoria: "marketplace-resumen",
    alto: "md",
    compactoEnMovil: true,
    abiertoPorDefecto: true,
    sinDatosAun: fetching && !data,
    resumen: m ? `${fmtMoney(m.revenue)} · ${plural(m.orders, "pedido", "pedidos")}` : undefined,
    tarjetas: data
      ? [
          <StatCard key="pedidos" density="compact" label="Pedidos" value={String(data.month.orders)} icon={ShoppingCart} subValue={`${data.week.orders} esta semana`} />,
          <StatCard
            key="ventas"
            density="compact"
            label="Ventas"
            value={fmtMoney(data.month.revenue)}
            icon={DollarSign}
            delta={data.month.revenueGrowth !== 0 ? data.month.revenueGrowth : null}
            deltaLabel="contra los 30 días anteriores"
            emphasis={data.month.revenue > 0 ? "success" : "neutral"}
          />,
          <StatCard key="ticket" density="compact" label="Ticket promedio" value={fmtMoney(data.month.avgTicket)} icon={TrendingUp} />,
          <StatCard key="hoy" density="compact" label="Hoy" value={fmtMoney(data.today.revenue)} icon={Calendar} subValue={plural(data.today.orders, "pedido", "pedidos")} />,
        ]
      : [],
  });

  if (fetching) return <DashboardSkeleton />;

  // Sin actividad real → empty-state honesto (nada de números inventados).
  const noActivity =
    !data ||
    (data.month.orders === 0 &&
      data.today.orders === 0 &&
      data.week.orders === 0 &&
      data.topProducts.length === 0);

  if (noActivity) {
    return (
      <ChartsEmptyState
        icon={Store}
        title="Tu tienda todavía no registra ventas en el marketplace"
        description="Cuando entren pedidos verás aquí tus ventas de los últimos 30 días, el ticket promedio y lo que más vendes."
      />
    );
  }

  // ── Datos reales del negocio ──────────────────────────────────────────────
  const daily = data.dailySales.map((d) => ({
    dia: formatDateShort(d.date),
    gmv: d.revenue,
    orders: d.orders,
  }));
  const maxGmv = Math.max(...daily.map((d) => d.gmv), 1);
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

  const pendientes: { vista: string; rotulo: string; Icon: typeof ShoppingCart }[] = [
    ...(data.pendingOrders > 0 ? [{ vista: "ordenes", rotulo: "Pedidos por confirmar", Icon: ShoppingCart }] : []),
    ...(data.products.lowStock > 0 ? [{ vista: "productos", rotulo: "Productos con stock bajo", Icon: AlertCircle }] : []),
    ...(data.pendingReviews > 0 ? [{ vista: "resenas", rotulo: "Reseñas por moderar", Icon: MessageSquare }] : []),
  ];

  return (
    <div className="space-y-4">
      {/* Una fila: título · ⓘ · Indicadores. El total de la ventana es «Ventas»: el
          gráfico ya no lo repite (lo sumaba en el navegador, de la misma ventana). */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex shrink-0 items-center gap-2">
          <SectionTitle className="whitespace-nowrap text-[var(--text-primary)]">Últimos 30 días</SectionTitle>
          <InfoTip
            title="Cómo te va en el marketplace"
            what="Sólo los pedidos que entraron a tu tienda por el marketplace, en los últimos 30 días contando hoy."
            affects="La calificación está en Reseñas, lo publicado en Productos y lo que cobra la plataforma en Comisiones: aquí no se repiten."
            example="Ventas S/ 3 120 con 41 pedidos = ticket promedio S/ 76."
          />
        </div>
        <div className="ml-auto flex min-w-0 items-center gap-2">{kpis.boton}</div>
      </div>
      {kpis.panel}

      {/* Lo que espera en otra vista: un enlace por cosa, la cifra vive allá. */}
      {pendientes.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-[var(--text-secondary)]">Para atender:</span>
          {pendientes.map(({ vista, rotulo, Icon }) => (
            <button
              key={vista}
              type="button"
              onClick={() => onIrA?.(vista)}
              className="inline-flex h-12 items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-sunken)]"
            >
              <Icon className="h-4 w-4 text-[var(--data-warning-ink)]" aria-hidden />
              {rotulo}
              <ArrowRight className="h-4 w-4 text-[var(--text-tertiary)]" aria-hidden />
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <ChartCard
            title="Tus ventas diarias"
            Icon={TrendingUp}
            height={260}
            description="Cuánto vendió tu tienda cada día en el marketplace (últimos 30 días)."
            isEmpty={isDailyEmpty}
            emptyText="Sin ventas registradas en los últimos 30 días"
          >
            <ResponsiveContainer initialDimension={{ width: 1, height: 1 }} width="100%" height="100%">
              <BarChart data={daily} margin={{ top: 28, right: 16, left: 0, bottom: 4 }} barCategoryGap="14%">
                <XAxis
                  dataKey="dia"
                  tick={{ fontSize: 12, fill: T.tickFill, fontWeight: 600 }}
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
                      style={{ fill: T.primary, fontSize: 12, fontWeight: 700 }}
                    />
                  )}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
        <div className="lg:col-span-2">
          <ChartCard
            title="Lo que más vendes"
            Icon={Package}
            height={260}
            description="Tus productos con más venta en el marketplace (últimos 30 días)."
            isEmpty={topProducts.length === 0}
            emptyText="Todavía no hay productos vendidos en los últimos 30 días"
          >
            <MicroList items={topProducts} barColor={T.brand} showRank />
          </ChartCard>
        </div>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4 animate-pulse" aria-busy="true" aria-label="Cargando el resumen">
      <div className="h-12 w-64 rounded-xl bg-[var(--surface-sunken)]" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="bg-[var(--surface-sunken)] rounded-xl h-24" />)}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="bg-[var(--surface-sunken)] rounded-xl h-[320px] lg:col-span-3" />
        <div className="bg-[var(--surface-sunken)] rounded-xl h-[320px] lg:col-span-2" />
      </div>
    </div>
  );
}
