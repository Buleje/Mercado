"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

type MesRow = { mes: string; total: number };

interface Props {
  data: MesRow[];
}

export default function DevolucionesChart({ data }: Props) {
  if (data.length === 0) return null;

  return (
    <ResponsiveContainer minWidth={0} width="100%" height={180}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
        <Tooltip
          formatter={(val) => {
            const n = Number(val);
            return [`${n} devoluci${n === 1 ? "ón" : "ones"}`, ""] as [string, string];
          }}
          contentStyle={{ fontSize: 12, borderRadius: 8 }}
        />
        <Bar dataKey="total" fill="var(--accent)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
