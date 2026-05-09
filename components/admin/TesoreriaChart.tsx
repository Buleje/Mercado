"use client";

import {
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { CardTitle } from "@buleje/design-system";

// ── Types ─────────────────────────────────────────────────────────────────────

type FlowRow    = { mes: string; ingresos: number; egresos: number };
type PieRow     = { name: string; value: number; color: string };

interface Props {
  flowData:    FlowRow[];
  tipoPieData: PieRow[];
  emptyMessage?: string;
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <p className="text-sm text-[var(--text-tertiary)]">{message}</p>
    </div>
  );
}

function fmtCurrency(n: number, moneda = "PEN") {
  const symbol = moneda === "USD" ? "$" : "S/";
  return `${symbol}${n.toFixed(2)}`;
}

export default function TesoreriaChart({ flowData, tipoPieData }: Props) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Flujo de caja */}
      <div className="bg-white dark:bg-[var(--color-card)] rounded-xl border border-[var(--rule-base)] p-6">
        <CardTitle className="text-sm font-bold text-[var(--text-primary)] mb-4">Flujo de caja (6 meses)</CardTitle>
        {flowData.some(d => d.ingresos > 0 || d.egresos > 0) ? (
          <ResponsiveContainer minWidth={0} width="100%" height={220}>
            <AreaChart data={flowData}>
              <defs>
                <linearGradient id="tresoIngGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="tresoEgrGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ef4444" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(107,114,128,0.12)" />
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(v: number) => `S/${v}`} tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={((v: number, name: string) => [fmtCurrency(Number(v)), name === "ingresos" ? "Ingresos" : "Egresos"]) as never}
                contentStyle={{ borderRadius: "12px", border: "1px solid #e5e7eb", fontSize: "12px" }}
              />
              <Area type="monotone" dataKey="ingresos" stroke="var(--accent)" fill="url(#tresoIngGrad)" strokeWidth={2} />
              <Area type="monotone" dataKey="egresos" stroke="#ef4444" fill="url(#tresoEgrGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <EmptyChart message="Sin movimientos recientes" />
        )}
      </div>

      {/* Saldo por tipo */}
      <div className="bg-white dark:bg-[var(--color-card)] rounded-xl border border-[var(--rule-base)] p-6">
        <CardTitle className="text-sm font-bold text-[var(--text-primary)] mb-4">Saldo por tipo de cuenta</CardTitle>
        {tipoPieData.length > 0 ? (
          <ResponsiveContainer minWidth={0} width="100%" height={220}>
            <PieChart>
              <Pie
                data={tipoPieData}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={85}
                dataKey="value"
                label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                labelLine={false}
              >
                {tipoPieData.map((d, i) => (
                  <Cell key={i} fill={d.color} />
                ))}
              </Pie>
              <Tooltip formatter={((v: number) => [fmtCurrency(Number(v)), "Saldo"]) as never} />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <EmptyChart message="Sin cuentas registradas" />
        )}
      </div>
    </div>
  );
}
