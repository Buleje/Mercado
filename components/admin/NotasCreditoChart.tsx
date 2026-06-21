"use client";

/**
 * NotasCreditoChart — charts lazy de recharts para NotasCreditoModule.
 * Contiene: LineChart trend semanal + PieChart motivos + BarChart días.
 * Cargado con next/dynamic para excluir recharts del bundle inicial.
 */

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from "recharts";

interface TrendEntry {
  week: string;
  count: number;
}

interface DonutEntry {
  name: string;
  value: number;
  color: string;
}

interface WeekdayEntry {
  name: string;
  count: number;
}

interface NotasCreditoChartProps {
  trendData: TrendEntry[];
  donutData: DonutEntry[];
  weekdayData: WeekdayEntry[];
}

export default function NotasCreditoChart({
  trendData,
  donutData,
  weekdayData,
}: NotasCreditoChartProps) {
  // Gráficos sin datos NO se muestran. Si los 3 están vacíos, todo se oculta.
  const hasTrend = trendData.some((d) => d.count > 0);
  const hasDonut = donutData.length > 1;
  const hasWeekday = weekdayData.some((d) => d.count > 0);
  if (!hasTrend && !hasDonut && !hasWeekday) return null;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
      {/* Trend line — se oculta si no hay datos */}
      {hasTrend && (
      <div className="lg:col-span-2 bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl p-4">
        <p className="text-xs font-bold text-[var(--text-primary)] mb-2">
          NC por semana (últimos 3 meses)
        </p>
        <ResponsiveContainer minWidth={0} width="100%" height={130}>
          <LineChart data={trendData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="week" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
            <Line
              type="monotone"
              dataKey="count"
              stroke="var(--accent)"
              strokeWidth={2}
              dot={{ r: 3, fill: "var(--accent)" }}
            />
            <RechartsTooltip />
          </LineChart>
        </ResponsiveContainer>
      </div>
      )}

      {/* Donut + weekday — la columna se oculta si ambos están vacíos */}
      {(hasDonut || hasWeekday) && (
      <div className="flex flex-col gap-3">
        {hasDonut && (
          <div className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl p-4 flex-1">
            <p className="text-xs font-bold text-[var(--text-primary)] mb-1">Motivos del mes</p>
            <ResponsiveContainer minWidth={0} width="100%" height={80}>
              <PieChart>
                <Pie
                  data={donutData}
                  dataKey="value"
                  cx="50%"
                  cy="50%"
                  innerRadius={20}
                  outerRadius={36}
                  paddingAngle={2}
                >
                  {donutData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <RechartsTooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-0.5">
              {donutData.map((d, i) => (
                <div
                  key={i}
                  className="flex items-center gap-1.5 text-[length:var(--ts-2xs)] text-[var(--text-secondary)]"
                >
                  <div
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: d.color }}
                  />
                  <span className="truncate">
                    {d.name}: {d.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Días con más devoluciones — se oculta si no hay datos */}
        {hasWeekday && (
        <div className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl p-4 flex-1">
          <p className="text-xs font-bold text-[var(--text-primary)] mb-1">
            Días con más devoluciones
          </p>
          <ResponsiveContainer minWidth={0} width="100%" height={80}>
            <BarChart
              data={weekdayData}
              margin={{ top: 0, right: 0, bottom: 0, left: -20 }}
            >
              <XAxis dataKey="name" tick={{ fontSize: 9 }} />
              <YAxis tick={{ fontSize: 9 }} allowDecimals={false} />
              <Bar dataKey="count" fill="var(--accent)" radius={[3, 3, 0, 0]} />
              <RechartsTooltip />
            </BarChart>
          </ResponsiveContainer>
        </div>
        )}
      </div>
      )}
    </div>
  );
}
