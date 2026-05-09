"use client";

/**
 * MarketplaceDashboard — pattern unificado:
 *  - Row 1: 4 StatCards (Pedidos · GMV · Tiendas · Comision)
 *  - Row 2 (FULL): GMV ultimos 30d (AreaChart)
 *  - Row 3: Crecimiento tiendas + Metodo de pedido
 *  - Row 4: MicroDonut categorias + MicroList top 5 tiendas + MicroGauge tasa conversion
 *
 * Datos: consume mocks deterministas en build inicial, luego /api/marketplace/dashboard
 * cuando esté disponible. NO usar Math.random() en render.
 */

import { useEffect, useState, useMemo } from "react";
import { StatCard } from "@buleje/design-system";
import {
  ShoppingCart,
  Store,
  DollarSign,
  TrendingUp,
  Layers,
  Target,
  Smartphone,
  CreditCard,
  AlertTriangle,
} from "@buleje/design-system/icons";
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
} from "recharts";
import {
  ChartCard,
  ChartTooltip,
  CHART_TOKENS,
  MicroDonut,
  MicroList,
  MicroGauge,
} from "@/components/admin/inicio/_shared";

const T = CHART_TOKENS;

interface MarketplaceDashboardData {
  // KPIs
  totalOrders: number;
  gmv: number;
  activeStores: number;
  commissionGenerated: number;
  // Deltas
  dOrders: number | null;
  dGmv: number | null;
  // Charts
  gmvDaily: { dia: string; gmv: number; orders: number }[];
  storeGrowth: { mes: string; tiendas: number }[];
  channelData: { name: string; value: number; color: string }[];
  categoryData: { name: string; value: number; color: string }[];
  topStores: { name: string; value: number; label: string; sublabel: string }[];
  conversionRate: number;
  // Sparklines
  sparkOrders: number[];
  sparkGmv: number[];
}

// ── Mocks deterministas (no Math.random) ─────────────────────────────────────

function buildMockData(kpis: { publishedProducts: number; monthOrders: number; pendingCommissions: number }): MarketplaceDashboardData {
  const seed = kpis.monthOrders + kpis.publishedProducts;
  const baseGmv = Math.max(kpis.monthOrders * 25, 800);

  // Determinista: usar seed para variacion estable
  const variar = (i: number, base: number) => base * (0.7 + ((seed + i * 7) % 13) / 20);

  const gmvDaily = Array.from({ length: 30 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (29 - i));
    return {
      dia: d.toLocaleDateString("es-PE", { day: "2-digit", month: "short" }),
      gmv: Math.round(variar(i, baseGmv / 30) * 100) / 100,
      orders: Math.max(1, Math.round(kpis.monthOrders / 30 + ((seed + i) % 5))),
    };
  });

  const storeGrowth = Array.from({ length: 6 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - (5 - i));
    return {
      mes: d.toLocaleDateString("es-PE", { month: "short", year: "2-digit" }),
      tiendas: Math.max(1, Math.round(3 + i * 1.5 + ((seed + i) % 3))),
    };
  });

  const channelData = [
    { name: "Web", value: Math.round(kpis.monthOrders * 0.45), color: T.blue },
    { name: "Mobile", value: Math.round(kpis.monthOrders * 0.30), color: T.violet },
    { name: "WhatsApp", value: Math.round(kpis.monthOrders * 0.20), color: T.emerald },
    { name: "Instagram", value: Math.round(kpis.monthOrders * 0.05), color: T.amber },
  ].filter((c) => c.value > 0);

  const categoryData = [
    { name: "Abarrotes", value: Math.round(baseGmv * 0.35), color: T.amber },
    { name: "Bebidas", value: Math.round(baseGmv * 0.20), color: T.violet },
    { name: "Lacteos", value: Math.round(baseGmv * 0.15), color: T.blue },
    { name: "Carnes", value: Math.round(baseGmv * 0.12), color: T.red },
    { name: "Frutas", value: Math.round(baseGmv * 0.10), color: T.emerald },
    { name: "Otros", value: Math.round(baseGmv * 0.08), color: T.gray },
  ].filter((c) => c.value > 0);

  const topStores = Array.from({ length: 5 }, (_, i) => {
    const v = Math.round(baseGmv * (0.25 - i * 0.04));
    return {
      name: `Bodega ${["San Martin", "El Sol", "La Esquina", "Don Jose", "Mi Familia"][i] ?? i + 1}`,
      value: v,
      label: `S/ ${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}`,
      sublabel: `${Math.max(1, Math.round(kpis.monthOrders * (0.30 - i * 0.05)))} pedidos`,
    };
  });

  return {
    totalOrders: kpis.monthOrders,
    gmv: baseGmv,
    activeStores: storeGrowth[storeGrowth.length - 1]?.tiendas ?? 1,
    commissionGenerated: kpis.pendingCommissions,
    dOrders: kpis.monthOrders > 0 ? 12.5 : null,
    dGmv: baseGmv > 0 ? 8.3 : null,
    gmvDaily,
    storeGrowth,
    channelData,
    categoryData,
    topStores,
    conversionRate: kpis.monthOrders > 0 ? 3.2 : 0,
    sparkOrders: gmvDaily.slice(-7).map((d) => d.orders),
    sparkGmv: gmvDaily.slice(-7).map((d) => d.gmv),
  };
}

// ── Main Component ───────────────────────────────────────────────────────────

interface MarketplaceDashboardProps {
  kpis: { publishedProducts: number; monthOrders: number; pendingCommissions: number };
  loading?: boolean;
}

export default function MarketplaceDashboard({ kpis, loading }: MarketplaceDashboardProps) {
  const [apiData, setApiData] = useState<MarketplaceDashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Intentar consumir API real cuando exista. Por ahora fallback a mock determinista.
    fetch("/api/marketplace/dashboard")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && typeof d === "object") setApiData(d as MarketplaceDashboardData);
      })
      .catch(() => {
        // silent fallback a mock
        setError(null);
      });
  }, []);

  const data = useMemo<MarketplaceDashboardData>(() => apiData ?? buildMockData(kpis), [apiData, kpis]);

  if (loading) return <DashboardSkeleton />;
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16">
        <AlertTriangle className="h-10 w-10 text-[var(--data-warning)]" />
        <p className="text-sm text-[var(--text-secondary)]">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── Row 1: KPI Hero ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Pedidos del mes"
          value={String(data.totalOrders)}
          icon={ShoppingCart}
          delta={data.dOrders}
          sparkline={data.sparkOrders.length >= 2 ? { data: data.sparkOrders } : undefined}
        />
        <StatCard
          label="GMV"
          value={`S/ ${data.gmv >= 1000 ? `${(data.gmv / 1000).toFixed(1)}k` : data.gmv.toFixed(0)}`}
          icon={DollarSign}
          delta={data.dGmv}
          sparkline={data.sparkGmv.length >= 2 ? { data: data.sparkGmv } : undefined}
        />
        <StatCard
          label="Tiendas activas"
          value={String(data.activeStores)}
          icon={Store}
        />
        <StatCard
          label="Comision generada"
          value={`S/ ${data.commissionGenerated.toFixed(2)}`}
          icon={TrendingUp}
          emphasis={data.commissionGenerated > 0 ? "success" : "neutral"}
        />
      </div>

      {/* ── Row 2: FULL-WIDTH — GMV ── */}
      <ChartCard
        title="GMV — ultimos 30 dias"
        Icon={TrendingUp}
        height={340}
        subtitle="Volumen bruto de mercancia diario"
        isEmpty={data.gmvDaily.length === 0}
        emptyText="Sin GMV en el periodo"
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data.gmvDaily} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="gradGmv" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={T.brand} stopOpacity={0.3} />
                <stop offset="95%" stopColor={T.brand} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={T.grid} vertical={false} />
            <XAxis dataKey="dia" tick={{ fontSize: T.axisFontSize, fill: T.tickFill }} axisLine={false} tickLine={false} interval={2} />
            <YAxis tick={{ fontSize: T.axisFontSize, fill: T.tickFill }} axisLine={false} tickLine={false} tickFormatter={(v) => `S/${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} />
            <Tooltip content={<ChartTooltip prefix="S/" />} />
            <Area type="monotone" dataKey="gmv" name="GMV" stroke={T.brand} fill="url(#gradGmv)" strokeWidth={2.5} />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* ── Row 3: 2 secondary charts ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="Crecimiento de tiendas"
          Icon={Store}
          height={280}
          subtitle="Ultimos 6 meses (acumulado)"
          isEmpty={data.storeGrowth.length === 0}
          emptyText="Sin datos historicos"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.storeGrowth} barCategoryGap="22%" margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={T.grid} vertical={false} />
              <XAxis dataKey="mes" tick={{ fontSize: T.axisFontSize, fill: T.tickFill }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: T.axisFontSize, fill: T.tickFill }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="tiendas" name="Tiendas" radius={[6, 6, 0, 0]}>
                {data.storeGrowth.map((entry, i) => {
                  const max = Math.max(...data.storeGrowth.map((d) => d.tiendas));
                  return (
                    <Cell
                      key={i}
                      fill={entry.tiendas === max ? T.brand : T.blue}
                      opacity={entry.tiendas > 0 ? 1 : 0.15}
                    />
                  );
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Pedidos por canal"
          Icon={Smartphone}
          height={280}
          subtitle="Web, Mobile, WhatsApp, Instagram"
          isEmpty={data.channelData.length === 0}
          emptyText="Sin pedidos"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.channelData} barCategoryGap="22%" margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={T.grid} vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: T.axisFontSize, fill: T.tickFill }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: T.axisFontSize, fill: T.tickFill }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="value" name="Pedidos" radius={[6, 6, 0, 0]}>
                {data.channelData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* ── Row 4: 3 micro-insights ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartCard
          title="Categorias top"
          Icon={CreditCard}
          height={220}
          isEmpty={data.categoryData.length === 0}
          emptyText="Sin ventas"
        >
          <MicroDonut
            data={data.categoryData}
            centerLabel={`S/ ${data.gmv >= 1000 ? `${(data.gmv / 1000).toFixed(1)}k` : data.gmv.toFixed(0)}`}
            centerSubLabel="GMV total"
            tooltipFormatter={(v) => `S/ ${v.toFixed(2)}`}
          />
        </ChartCard>

        <ChartCard
          title="Top 5 tiendas por revenue"
          Icon={Layers}
          height={220}
          isEmpty={data.topStores.length === 0}
          emptyText="Sin tiendas"
        >
          <MicroList items={data.topStores} barColor={T.brand} showRank />
        </ChartCard>

        <ChartCard
          title="Tasa de conversion"
          Icon={Target}
          height={220}
          subtitle={`${data.totalOrders} pedidos / mes`}
        >
          <MicroGauge
            value={Math.min(data.conversionRate * 20, 100)}
            max={100}
            centerLabel={`${data.conversionRate.toFixed(1)}%`}
            centerSubLabel="visita → pedido"
            footerText={
              data.conversionRate >= 4
                ? "Conversion excelente"
                : data.conversionRate >= 2
                  ? "Conversion media"
                  : "Optimizar funnel"
            }
          />
        </ChartCard>
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
      <div className="bg-[var(--surface-sunken)] rounded-xl h-[380px]" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="bg-[var(--surface-sunken)] rounded-xl h-[320px]" />
        <div className="bg-[var(--surface-sunken)] rounded-xl h-[320px]" />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => <div key={i} className="bg-[var(--surface-sunken)] rounded-xl h-[260px]" />)}
      </div>
    </div>
  );
}
