"use client";

import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  ReferenceLine, AreaChart, Area,
} from "recharts";
import { Maximize2 } from "@buleje/design-system/icons";
import { ChartTooltip } from "@/lib/chart-tooltip";
import { formatSolesShort } from "@/lib/chart-helpers";
import { SERIE } from "@/components/admin/shared/chart-palette";
import FavStar from "@/components/admin/shared/FavStar";
import type { useFavoriteCharts } from "@/hooks/use-favorite-charts";
import type { DiaFlujo } from "./tipos";
import BloquePlegable from "./BloquePlegable";
import { lineaFlujo } from "./lineas-plegadas";

/** Ingresos, gastos y balance por día de los últimos 30 días. */
export default function FlujoCajaDiario({
  cashFlow, finFavs, setExpandedChart,
}: {
  cashFlow: DiaFlujo[];
  finFavs: ReturnType<typeof useFavoriteCharts>;
  setExpandedChart: (id: string) => void;
}) {
  return (
    <>
      {/* Guard: el array siempre tiene 30 elementos (uno por día), pero si todos
          son cero no hay movimientos reales → no mostrar ejes vacíos */}
      {cashFlow.some(d => d.ingresos > 0 || d.gastos > 0) && (
        <BloquePlegable
          id="flujo-caja"
          titulo="Flujo de caja"
          resumen={lineaFlujo(cashFlow)}
          acciones={
            <>
              <span className="text-xs text-[var(--text-tertiary)] font-medium">Últimos 30 días</span>
              <FavStar id="flujo-caja" favs={finFavs} />
              <button onClick={() => setExpandedChart("flujo-caja")} className="p-1 hover:bg-[var(--surface-sunken)] rounded transition-colors" title="Expandir"><Maximize2 className="h-3.5 w-3.5 text-[var(--text-tertiary)]" /></button>
            </>
          }
        >
          <ResponsiveContainer minWidth={0} width="100%" height={280}>
            <AreaChart data={cashFlow} margin={{ top: 10, right: 15, left: 0, bottom: 5 }}>
              <defs>
                <linearGradient id="gradCashIngresos" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradCashGastos" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={SERIE.gastos} stopOpacity={0.2} />
                  <stop offset="95%" stopColor={SERIE.gastos} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradCashBalance" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--rule-base)" className="" vertical={false} />
              <XAxis dataKey="dia" tick={{ fontSize: 10, fill: "var(--text-tertiary)" }} interval={4} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "var(--text-tertiary)" }} tickFormatter={formatSolesShort} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <ReferenceLine y={0} stroke="var(--text-tertiary)" strokeDasharray="4 4" label={{ value: "S/0", position: "left", fill: "var(--text-tertiary)", fontSize: 10 }} />
              <Area type="monotone" dataKey="ingresos" stroke="var(--accent)" fill="url(#gradCashIngresos)" strokeWidth={1.5} />
              <Area type="monotone" dataKey="gastos" stroke={SERIE.gastos} fill="url(#gradCashGastos)" strokeWidth={1.5} />
              <Area type="monotone" dataKey="balance" stroke="var(--color-primary)" fill="url(#gradCashBalance)" strokeWidth={2.5} dot={false} />
              <Legend
                formatter={(value: unknown) => { const v = String(value); const l: Record<string, string> = { ingresos: "Ingresos", gastos: "Gastos", balance: "Balance" }; return l[v] ?? v; }}
                iconType="circle"
                wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </BloquePlegable>
      )}
    </>
  );
}
