"use client";

/**
 * CRMTabChart — sub-componente lazy de recharts para CRMTab.
 * Separado para que next/dynamic lo cargue solo cuando hay datos de canal.
 * Impact: recharts (~850 KB) sale del bundle inicial del panel admin.
 */

import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";

interface ChartEntry {
  name: string;
  value: number;
}

interface CRMTabChartProps {
  data: ChartEntry[];
  colors: string[];
}

export default function CRMTabChart({ data, colors }: CRMTabChartProps) {
  // Guard: sin datos → no renderizar ejes vacíos (el padre decide qué mostrar)
  if (!data.length || data.every((d) => d.value === 0)) return null;

  return (
    <ResponsiveContainer minWidth={0} width="100%" height="100%">
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          cx="50%"
          cy="50%"
          outerRadius={45}
          innerRadius={20}
          strokeWidth={1}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={colors[i % colors.length]} />
          ))}
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  );
}
