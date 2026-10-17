"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList } from "recharts";
import { Truck, CreditCard } from "@buleje/design-system/icons";
import { formatCurrency } from "@/lib/currency";
import { SERIE } from "@/components/admin/shared/chart-palette";
import type { Deudor } from "./tipos";
import BloquePlegable from "./BloquePlegable";
import { lineaDeudores } from "./lineas-plegadas";

/** A quién le debo y quién me debe. */
export default function DeudasYCobros({ topPayables, topFiados }: { topPayables: Deudor[]; topFiados: Deudor[] }) {
  return (
    <BloquePlegable id="deudas-y-fiados" titulo="Deudas y fiados, uno por uno" resumen={lineaDeudores(topPayables.length, topFiados.length)}>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Debo a proveedores */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Truck className="h-4 w-4 text-secondary" />
            <p className="text-sm font-bold text-[var(--text-primary)]">Debo a proveedores</p>
          </div>
          {topPayables.length > 0 ? (
            <ResponsiveContainer minWidth={0} width="100%" height={Math.max(topPayables.length * 44, 120)}>
              <BarChart data={topPayables} layout="vertical" margin={{ top: 0, right: 60, left: 0, bottom: 0 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "var(--text-secondary)" }} width={120} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ borderRadius: "10px", border: "1px solid var(--rule-base)", fontSize: "12px" }}
                  formatter={(value: unknown) => [formatCurrency(Number(value), { decimals: 0 }), "Monto"]}
                />
                <Bar dataKey="monto" radius={[0, 6, 6, 0]} barSize={20}>
                  {topPayables.map((entry, index) => (
                    <Cell key={`pay-${index}`} fill={entry.vencido ? SERIE.gastos : SERIE.alerta} />
                  ))}
                  <LabelList dataKey="monto" position="right" formatter={(v: unknown) => formatCurrency(Number(v), { decimals: 0 })} style={{ fontSize: 10, fill: "var(--text-secondary)", fontWeight: 600 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-center py-6">
              <Truck className="h-8 w-8 text-[var(--text-tertiary)] mx-auto mb-2" />
              <p className="text-sm text-[var(--text-tertiary)]">Sin deudas a proveedores</p>
            </div>
          )}
          {topPayables.some(p => p.vencido) && (
            <div className="flex items-center gap-2 mt-3 text-xs text-[var(--text-tertiary)]">
              <div className="w-2 h-2 rounded-full bg-[var(--data-error-500)]" /> Vencido
              <div className="w-2 h-2 rounded-full bg-secondary ml-2" /> Al día
            </div>
          )}
        </div>

        {/* Me deben (fiados) */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <CreditCard className="h-4 w-4 text-[var(--data-warning-500)]" />
            <p className="text-sm font-bold text-[var(--text-primary)]">Me deben (fiados)</p>
          </div>
          {topFiados.length > 0 ? (
            <ResponsiveContainer minWidth={0} width="100%" height={Math.max(topFiados.length * 44, 120)}>
              <BarChart data={topFiados} layout="vertical" margin={{ top: 0, right: 60, left: 0, bottom: 0 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "var(--text-secondary)" }} width={120} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ borderRadius: "10px", border: "1px solid var(--rule-base)", fontSize: "12px" }}
                  formatter={(value: unknown) => [formatCurrency(Number(value), { decimals: 0 }), "Monto"]}
                />
                <Bar dataKey="monto" radius={[0, 6, 6, 0]} barSize={20}>
                  {topFiados.map((entry, index) => (
                    <Cell key={`fia-${index}`} fill={entry.vencido ? SERIE.gastos : SERIE.alerta} />
                  ))}
                  <LabelList dataKey="monto" position="right" formatter={(v: unknown) => formatCurrency(Number(v), { decimals: 0 })} style={{ fontSize: 10, fill: "var(--text-secondary)", fontWeight: 600 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-center py-6">
              <CreditCard className="h-8 w-8 text-[var(--text-tertiary)] mx-auto mb-2" />
              <p className="text-sm text-[var(--text-tertiary)]">Sin fiados pendientes</p>
            </div>
          )}
          {topFiados.some(f => f.vencido) && (
            <div className="flex items-center gap-2 mt-3 text-xs text-[var(--text-tertiary)]">
              <div className="w-2 h-2 rounded-full bg-[var(--data-error-500)]" /> Vencido
              <div className="w-2 h-2 rounded-full bg-[var(--data-warning-500)] ml-2" /> Al día
            </div>
          )}
        </div>
      </div>
    </BloquePlegable>
  );
}
