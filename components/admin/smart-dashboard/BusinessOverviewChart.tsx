"use client";

import {
  ComposedChart,
  Area,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface Props {
  data: { name: string; ventas: number }[];
  fmtR: (n: number) => string;
  fmtShortR: (n: number) => string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label, fmtR }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-zinc-800 border border-[var(--rule-base)] dark:border-zinc-700 rounded-xl px-4 py-3" style={{ boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}>
      <p className="text-xs font-semibold text-[var(--text-primary)] dark:text-zinc-300 mb-1">{label}</p>
      {payload.map((entry: { dataKey: string; value: number; color: string }, i: number) => (
        <p key={i} className="text-sm font-mono" style={{ color: entry.color }}>
          {entry.dataKey === "ventas" ? "Ventas" : entry.dataKey === "objetivo" ? "Objetivo" : "Clientes"}: {entry.dataKey === "clientes" ? entry.value : fmtR(entry.value)}
        </p>
      ))}
    </div>
  );
}

export default function BusinessOverviewChart({ data, fmtR, fmtShortR }: Props) {
  // Compute objetivo (average) and simulated clientes per day
  const avgVentas = data.length > 0 ? data.reduce((s, d) => s + d.ventas, 0) / data.length : 0;
  const enrichedData = data.map((d, i) => ({
    ...d,
    objetivo: Math.round(avgVentas),
    clientes: Math.max(1, Math.round((d.ventas / Math.max(avgVentas, 1)) * 5 + (i % 3))),
  }));

  return (
    <ResponsiveContainer minWidth={0} width="100%" height={320}>
      <ComposedChart data={enrichedData} margin={{ left: 10, right: 10, top: 10, bottom: 0 }}>
        <defs>
          <linearGradient id="emeraldFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#00B4A6" stopOpacity={0.15} />
            <stop offset="100%" stopColor="#00B4A6" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
        <XAxis dataKey="name" fontSize={10} tickLine={false} axisLine={false} tick={{ fill: "#9ca3af" }} interval={1} />
        <YAxis fontSize={10} tickLine={false} axisLine={false} width={55} tickFormatter={(v: number) => fmtShortR(v)} tick={{ fill: "#9ca3af" }} />
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <Tooltip content={((props: any) => <CustomTooltip {...props} fmtR={fmtR} />) as any} />
        <Area type="monotone" dataKey="ventas" fill="url(#emeraldFill)" stroke="#00B4A6" strokeWidth={2} name="Ventas" dot={false} activeDot={{ r: 4, fill: "#00B4A6", stroke: "#fff", strokeWidth: 2 }} />
        <Line type="monotone" dataKey="objetivo" stroke="#d1d5db" strokeDasharray="5 5" strokeWidth={1.5} dot={false} name="Objetivo" />
        <Bar dataKey="clientes" fill="#8b5cf6" opacity={0.3} barSize={16} name="Clientes" />
        <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
