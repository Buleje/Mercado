"use client";

import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  ReferenceLine, ComposedChart, Bar, Line,
} from "recharts";
import { Maximize2 } from "@buleje/design-system/icons";
import { ChartTooltip } from "@/lib/chart-tooltip";
import { formatSolesShort } from "@/lib/chart-helpers";
import { SERIE } from "@/components/admin/shared/chart-palette";
import FavStar from "@/components/admin/shared/FavStar";
import { formatCurrency } from "@/lib/currency";
import type { useFavoriteCharts } from "@/hooks/use-favorite-charts";
import { useMetaDeVentas } from "@/hooks/use-meta-de-ventas";
import type { MesResumen } from "./tipos";
import MetaDelGrafico from "./MetaDelGrafico";

/**
 * Ingresos, gastos y utilidad de los últimos seis meses, con la meta de ventas
 * del negocio si la puso (antes, una «Meta: S/15,000» fija en el código).
 */
export default function GraficoIngresosGastos({
  monthlyData, finFavs, setExpandedChart,
}: {
  monthlyData: MesResumen[];
  finFavs: ReturnType<typeof useFavoriteCharts>;
  setExpandedChart: (id: string) => void;
}) {
  const uso = useMetaDeVentas();
  const meta = uso.meta?.target ?? null;
  return (
    <>
      {monthlyData.length > 0 && (
        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div className="flex items-center gap-2">
              <FavStar id="ingresos-vs-gastos" favs={finFavs} />
              <div className="h-2 w-2 rounded-full bg-primary" />
              <p className="text-sm font-bold text-[var(--text-primary)]">Ingresos vs Gastos vs Utilidad</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <MetaDelGrafico {...uso} />
              <span className="text-xs text-[var(--text-tertiary)] font-medium">Últimos 6 meses</span>
              <button onClick={() => setExpandedChart("ingresos-gastos")} className="p-1 hover:bg-[var(--surface-sunken)] rounded transition-colors" title="Expandir"><Maximize2 className="h-3.5 w-3.5 text-[var(--text-tertiary)]" /></button>
            </div>
          </div>
          <ResponsiveContainer minWidth={0} width="100%" height={320}>
            <ComposedChart data={monthlyData} margin={{ top: 10, right: 15, left: 0, bottom: 5 }}>
              <defs>
                <linearGradient id="gradIngresos" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.9} />
                  <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0.7} />
                </linearGradient>
                <linearGradient id="gradGastos" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={SERIE.gastos} stopOpacity={0.9} />
                  <stop offset="100%" stopColor={SERIE.gastos} stopOpacity={0.7} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--rule-base)" className="" vertical={false} />
              <XAxis dataKey="mes" tick={{ fontSize: 12, fill: "var(--text-secondary)" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "var(--text-secondary)" }} tickFormatter={formatSolesShort} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Legend
                formatter={(value: unknown) => { const v = String(value); const l: Record<string, string> = { ingresos: "Ingresos", gastos: "Gastos", utilidad: "Utilidad" }; return l[v] ?? v; }}
                iconType="circle"
                wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }}
              />
              <ReferenceLine y={0} stroke="var(--text-tertiary)" strokeDasharray="3 3" />
              {/* extendDomain: una meta por encima de lo vendido se ve igual, en vez de quedar fuera del eje. */}
              {meta != null && (
                <ReferenceLine y={meta} ifOverflow="extendDomain" stroke={SERIE.alerta} strokeDasharray="5 5" label={{ value: `Meta: ${formatCurrency(meta, { decimals: 0 })}`, position: "insideTopRight", fill: SERIE.alerta, fontSize: 11 }} />
              )}
              <Bar dataKey="ingresos" fill="url(#gradIngresos)" radius={[6, 6, 0, 0]} barSize={30} />
              <Bar dataKey="gastos" fill="url(#gradGastos)" radius={[6, 6, 0, 0]} barSize={30} />
              <Line type="monotone" dataKey="utilidad" stroke={SERIE.utilidad} strokeWidth={3} dot={{ r: 5, fill: SERIE.utilidad, strokeWidth: 2, stroke: "var(--surface-raised)" }} activeDot={{ r: 7 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </>
  );
}
