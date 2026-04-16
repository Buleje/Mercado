"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface MonthlyDailyDatum {
  name: string;
  ventas: number;
}

interface Props {
  data: MonthlyDailyDatum[];
  fmtShort: (n: number) => string;
  fmt: (n: number) => string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomAreaTooltip({ active, payload, label, fmt }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg shadow-lg px-3 py-2">
      <p className="text-xs font-semibold text-gray-700 dark:text-zinc-300">{label}</p>
      <p className="text-sm font-bold font-mono text-primary">{fmt(Number(payload[0].value))}</p>
    </div>
  );
}

export default function MonthlySalesAreaChart({ data, fmtShort, fmt }: Props) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data} margin={{ left: 10, right: 10, top: 10, bottom: 0 }}>
        <defs>
          <linearGradient id="colorVentas" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.3} />
            <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" strokeOpacity={0.5} vertical={false} />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 10, fill: "#9ca3af" }}
          axisLine={false}
          tickLine={false}
          interval={1}
        />
        <YAxis
          tick={{ fontSize: 10, fill: "#9ca3af" }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) => fmtShort(v)}
          width={50}
        />
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <Tooltip content={((props: any) => <CustomAreaTooltip {...props} fmt={fmt} />) as any} />
        <Area
          type="monotone"
          dataKey="ventas"
          stroke="var(--color-primary)"
          strokeWidth={2}
          fill="url(#colorVentas)"
          dot={{ r: 3, fill: "var(--color-primary)", strokeWidth: 0 }}
          activeDot={{ r: 5, fill: "var(--color-primary)", stroke: "#fff", strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
