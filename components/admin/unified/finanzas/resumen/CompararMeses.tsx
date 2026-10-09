"use client";

import { useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { BarChart3 } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { ChartTooltip } from "@/lib/chart-tooltip";
import { formatSolesShort } from "@/lib/chart-helpers";
import { SERIE } from "@/components/admin/shared/chart-palette";
import EmptyState from "@/components/admin/shared/EmptyState";
import type { MesResumen } from "./tipos";
import BloquePlegable from "./BloquePlegable";

/** Dos meses lado a lado. */
export default function CompararMeses({ monthlyData }: { monthlyData: MesResumen[] }) {
  // Mejora 20: Comparar meses. Arranca en «mes pasado vs este mes». Antes el
  // estado inicial era "2026-08" y las opciones del select son "Ago": nunca
  // coincidían y el bloque abría siempre en «Selecciona meses con datos».
  const [cmpMonth1, setCmpMonth1] = useState(() => monthlyData[monthlyData.length - 2]?.mes ?? "");
  const [cmpMonth2, setCmpMonth2] = useState(() => monthlyData[monthlyData.length - 1]?.mes ?? "");
  return (
        <BloquePlegable
          id="comparar-meses"
          titulo="Comparar meses"
          resumen={`${cmpMonth1} vs ${cmpMonth2}`}
          acciones={
            <div className="flex items-center gap-2">
              <select aria-label="Primer mes a comparar" value={cmpMonth1} onChange={e => setCmpMonth1(e.target.value)} className="text-xs border border-[var(--rule-base)] rounded-xl px-2 py-1 bg-[var(--surface-raised)] text-[var(--text-primary)]">
                {monthlyData.map(m => <option key={m.fullMonth} value={m.mes}>{m.mes}</option>)}
              </select>
              <span className="text-xs text-[var(--text-tertiary)]">vs</span>
              <select aria-label="Segundo mes a comparar" value={cmpMonth2} onChange={e => setCmpMonth2(e.target.value)} className="text-xs border border-[var(--rule-base)] rounded-xl px-2 py-1 bg-[var(--surface-raised)] text-[var(--text-primary)]">
                {monthlyData.map(m => <option key={m.fullMonth} value={m.mes}>{m.mes}</option>)}
              </select>
            </div>
          }
        >
          {(() => {
            const d1 = monthlyData.find(m => m.mes === cmpMonth1);
            const d2 = monthlyData.find(m => m.mes === cmpMonth2);
            if (!d1 || !d2) return <EmptyState icon={BarChart3} title="Elige dos meses con datos" />;
            // Sin datos reales en ninguno de los dos meses — no mostrar gráfico vacío
            const sinDatos = d1.ingresos === 0 && d1.gastos === 0 && d2.ingresos === 0 && d2.gastos === 0;
            if (sinDatos) return <EmptyState icon={BarChart3} title="Sin ventas en esos meses" description="Registra ventas y gastos para ver la comparativa" />;
            const diffIngresos = d1.ingresos > 0 ? Math.round(((d2.ingresos - d1.ingresos) / d1.ingresos) * 100) : 0;
            const diffGastos = d1.gastos > 0 ? Math.round(((d2.gastos - d1.gastos) / d1.gastos) * 100) : 0;
            const compareData = [
              { tipo: "Ingresos", [cmpMonth1]: d1.ingresos, [cmpMonth2]: d2.ingresos },
              { tipo: "Gastos", [cmpMonth1]: d1.gastos, [cmpMonth2]: d2.gastos },
              { tipo: "Utilidad", [cmpMonth1]: d1.utilidad, [cmpMonth2]: d2.utilidad },
            ];
            return (
              <>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="text-center p-2 bg-[var(--surface-sunken)] rounded-xl">
                    <p className="text-xs text-[var(--text-tertiary)] uppercase font-bold">Ventas</p>
                    <p className={cn("text-sm font-bold", diffIngresos >= 0 ? "text-[var(--data-success-500)]" : "text-[var(--data-error-500)]")}>{diffIngresos >= 0 ? "+" : ""}{diffIngresos}%</p>
                  </div>
                  <div className="text-center p-2 bg-[var(--surface-sunken)] rounded-xl">
                    <p className="text-xs text-[var(--text-tertiary)] uppercase font-bold">Gastos</p>
                    <p className={cn("text-sm font-bold", diffGastos <= 0 ? "text-[var(--data-success-500)]" : "text-[var(--data-error-500)]")}>{diffGastos >= 0 ? "+" : ""}{diffGastos}%</p>
                  </div>
                </div>
                <ResponsiveContainer minWidth={0} width="100%" height={220}>
                  <BarChart data={compareData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(107,114,128,0.12)" />
                    <XAxis dataKey="tipo" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={formatSolesShort} tick={{ fontSize: 11 }} />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend />
                    <Bar dataKey={cmpMonth1} fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey={cmpMonth2} fill={SERIE.alerta} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </>
            );
          })()}
        </BloquePlegable>
  );
}
