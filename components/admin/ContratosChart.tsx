"use client";

import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { CardTitle } from "@buleje/design-system";

// ── Types ─────────────────────────────────────────────────────────────────────

type TypeRow  = { name: string; value: number };
type MonthRow = { name: string; contratos: number };

interface Props {
  typeData:  TypeRow[];
  monthData: MonthRow[];
}

const PIE_COLORS = [
  "var(--brand-ink)", "var(--secondary)", "var(--data-warning)", "var(--data-error)",
  "var(--accent)", "var(--brand-ink-light, #00BDBD)", "var(--data-success)",
  "var(--text-secondary)", "var(--rule-base)", "var(--data-warning-100)",
  "var(--surface-sunken)", "var(--data-error-100)",
];

export default function ContratosChart({ typeData, monthData }: Props) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Por tipo */}
      <div className="bg-white dark:bg-white/5 border border-[var(--rule-base)] dark:border-white/10 rounded-xl p-4">
        <CardTitle className="text-sm font-bold text-[var(--text-primary)] mb-4">Contratos por Tipo</CardTitle>
        {typeData.length > 0 ? (
          <ResponsiveContainer minWidth={0} width="100%" height={250}>
            <PieChart>
              <Pie
                data={typeData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={80}
                label={({ name, value }) => `${name}: ${value}`}
              >
                {typeData.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-sm text-[var(--text-tertiary)] text-center py-8">Sin datos</p>
        )}
      </div>

      {/* Por mes */}
      <div className="bg-white dark:bg-white/5 border border-[var(--rule-base)] dark:border-white/10 rounded-xl p-4">
        <CardTitle className="text-sm font-bold text-[var(--text-primary)] mb-4">Contratos por Mes</CardTitle>
        {monthData.length > 0 ? (
          <ResponsiveContainer minWidth={0} width="100%" height={250}>
            <BarChart data={monthData}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="name" fontSize={11} />
              <YAxis fontSize={11} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="contratos" fill="var(--brand-ink)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-sm text-[var(--text-tertiary)] text-center py-8">Sin datos</p>
        )}
      </div>
    </div>
  );
}
