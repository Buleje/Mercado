"use client";

import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  LineChart,
  Line,
  ComposedChart,
  Legend,
} from "recharts";

const PIE_COLORS = [
  "var(--color-primary)",
  "#f97316",
  "#264653",
  "#e76f51",
  "#2a9d8f",
  "#e9c46a",
  "#606c38",
  "#bc6c25",
];
const PAYMENT_COLORS: Record<string, string> = {
  efectivo: "var(--color-primary)",
  yape: "#6d28d9",
  plin: "#3B82F6",
  tarjeta: "var(--color-primary)",
  transferencia: "#f59e0b",
};

export type ChartType =
  | "ventas-categoria"
  | "metodo-pago"
  | "top-10"
  | "ventas-hora"
  | "tendencia-semanal"
  | "flujo-caja";

interface NameValue {
  name: string;
  value: number;
}

interface TopChartItem {
  name: string;
  qty: number;
  revenue: number;
}

interface VentasHoraDatum {
  name: string;
  ventas: number;
}

interface TendenciaSemanalDatum {
  name: string;
  ventas: number;
}

interface FlujoCajaDatum {
  name: string;
  ingresos: number;
  egresos: number;
}

interface Props {
  chartId: ChartType;
  chartVentasCategoria: NameValue[];
  chartMetodoPago: NameValue[];
  chartTop10: TopChartItem[];
  chartVentasHora: VentasHoraDatum[];
  chartTendenciaSemanal: TendenciaSemanalDatum[];
  chartFlujoCaja: FlujoCajaDatum[];
  fmt: (n: number) => string;
  fmtShort: (n: number) => string;
}

export default function DashboardCharts({
  chartId,
  chartVentasCategoria,
  chartMetodoPago,
  chartTop10,
  chartVentasHora,
  chartTendenciaSemanal,
  chartFlujoCaja,
  fmt,
  fmtShort,
}: Props) {
  switch (chartId) {
    case "ventas-categoria":
      return chartVentasCategoria.length > 0 ? (
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <Pie data={chartVentasCategoria} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={(({ name, percent }: any) => `${name} ${(Number(percent) * 100).toFixed(0)}%`) as any} labelLine={false} fontSize={10}>
              {chartVentasCategoria.map((_, index) => (
                <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
              ))}
            </Pie>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <Tooltip formatter={((value: any) => fmt(Number(value))) as any} />
          </PieChart>
        </ResponsiveContainer>
      ) : (
        <p className="text-xs text-gray-400 text-center py-8">Sin datos de categorias</p>
      );

    case "metodo-pago":
      return chartMetodoPago.length > 0 ? (
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <Pie data={chartMetodoPago} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={(({ name, percent }: any) => `${name} ${(Number(percent) * 100).toFixed(0)}%`) as any} labelLine={false} fontSize={10}>
              {chartMetodoPago.map((entry, index) => (
                <Cell key={index} fill={PAYMENT_COLORS[entry.name] ?? PIE_COLORS[index % PIE_COLORS.length]} />
              ))}
            </Pie>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <Tooltip formatter={((value: any) => fmt(Number(value))) as any} />
          </PieChart>
        </ResponsiveContainer>
      ) : (
        <p className="text-xs text-gray-400 text-center py-8">Sin datos de pago</p>
      );

    case "top-10":
      return chartTop10.length > 0 ? (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartTop10} layout="vertical" margin={{ left: 60, right: 20, top: 5, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis type="number" fontSize={10} />
            <YAxis type="category" dataKey="name" fontSize={9} width={55} />
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <Tooltip formatter={((value: any, name: any) => String(name) === "qty" ? `${value} uds` : fmt(Number(value))) as any} />
            <Bar dataKey="qty" fill="var(--color-primary)" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <p className="text-xs text-gray-400 text-center py-8">Sin datos de productos</p>
      );

    case "ventas-hora":
      return (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartVentasHora} margin={{ left: 10, right: 10, top: 5, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="name" fontSize={9} />
            <YAxis fontSize={10} tickFormatter={(v: number) => fmtShort(v)} />
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <Tooltip formatter={((value: any) => fmt(Number(value))) as any} />
            <Bar dataKey="ventas" fill="#f97316" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      );

    case "tendencia-semanal":
      return (
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={chartTendenciaSemanal} margin={{ left: 10, right: 10, top: 5, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="name" fontSize={10} />
            <YAxis fontSize={10} tickFormatter={(v: number) => fmtShort(v)} />
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <Tooltip formatter={((value: any) => fmt(Number(value))) as any} />
            <Line type="monotone" dataKey="ventas" stroke="var(--color-primary)" strokeWidth={2} dot={{ r: 4, fill: "var(--color-primary)" }} />
          </LineChart>
        </ResponsiveContainer>
      );

    case "flujo-caja":
      return (
        <ResponsiveContainer width="100%" height={200}>
          <ComposedChart data={chartFlujoCaja} margin={{ left: 10, right: 10, top: 5, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="name" fontSize={10} />
            <YAxis fontSize={10} tickFormatter={(v: number) => fmtShort(v)} />
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <Tooltip formatter={((value: any) => fmt(Number(value))) as any} />
            <Legend fontSize={10} />
            <Bar dataKey="ingresos" fill="var(--color-primary)" radius={[4, 4, 0, 0]} name="Ingresos" />
            <Bar dataKey="egresos" fill="#e76f51" radius={[4, 4, 0, 0]} name="Egresos" />
            <Line type="monotone" dataKey="ingresos" stroke="var(--color-primary)" strokeWidth={2} dot={false} name="Tendencia" />
          </ComposedChart>
        </ResponsiveContainer>
      );

    default:
      return null;
  }
}
