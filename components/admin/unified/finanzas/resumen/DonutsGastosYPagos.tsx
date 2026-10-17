"use client";

import { useState } from "react";
import { Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Maximize2, X as XIcon } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/currency";
import { colorMedioPago } from "@/components/admin/shared/chart-palette";
import FavStar from "@/components/admin/shared/FavStar";
import { EnlacePanel } from "@/components/admin/shared/EnlacePanel";
import type { useFavoriteCharts } from "@/hooks/use-favorite-charts";
import { DASHBOARD_EXPENSE_COLORS, PM_FALLBACK_COLORS, type Porcion } from "./tipos";
import BloquePlegable from "./BloquePlegable";
import { lineaGastosYPagos } from "./lineas-plegadas";

/** Vacío de una mitad: una frase, no una tarjeta con título (ley de la vista). */
const VACIO = "py-6 text-center text-sm text-[var(--text-tertiary)]";

/** Gastos del mes por categoría y los ingresos por medio de pago. */
export default function DonutsGastosYPagos({
  expensesByCategory, paymentMethods, finFavs, setExpandedChart,
}: {
  expensesByCategory: Porcion[];
  paymentMethods: Porcion[];
  finFavs: ReturnType<typeof useFavoriteCharts>;
  setExpandedChart: (id: string) => void;
}) {
  // Mejora 12: Click-to-filter en PieChart de gastos
  const [gastosPieFilter, setGastosPieFilter] = useState<string | null>(null);
  const totalExpenses = expensesByCategory.reduce((s, g) => s + g.value, 0);
  const totalIncome = paymentMethods.reduce((s, g) => s + g.value, 0);
  return (
    <BloquePlegable
      id="gastos-y-pagos"
      titulo="Gastos e ingresos por tipo"
      resumen={lineaGastosYPagos(totalExpenses, totalIncome, expensesByCategory.length > 0, paymentMethods.length > 0)}
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Donut izquierda: Gastos por categoria */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <FavStar id="gastos-categoria" favs={finFavs} />
            <div className="h-2 w-2 rounded-full bg-[var(--data-error-500)]" />
            <p className="text-sm font-bold text-[var(--text-primary)]">Gastos por categoría</p>
            <div className="flex-1" />
            {gastosPieFilter && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] text-xs font-bold">
                {gastosPieFilter}
                <button aria-label="Quitar" onClick={() => setGastosPieFilter(null)} className="hover:bg-primary/20 rounded-full p-0.5 transition-colors"><XIcon className="h-3 w-3" /></button>
              </span>
            )}
            <button onClick={() => setExpandedChart("gastos-cat")} className="p-1 hover:bg-[var(--surface-sunken)] rounded transition-colors" title="Expandir"><Maximize2 className="h-3.5 w-3.5 text-[var(--text-tertiary)]" /></button>
          </div>
          {expensesByCategory.length > 0 ? (
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <div className="relative w-45 h-45 shrink-0">
                <ResponsiveContainer initialDimension={{ width: 1, height: 1 }} minWidth={0} width="100%" height="100%">
                  <PieChart>
                    <Pie data={expensesByCategory} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value" stroke="none" className="cursor-pointer"
                      onClick={(_: unknown, idx: number) => setGastosPieFilter(prev => prev === expensesByCategory[idx]?.name ? null : expensesByCategory[idx]?.name ?? null)}>
                      {expensesByCategory.map((_, index) => (
                        <Cell key={`ec-${index}`} fill={DASHBOARD_EXPENSE_COLORS[index % DASHBOARD_EXPENSE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: unknown, name: unknown) => [formatCurrency(Number(value), { decimals: 0 }), String(name)]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="text-center">
                    <p className="text-xs text-[var(--text-tertiary)] font-medium uppercase">Total gastos</p>
                    <p className={cn("text-base font-extrabold", totalExpenses === 0 ? "text-[var(--text-tertiary)]" : "text-[var(--text-primary)]")}>{formatCurrency(totalExpenses, { decimals: 0 })}</p>
                  </div>
                </div>
              </div>
              <div className="flex-1 space-y-2 w-full">
                {expensesByCategory.filter(g => g.name).map((g, i) => (
                  <div key={g.name || i} className="flex items-center gap-2 text-xs">
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: DASHBOARD_EXPENSE_COLORS[i % DASHBOARD_EXPENSE_COLORS.length] }} />
                    <span className="flex-1 text-[var(--text-primary)] font-semibold truncate">{g.name}</span>
                    <span className="text-[var(--text-secondary)] font-mono">{formatCurrency(g.value, { decimals: 0 })}</span>
                    <span className="text-[var(--text-tertiary)] w-9 text-right font-bold">{totalExpenses > 0 ? Math.round((g.value / totalExpenses) * 100) : 0}%</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className={VACIO}>
              Sin gastos anotados este mes.{" "}
              <EnlacePanel href="/admin?tab=plata&vista=gastos">Ir a Gastos</EnlacePanel>
            </p>
          )}
        </div>

        {/* Donut derecha: Metodos de pago */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <div className="h-2 w-2 rounded-full bg-primary" />
            <p className="text-sm font-bold text-[var(--text-primary)]">Ingresos por medio de pago</p>
          </div>
          {paymentMethods.length > 0 ? (
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <div className="relative w-45 h-45 shrink-0">
                <ResponsiveContainer initialDimension={{ width: 1, height: 1 }} minWidth={0} width="100%" height="100%">
                  <PieChart>
                    <Pie data={paymentMethods} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value" stroke="none">
                      {paymentMethods.map((entry, index) => (
                        <Cell key={`pm-${index}`} fill={colorMedioPago(entry.name) ?? PM_FALLBACK_COLORS[index % PM_FALLBACK_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: unknown, name: unknown) => [formatCurrency(Number(value), { decimals: 0 }), String(name)]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="text-center">
                    <p className="text-xs text-[var(--text-tertiary)] font-medium uppercase">Total ingresos</p>
                    <p className={cn("text-base font-extrabold", totalIncome === 0 ? "text-[var(--text-tertiary)]" : "text-[var(--text-primary)]")}>{formatCurrency(totalIncome, { decimals: 0 })}</p>
                  </div>
                </div>
              </div>
              <div className="flex-1 space-y-2 w-full">
                {paymentMethods.filter(g => g.name).map((g, i) => (
                  <div key={g.name || i} className="flex items-center gap-2 text-xs">
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: colorMedioPago(g.name) }} />
                    <span className="flex-1 text-[var(--text-primary)] font-semibold truncate">{g.name}</span>
                    <span className="text-[var(--text-secondary)] font-mono">{formatCurrency(g.value, { decimals: 0 })}</span>
                    <span className="text-[var(--text-tertiary)] w-9 text-right font-bold">{totalIncome > 0 ? Math.round((g.value / totalIncome) * 100) : 0}%</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className={VACIO}>Sin ventas cobradas este mes.</p>
          )}
        </div>
      </div>
    </BloquePlegable>
  );
}
