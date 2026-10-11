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
import BloquePlegable from "./BloquePlegable";

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
  if (monthlyData.length === 0) return null;
  const primero = monthlyData[0];
  const ultimo = monthlyData[monthlyData.length - 1];
  return (
    /* Plegado por defecto (2026-10-11): la franja de arriba ya dice el mes, y
       el gráfico ocupaba 410 px de la primera pantalla. Plegado no repite
       cifras de Ganancias: dice qué meses cubre. */
    <BloquePlegable
      id="grafico-6-meses"
      titulo="Ingresos, costos y utilidad"
      resumen={`${monthlyData.length} meses, de ${primero.mes.toLowerCase()} a ${ultimo.mes.toLowerCase()}`}
      acciones={
        <>
          <FavStar id="ingresos-vs-gastos" favs={finFavs} />
          <MetaDelGrafico {...uso} />
          <button
            type="button"
            onClick={() => setExpandedChart("ingresos-gastos")}
            className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
            title="Ampliar el gráfico"
            aria-label="Ampliar el gráfico"
          >
            <Maximize2 className="h-4 w-4" aria-hidden />
          </button>
        </>
      }
    >
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
    </BloquePlegable>
  );
}
