"use client";

import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  PieChart, Pie, Cell, ComposedChart, Bar, Line, AreaChart, Area,
} from "recharts";
import { formatCurrency } from "@/lib/currency";
import { ChartTooltip } from "@/lib/chart-tooltip";
import { formatSolesShort } from "@/lib/chart-helpers";
import { SERIE } from "@/components/admin/shared/chart-palette";
import ChartExpandModal from "@/components/admin/shared/ChartExpandModal";
import { DASHBOARD_EXPENSE_COLORS, type MesResumen, type DiaFlujo, type Porcion } from "./tipos";

/** El gráfico elegido, en grande. */
export default function GraficosAmpliados({
  expandedChart, setExpandedChart, monthlyData, cashFlow, expensesByCategory,
}: {
  expandedChart: string | null;
  setExpandedChart: (id: string | null) => void;
  monthlyData: MesResumen[];
  cashFlow: DiaFlujo[];
  expensesByCategory: Porcion[];
}) {
  return (
    <>
      {expandedChart && (
        <ChartExpandModal title={expandedChart === "ingresos-gastos" ? "Ingresos vs Gastos vs Utilidad" : expandedChart === "flujo-caja" ? "Flujo de Caja" : expandedChart === "gastos-cat" ? "Gastos por Categoría" : expandedChart} onClose={() => setExpandedChart(null)}>
            {expandedChart === "ingresos-gastos" && monthlyData.length > 0 && (
              <ResponsiveContainer minWidth={0} width="100%" height={500}>
                <ComposedChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--rule-base)" />
                  <XAxis dataKey="mes" tick={{ fontSize: 14 }} />
                  <YAxis tickFormatter={formatSolesShort} tick={{ fontSize: 13 }} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend />
                  <Bar dataKey="ingresos" fill="var(--color-primary)" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="gastos" fill={SERIE.gastos} radius={[6, 6, 0, 0]} />
                  <Line type="monotone" dataKey="utilidad" stroke={SERIE.utilidad} strokeWidth={3} dot={{ r: 5, fill: SERIE.utilidad }} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
            {expandedChart === "flujo-caja" && cashFlow.some(d => d.ingresos > 0 || d.gastos > 0) && (
              <ResponsiveContainer minWidth={0} width="100%" height={500}>
                <AreaChart data={cashFlow}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--rule-base)" />
                  <XAxis dataKey="dia" tick={{ fontSize: 12 }} />
                  <YAxis tickFormatter={formatSolesShort} tick={{ fontSize: 13 }} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="ingresos" stroke="var(--accent)" fill="color-mix(in oklab, var(--accent) 12%, transparent)" strokeWidth={2} />
                  <Area type="monotone" dataKey="gastos" stroke={SERIE.gastos} fill={SERIE.gastos} fillOpacity={0.12} strokeWidth={2} />
                  <Area type="monotone" dataKey="balance" stroke="var(--color-primary)" fill="var(--color-primary)30" strokeWidth={3} />
                </AreaChart>
              </ResponsiveContainer>
            )}
            {expandedChart === "gastos-cat" && expensesByCategory.length > 0 && (
              <ResponsiveContainer minWidth={0} width="100%" height={500}>
                <PieChart>
                  <Pie data={expensesByCategory} cx="50%" cy="50%" innerRadius={100} outerRadius={200} paddingAngle={3} dataKey="value" label>
                    {expensesByCategory.map((_, index) => (
                      <Cell key={`ec-big-${index}`} fill={DASHBOARD_EXPENSE_COLORS[index % DASHBOARD_EXPENSE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: unknown, name: unknown) => [formatCurrency(Number(value), { decimals: 0 }), String(name)]} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
        </ChartExpandModal>
      )}
    </>
  );
}
