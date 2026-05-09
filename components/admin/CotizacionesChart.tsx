"use client";

/**
 * CotizacionesChart — charts lazy de recharts para CotizacionesModule.
 * Contiene: AreaChart mensual + BarChart top clientes.
 * Cargado con next/dynamic para excluir recharts del bundle inicial.
 */

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";

interface MonthlyEntry {
  mes: string;
  count: number;
}

interface ClienteEntry {
  name: string;
  monto: number;
}

interface CotizacionesChartProps {
  monthlyData: MonthlyEntry[];
  topClientes: ClienteEntry[];
  formatCurrency: (v: number) => string;
  emptyCot: (msg: string) => React.ReactNode;
}

export default function CotizacionesChart({
  monthlyData,
  topClientes,
  formatCurrency,
  emptyCot,
}: CotizacionesChartProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* AreaChart: cotizaciones emitidas por mes */}
      <div className="bg-white dark:bg-[var(--color-card)] rounded-xl border border-[var(--rule-base)] p-6">
        <p className="text-sm font-bold text-[var(--text-primary)] mb-4">
          Cotizaciones por mes
        </p>
        {monthlyData.some((d) => d.count > 0) ? (
          <ResponsiveContainer minWidth={0} width="100%" height={220}>
            <AreaChart data={monthlyData}>
              <defs>
                <linearGradient id="cotGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#457b9d" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#457b9d" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(107,114,128,0.12)"
              />
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={((v: number) => [`${v} cotizaciones`, "Emitidas"]) as any}
                contentStyle={{
                  borderRadius: "12px",
                  border: "1px solid #e5e7eb",
                  fontSize: "12px",
                }}
              />
              <Area
                type="monotone"
                dataKey="count"
                stroke="#457b9d"
                fill="url(#cotGrad)"
                strokeWidth={2}
                dot={{ r: 3, fill: "#457b9d" }}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          emptyCot("Sin cotizaciones en los últimos meses")
        )}
      </div>

      {/* Top 5 clientes */}
      <div className="bg-white dark:bg-[var(--color-card)] rounded-xl border border-[var(--rule-base)] p-6">
        <p className="text-sm font-bold text-[var(--text-primary)] mb-4">
          Top 5 clientes por monto
        </p>
        {topClientes.length > 0 ? (
          <ResponsiveContainer minWidth={0} width="100%" height={220}>
            <BarChart data={topClientes} layout="vertical">
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(107,114,128,0.12)"
              />
              <XAxis
                type="number"
                tickFormatter={(v: number) => `S/${v}`}
                tick={{ fontSize: 11 }}
              />
              <YAxis
                dataKey="name"
                type="category"
                width={110}
                tick={{ fontSize: 10 }}
              />
              <Tooltip
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={((v: number) => [formatCurrency(Number(v)), "Cotizado"]) as any}
                contentStyle={{
                  borderRadius: "12px",
                  border: "1px solid #e5e7eb",
                  fontSize: "12px",
                }}
              />
              <Bar dataKey="monto" fill="var(--accent)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          emptyCot("Sin datos de clientes")
        )}
      </div>
    </div>
  );
}
