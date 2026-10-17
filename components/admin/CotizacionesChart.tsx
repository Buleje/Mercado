"use client";

/**
 * Los dos gráficos de Cotizaciones (dentro del panel de Indicadores): cuántas
 * se emitieron por mes y los cinco clientes con más monto cotizado. Lazy con
 * `next/dynamic` para que recharts no entre al bundle inicial.
 *
 * Un gráfico sin datos no se dibuja; si ninguno tiene, el bloque entero sale.
 */
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";
import { CardTitle } from "@buleje/design-system";
import { formatCurrency } from "@/lib/format";

interface CotizacionesChartProps {
  porMes: { mes: string; count: number }[];
  topClientes: { name: string; monto: number }[];
}

/* Ejes y tooltip con los tokens del tema (claro y oscuro) y a 14 px. */
const EJE = { fontSize: 14, fill: "var(--text-secondary)" };
const TOOLTIP = {
  borderRadius: "12px",
  border: "1px solid var(--rule-base)",
  background: "var(--surface-raised)",
  color: "var(--text-primary)",
  fontSize: "14px",
};
const REJILLA = "var(--rule-soft)";

export default function CotizacionesChart({ porMes, topClientes }: CotizacionesChartProps) {
  const hayMeses = porMes.some((d) => d.count > 0);
  const hayClientes = topClientes.length > 0;
  if (!hayMeses && !hayClientes) return null;
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {hayMeses && (
        <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
          <CardTitle className="mb-3">Cotizaciones por mes</CardTitle>
          <ResponsiveContainer minWidth={0} width="100%" height={220}>
            <AreaChart data={porMes}>
              <defs>
                <linearGradient id="cotGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={REJILLA} />
              <XAxis dataKey="mes" tick={EJE} />
              <YAxis allowDecimals={false} tick={EJE} width={32} />
              <Tooltip formatter={(v) => [`${String(v)} cotizaciones`, "Emitidas"]} contentStyle={TOOLTIP} />
              <Area type="monotone" dataKey="count" stroke="var(--accent)" fill="url(#cotGrad)" strokeWidth={2} dot={{ r: 3, fill: "var(--accent)" }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {hayClientes && (
        <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
          <CardTitle className="mb-3">Clientes con más monto cotizado</CardTitle>
          <ResponsiveContainer minWidth={0} width="100%" height={220}>
            <BarChart data={topClientes} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke={REJILLA} />
              <XAxis type="number" tickFormatter={(v: number) => `S/${v}`} tick={EJE} />
              <YAxis dataKey="name" type="category" width={130} tick={EJE} />
              <Tooltip formatter={(v) => [formatCurrency(Number(v)), "Cotizado"]} contentStyle={TOOLTIP} />
              <Bar dataKey="monto" fill="var(--accent)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
