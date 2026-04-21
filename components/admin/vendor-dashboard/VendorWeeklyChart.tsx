"use client";

import { CardTitle } from "@buleje/design-system";
import type { WeeklyRevenueDay } from "./vendor-dashboard.types";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { TrendingUp } from "@buleje/design-system/icons";

type Props = {
  data: WeeklyRevenueDay[];
};

const DAY_LABELS: Record<string, string> = {
  "0": "Dom", "1": "Lun", "2": "Mar", "3": "Mié",
  "4": "Jue", "5": "Vie", "6": "Sáb",
};

function formatDayLabel(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return DAY_LABELS[String(d.getDay())] ?? dateStr.slice(5);
}

function formatSolesTooltip(value: number): string {
  return `S/ ${value.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

type TooltipPayloadEntry = { value: number };

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl px-3 py-2 text-xs">
      <p className="font-semibold text-[var(--text-primary)] dark:text-foreground">{label}</p>
      <p className="text-primary font-bold">{formatSolesTooltip(payload[0].value)}</p>
    </div>
  );
}

export function VendorWeeklyChart({ data }: Props) {
  if (!data || data.length === 0) return null;

  const maxIdx = data.reduce((best, d, i) => (d.total > data[best].total ? i : best), 0);

  const chartData = data.map((d, i) => ({
    day: formatDayLabel(d.date),
    total: d.total,
    isMax: i === maxIdx,
    isToday: i === data.length - 1,
  }));

  const weekTotal = data.reduce((s, d) => s + d.total, 0);

  return (
    <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-6 ">
      <div className="flex items-center justify-between mb-1">
        <CardTitle className="font-bold text-[var(--text-primary)] dark:text-foreground flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          Ingresos — últimos 7 días
        </CardTitle>
        <span className="text-sm font-extrabold text-primary">
          S/ {weekTotal.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
        </span>
      </div>
      <p className="text-xs text-[var(--text-tertiary)] dark:text-muted mb-4">Solo pedidos entregados</p>

      <ResponsiveContainer minWidth={0} width="100%" height={140}>
        <BarChart data={chartData} barCategoryGap="30%">
          <XAxis
            dataKey="day"
            tick={{ fontSize: 11, fill: "currentColor" }}
            axisLine={false}
            tickLine={false}
            className="text-[var(--text-secondary)] dark:text-muted"
          />
          <YAxis hide />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(0,180,166,0.06)" }} />
          <Bar dataKey="total" radius={[6, 6, 0, 0]}>
            {chartData.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={entry.isToday ? "#00B4A6" : entry.isMax ? "#f97316" : "#d1fae5"}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <div className="flex gap-4 mt-3 text-xs text-[var(--text-secondary)] dark:text-muted">
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-primary inline-block" /> Hoy
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-[var(--data-warning)] inline-block" /> Mejor día
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] inline-block" /> Otros días
        </span>
      </div>
    </div>
  );
}
