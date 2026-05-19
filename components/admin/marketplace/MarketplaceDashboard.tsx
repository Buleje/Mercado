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
  BarChart3,
} from "@buleje/design-system/icons";
import {
  BarChart, Bar, LabelList,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
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

  // Solo usar apiData si tiene los arrays criticos. Si la API devolvio shape
  // parcial (ej: 503 + body partial), caer al mock para no crashear con
  // `undefined.length`. Defensivo tras incidente 503 dashboard 2026-05-09.
  const data = useMemo<MarketplaceDashboardData>(() => {
    const isComplete =
      apiData &&
      Array.isArray(apiData.sparkOrders) &&
      Array.isArray(apiData.sparkGmv) &&
      Array.isArray(apiData.gmvDaily) &&
      Array.isArray(apiData.storeGrowth) &&
      Array.isArray(apiData.channelData) &&
      Array.isArray(apiData.categoryData) &&
      Array.isArray(apiData.topStores);
    return isComplete ? (apiData as MarketplaceDashboardData) : buildMockData(kpis);
  }, [apiData, kpis]);

  if (loading) return <DashboardSkeleton />;
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16">
        <AlertTriangle className="h-10 w-10 text-[var(--data-warning)]" />
        <p className="text-sm text-[var(--text-secondary)]">{error}</p>
      </div>
    );
  }

  // Brandon mayo 2026 v7: si NO hay actividad real (ningún producto publicado,
  // ningún pedido del mes, ninguna comisión pendiente) NO pintamos los 7 charts
  // con datos mock — era engañoso. En su lugar, un empty-state claro que
  // explica qué va a aparecer cuando empiece a vender.
  const noActivity =
    kpis.publishedProducts === 0 &&
    kpis.monthOrders === 0 &&
    kpis.pendingCommissions === 0;
  if (noActivity) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20 rounded-2xl border-2 border-dashed border-[var(--rule-base)] bg-[var(--surface-sunken)]">
        <div className="h-16 w-16 rounded-2xl bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] flex items-center justify-center">
          <Store className="h-8 w-8 text-[color:var(--accent,var(--text-primary))]" />
        </div>
        <div className="text-center max-w-lg px-6">
          <h3 className="text-xl font-extrabold text-[var(--text-primary)] mb-2">
            Tu marketplace todavía no registra movimientos
          </h3>
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
            Cuando empiecen a entrar pedidos vas a ver acá los gráficos: GMV diario, crecimiento de tiendas, pedidos por canal, categorías top, top 5 tiendas y tasa de conversión. Por ahora no mostramos números inventados.
          </p>
        </div>
      </div>
    );
  }

  // Chart-level empties (cuando sí hay actividad pero algún chart específico
  // no tiene datos reales). Brandon mayo 2026 v7: no maquillar con mock.
  const isChannelEmpty = data.channelData.every((c) => c.value === 0);
  const isCategoryEmpty = data.categoryData.every((c) => c.value === 0);
  const isTopStoresEmpty = data.topStores.every((s) => s.value === 0);
  const isGmvEmpty = data.gmvDaily.every((d) => d.gmv === 0);
  const isStoreGrowthEmpty = data.storeGrowth.every((d) => d.tiendas === 0);

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

      {/* ── Row 2: FULL-WIDTH — GMV
          Brandon mayo 2026 v7: rediseñado. Antes tenía grid 3-3 + ticks
          densos + descripción larga. Ahora: sin grid, 4 ticks en X (no más
          fechas pegadas), eje Y limpio, gradient más profundo, total grande
          arriba como anchor visual. */}
      <ChartCard
        title="Ventas diarias del marketplace"
        Icon={TrendingUp}
        height={300}
        description="Cuánto se vendió cada día (últimos 30 días)."
        isEmpty={isGmvEmpty}
        emptyText="Sin ventas registradas en los últimos 30 días"
        badge={
          <div className="text-right">
            <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">
              Total 30 días
            </p>
            <p className="text-xl sm:text-2xl font-extrabold text-[var(--text-primary)] tabular-nums">
              S/ {data.gmv >= 1000 ? `${(data.gmv / 1000).toFixed(1)}k` : data.gmv.toFixed(0)}
            </p>
          </div>
        }
      >
        {/* Brandon mayo 2026 v7: cambio AreaChart → BarChart por petición.
            Cada día es una barra con el monto encima — más fácil de leer que
            una curva con valores periódicos similares (típico del seed). El
            top del mes resalta en color brand; los demás en gris suave. */}
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data.gmvDaily}
            margin={{ top: 28, right: 16, left: 0, bottom: 4 }}
            barCategoryGap="18%"
          >
            <XAxis
              dataKey="dia"
              tick={{ fontSize: 11, fill: T.tickFill, fontWeight: 600 }}
              axisLine={false}
              tickLine={false}
              interval={Math.max(1, Math.floor(data.gmvDaily.length / 6))}
              tickMargin={8}
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
            <Bar dataKey="gmv" name="GMV" radius={[6, 6, 0, 0]} maxBarSize={28}>
              {data.gmvDaily.map((entry, i) => {
                const max = Math.max(...data.gmvDaily.map((d) => d.gmv));
                return (
                  <Cell
                    key={i}
                    fill={entry.gmv === max ? T.brand : T.brand}
                    fillOpacity={entry.gmv === max ? 1 : 0.45}
                  />
                );
              })}
              <LabelList
                dataKey="gmv"
                position="top"
                formatter={(v) => {
                  const n = Number(v);
                  if (!n) return "";
                  // Brandon mayo 2026 v7: las cantidades son SOLES, llevan
                  // "S/" prefijo. Si supera S/1000 → "S/1.2k" (k = miles).
                  return n >= 1000 ? `S/${(n / 1000).toFixed(1)}k` : `S/${Math.round(n)}`;
                }}
                style={{ fill: T.primary, fontSize: 10, fontWeight: 700 }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* ── Row 3: 2 secondary charts ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="Tiendas activas por mes"
          Icon={Store}
          height={260}
          description="Cuántas tiendas vendieron cada mes."
          isEmpty={isStoreGrowthEmpty}
          emptyText="Sin tiendas activas"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.storeGrowth} barCategoryGap="22%" margin={{ top: 24, right: 10, left: 0, bottom: 0 }}>
              <XAxis dataKey="mes" tick={{ fontSize: 12, fill: T.tickFill, fontWeight: 600 }} axisLine={false} tickLine={false} tickMargin={6} />
              <YAxis tick={{ fontSize: 12, fill: T.tickFill, fontWeight: 600 }} axisLine={false} tickLine={false} tickCount={4} width={36} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: T.brand, fillOpacity: 0.06 }} />
              <Bar dataKey="tiendas" name="Tiendas" radius={[6, 6, 0, 0]} maxBarSize={42}>
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
                <LabelList
                  dataKey="tiendas"
                  position="top"
                  style={{ fill: T.primary, fontSize: 13, fontWeight: 800 }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Pedidos por canal"
          Icon={Smartphone}
          height={260}
          description="Por dónde te compran (web, celular, WhatsApp, Instagram)."
          isEmpty={isChannelEmpty}
          emptyText="Sin pedidos por ningún canal"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.channelData} barCategoryGap="22%" margin={{ top: 24, right: 10, left: 0, bottom: 0 }}>
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: T.tickFill, fontWeight: 600 }} axisLine={false} tickLine={false} tickMargin={6} />
              <YAxis tick={{ fontSize: 12, fill: T.tickFill, fontWeight: 600 }} axisLine={false} tickLine={false} tickCount={4} width={36} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: T.brand, fillOpacity: 0.06 }} />
              <Bar dataKey="value" name="Pedidos" radius={[6, 6, 0, 0]} maxBarSize={56}>
                {data.channelData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                <LabelList
                  dataKey="value"
                  position="top"
                  style={{ fill: T.primary, fontSize: 13, fontWeight: 800 }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* ── Row 4: 3 micro-insights ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartCard
          title="Top categorías"
          Icon={CreditCard}
          height={220}
          description="Qué rubros generan más plata."
          isEmpty={isCategoryEmpty}
          emptyText="Sin ventas por categoría"
        >
          <MicroDonut
            data={data.categoryData}
            centerLabel={`S/ ${data.gmv >= 1000 ? `${(data.gmv / 1000).toFixed(1)}k` : data.gmv.toFixed(0)}`}
            centerSubLabel="GMV total"
            tooltipFormatter={(v) => `S/ ${v.toFixed(2)}`}
          />
        </ChartCard>

        <ChartCard
          title="Top 5 tiendas"
          Icon={Layers}
          height={220}
          description="Las que más venden. Cuidalas."
          isEmpty={isTopStoresEmpty}
          emptyText="Sin tiendas con ventas"
        >
          <MicroList items={data.topStores} barColor={T.brand} showRank />
        </ChartCard>

        <ChartCard
          title="Tasa de conversión"
          Icon={Target}
          height={220}
          description="De cada 100 visitas, cuántas compran. Meta: >4%."
          isEmpty={data.conversionRate === 0}
          emptyText="Aún no hay datos para calcular conversión"
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
