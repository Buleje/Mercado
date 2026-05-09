"use client";

/**
 * ExecutiveAnalyticsCharts — subcomponente lazy-loaded.
 * Contiene los 2 charts recharts de ExecutiveAnalytics:
 *   - MRR por plan (PieChart / donut)
 *   - AOV trend (ComposedChart: Bar + Line)
 */

import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

const fmtSoles = (n: number) =>
  new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
    maximumFractionDigits: 0,
  }).format(n);

const PLAN_COLORS: Record<string, string> = {
  free: "#94A3B8",
  pro: "#F59E0B",
  business: "#0EA5E9",
  enterprise: "#10B981",
};

interface MRREntry {
  plan: string;
  count: number;
  mrr: number;
}

interface AOVEntry {
  month: string;
  aov: number;
  orders: number;
}

interface Props {
  mrrByPlan: MRREntry[];
  aov: AOVEntry[];
  aovDeltaPct: number;
}

export default function ExecutiveAnalyticsCharts({ mrrByPlan, aov }: Props) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* MRR por plan — donut */}
      <div className="h-56">
        <ResponsiveContainer minWidth={0} width="100%" height="100%">
          <PieChart>
            <Pie
              data={mrrByPlan.filter((p) => p.mrr > 0)}
              dataKey="mrr"
              nameKey="plan"
              cx="50%"
              cy="50%"
              outerRadius={80}
              innerRadius={50}
              paddingAngle={2}
            >
              {mrrByPlan
                .filter((p) => p.mrr > 0)
                .map((p) => (
                  <Cell key={p.plan} fill={PLAN_COLORS[p.plan] ?? "#94A3B8"} />
                ))}
            </Pie>
            <Tooltip
              formatter={(value, name) => [fmtSoles(Number(value)), String(name)]}
              contentStyle={{
                backgroundColor: "var(--surface-raised)",
                border: "1px solid var(--rule-base)",
                borderRadius: "8px",
                fontSize: 14,
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* AOV trend — ComposedChart */}
      <div className="h-56">
        <ResponsiveContainer minWidth={0} width="100%" height="100%">
          <ComposedChart data={aov} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--rule-soft)" vertical={false} />
            <XAxis
              dataKey="month"
              tick={{ fontSize: 13, fill: "var(--text-secondary)" }}
              tickMargin={6}
            />
            <YAxis
              yAxisId="aov"
              tick={{ fontSize: 12, fill: "var(--text-tertiary)" }}
              width={48}
              tickFormatter={(v: number) => `S/${v}`}
            />
            <YAxis
              yAxisId="orders"
              orientation="right"
              tick={{ fontSize: 12, fill: "var(--text-tertiary)" }}
              width={32}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--surface-raised)",
                border: "1px solid var(--rule-base)",
                borderRadius: "8px",
                fontSize: 14,
              }}
              formatter={(v, name) =>
                String(name) === "aov"
                  ? [fmtSoles(Number(v)), "AOV"]
                  : [String(v), "Pedidos"]
              }
            />
            <Bar
              yAxisId="aov"
              dataKey="aov"
              fill="var(--accent)"
              radius={[6, 6, 0, 0]}
              maxBarSize={36}
            />
            <Line
              yAxisId="orders"
              type="monotone"
              dataKey="orders"
              stroke="#F59E0B"
              strokeWidth={2.5}
              dot={{ r: 3, fill: "#F59E0B", strokeWidth: 0 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
