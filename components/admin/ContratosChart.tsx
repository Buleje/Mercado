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
  const hasType = typeData.length > 0;
  const hasMonth = monthData.length > 0;
  // Gráficos sin datos NO se muestran. Si no hay nada, el componente se oculta.
  if (!hasType && !hasMonth) return null;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Por tipo — se oculta si no hay datos */}
      {hasType && (
        <div className="bg-white dark:bg-white/5 border border-[var(--rule-base)] dark:border-white/10 rounded-xl p-4">
          <CardTitle className="text-sm font-bold text-[var(--text-primary)] mb-4">Contratos por Tipo</CardTitle>
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
        </div>
      )}

      {/* Por mes — se oculta si no hay datos */}
      {hasMonth && (
        <div className="bg-white dark:bg-white/5 border border-[var(--rule-base)] dark:border-white/10 rounded-xl p-4">
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
