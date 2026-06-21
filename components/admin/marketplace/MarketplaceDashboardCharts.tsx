"use client";

/**
 * MarketplaceDashboardCharts — subcomponente lazy-loaded.
 * Contiene los 2 charts recharts inline de MarketplaceDashboard:
 *   - Crecimiento de mi tienda (ComposedChart: Area + Line)
 *   - Pedidos por canal (BarChart + Cell)
 */

import {
  ResponsiveContainer,
  ComposedChart,
  BarChart,
  Bar,
  Area,
  Line,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import {
  CHART_TOKENS,
  ChartCard,
  ChartTooltip,
} from "@/components/admin/inicio/_shared";
import { TrendingUp, Smartphone } from "@buleje/design-system/icons";
import ChartsEmptyState from "@/components/admin/shared/ChartsEmptyState";

const T = CHART_TOKENS;

interface GrowthPoint {
  semana: string;
  visitas: number;
  pedidos: number;
}

interface ChannelPoint {
  name: string;
  value: number;
  color: string;
}

interface Props {
  myGrowth: GrowthPoint[];
  channelData: ChannelPoint[];
  presetRangeLabel: string;
}

export default function MarketplaceDashboardCharts({
  myGrowth,
  channelData,
  presetRangeLabel,
}: Props) {
  // Guard página completa: ambos arrays sin datos → empty-state unificado.
  const growthEmpty = myGrowth.length === 0 || myGrowth.every((p) => p.visitas === 0 && p.pedidos === 0);
  const channelEmpty = channelData.length === 0 || channelData.every((p) => p.value === 0);
  if (growthEmpty && channelEmpty) {
    return (
      <ChartsEmptyState
        icon={TrendingUp}
        title="Todavía no hay datos de crecimiento"
        description="Cuando tu tienda empiece a recibir visitas y pedidos, acá vas a ver la tendencia semanal y de dónde vienen tus compradores."
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <ChartCard
        title="Crecimiento de mi tienda"
        Icon={TrendingUp}
        height={300}
        subtitle="Visitas y pedidos por semana · últimas 8 semanas"
        isEmpty={growthEmpty}
        emptyText="Sin datos históricos"
      >
        <ResponsiveContainer minWidth={0} width="100%" height="100%">
          <ComposedChart
            data={myGrowth}
            margin={{ top: 12, right: 12, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id="visitsGradientMD" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={T.brand} stopOpacity={0.32} />
                <stop offset="100%" stopColor={T.brand} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="0"
              stroke={T.grid}
              vertical={false}
            />
            <XAxis
              dataKey="semana"
              tick={{
                fontSize: T.axisFontSize,
                fill: T.tickFill,
                fontWeight: T.axisFontWeight,
              }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              yAxisId="left"
              tick={{
                fontSize: T.axisFontSize,
                fill: T.tickFill,
                fontWeight: T.axisFontWeight,
              }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{
                fontSize: T.axisFontSize,
                fill: T.tickFill,
                fontWeight: T.axisFontWeight,
              }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<ChartTooltip />} />
            <Area
              yAxisId="left"
              type="monotone"
              dataKey="visitas"
              name="Visitas"
              stroke={T.brand}
              strokeWidth={2.5}
              fill="url(#visitsGradientMD)"
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="pedidos"
              name="Pedidos"
              stroke={T.primary}
              strokeWidth={3}
              dot={{ r: 4, fill: T.primary }}
              activeDot={{ r: 6 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        title="Pedidos por canal"
        Icon={Smartphone}
        height={300}
        subtitle={`${presetRangeLabel} · de dónde vienen tus compradores`}
        isEmpty={channelEmpty}
        emptyText="Sin pedidos en el período"
      >
        <ResponsiveContainer minWidth={0} width="100%" height="100%">
          <BarChart
            data={channelData}
            barCategoryGap="22%"
            margin={{ top: 12, right: 12, left: 0, bottom: 0 }}
          >
            <CartesianGrid
              strokeDasharray="0"
              stroke={T.grid}
              vertical={false}
            />
            <XAxis
              dataKey="name"
              tick={{
                fontSize: T.axisFontSize,
                fill: T.tickFill,
                fontWeight: T.axisFontWeight,
              }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{
                fontSize: T.axisFontSize,
                fill: T.tickFill,
                fontWeight: T.axisFontWeight,
              }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              content={<ChartTooltip />}
              cursor={{ fill: "var(--rule-soft)", opacity: 0.5 }}
            />
            <Bar
              dataKey="value"
              name="Pedidos"
              radius={[10, 10, 0, 0]}
              maxBarSize={56}
            >
              {channelData.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}
