"use client";

/**
 * TurnosChart — chart lazy de recharts para TurnosModule.
 * Contiene: BarChart de ventas por cajero (este mes).
 * Cargado con next/dynamic para excluir recharts del bundle inicial.
 */

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { BarChart3 } from "@buleje/design-system/icons";

interface ChartEntry {
  name: string;
  ventas: number;
}

interface TurnosChartProps {
  chartData: ChartEntry[];
}

export default function TurnosChart({ chartData }: TurnosChartProps) {
  if (!chartData.some((d) => d.ventas > 0)) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-[var(--text-tertiary)] gap-2">
        <BarChart3 className="h-10 w-10 opacity-40" />
        <p className="text-base font-semibold">Sin ventas este mes</p>
        <p className="text-sm">
          El gráfico se muestra cuando haya ventas registradas
        </p>
      </div>
    );
  }

  return (
    <ResponsiveContainer minWidth={0} width="100%" height={250}>
      <BarChart
        data={chartData}
        layout="vertical"
        margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis
          type="number"
          tick={{ fontSize: 12 }}
          tickFormatter={(v: number) => `S/${v}`}
        />
        <YAxis
          type="category"
          dataKey="name"
          tick={{ fontSize: 12 }}
          width={90}
        />
        <Tooltip
          formatter={(value: unknown) => [
            `S/${Number(value).toLocaleString("es-PE")}`,
            "Ventas",
          ]}
        />
        <Bar dataKey="ventas" fill="var(--accent)" radius={[0, 6, 6, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
