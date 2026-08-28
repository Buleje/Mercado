"use client";

import { CardTitle } from "@buleje/design-system";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart as RechartsPie, Pie, Cell, Legend,
} from "recharts";

// Using CSS variables via getComputedStyle to honor DS tokens at runtime
const PIE_COLORS = [
  "var(--brand-ink)", "var(--secondary)", "var(--data-warning)", "var(--data-error)",
  "var(--accent)", "var(--brand-ink-light, #00BDBD)", "var(--data-success)",
  "var(--text-secondary)", "var(--rule-base)", "var(--data-warning-100)",
  "var(--surface-sunken)", "var(--data-error-100)",
];

interface ContratosChartProps {
  typeData: Array<{ name: string; value: number }>;
  monthData: Array<{ name: string; contratos: number }>;
}

export default function ContratosChart({ typeData, monthData }: ContratosChartProps) {
  if (typeData.length === 0 && monthData.length === 0) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Por tipo */}
      {typeData.length > 0 && (
        <div className="bg-[var(--surface-raised)] dark:bg-white/5 border border-[var(--rule-base)] dark:border-white/10 rounded-xl p-4">
          <CardTitle className="text-sm font-bold text-[var(--text-primary)] mb-4">Contratos por Tipo</CardTitle>
          <ResponsiveContainer minWidth={0} width="100%" height={250}>
            <RechartsPie>
              <Pie data={typeData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, value }) => `${name}: ${value}`}>
                {typeData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip />
              <Legend />
            </RechartsPie>
          </ResponsiveContainer>
        </div>
      )}

      {/* Por mes */}
      {monthData.length > 0 && (
        <div className="bg-[var(--surface-raised)] dark:bg-white/5 border border-[var(--rule-base)] dark:border-white/10 rounded-xl p-4">
          <CardTitle className="text-sm font-bold text-[var(--text-primary)] mb-4">Contratos por Mes</CardTitle>
          <ResponsiveContainer minWidth={0} width="100%" height={250}>
            <BarChart data={monthData}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="name" fontSize={11} />
              <YAxis fontSize={11} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="contratos" fill="var(--brand-ink)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
