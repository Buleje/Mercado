"use client";

/**
 * ClientesCharts — pattern unificado:
 *  - Row 2 (FULL): Cohorts retention 6 meses (LineChart multiple)
 *  - Row 3: Segmentacion + Frecuencia compra
 *  - Row 4: MicroDonut canal origen + MicroList top 5 CLV + MicroGauge tasa retencion
 */

import {
  AreaChart, Area, BarChart, Bar, ComposedChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, Cell,
} from "recharts";
import {
  Users, Star, Heart, ShoppingCart, Crown, Target, TrendingUp,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { ClientesData } from "./ClientesDashboard";
import {
  ChartCard, ChartTooltip, CHART_TOKENS,
  MicroDonut, MicroList, MicroGauge,
} from "./_shared";

const T = CHART_TOKENS;

export default function ClientesCharts({ data }: { data: ClientesData }) {
  // Top 5 clientes para MicroList
  const top5Clientes = data.topClientes.slice(0, 5).map((c) => ({
    name: c.nombre,
    value: c.gasto,
    label: `S/ ${c.gasto >= 1000 ? `${(c.gasto / 1000).toFixed(1)}k` : c.gasto.toFixed(0)}`,
    sublabel: `${c.pedidos} compras`,
  }));

  // Segmentacion para donut (basada en distribucionGasto)
  const segmentData = data.distribucionGasto
    .filter((d) => d.cantidad > 0)
    .map((d) => ({
      name: d.rango, value: d.cantidad, color: d.color,
    }));

  // Tasa de retencion = recurrentes / activos
  const tasaRetencion = data.clientesActivos > 0
    ? (data.recurrentes / data.clientesActivos) * 100
    : 0;

  return (
    <div className="space-y-4">
      {/* ── Row 2: FULL-WIDTH — Retencion mensual ── */}
      <ChartCard
        title="Retencion mensual — ultimos 6 meses"
        Icon={TrendingUp}
        height={340}
        subtitle="Clientes nuevos vs recurrentes por mes (apilado)"
        isEmpty={!data.retencion.some((r) => r.total > 0)}
        emptyText="Sin datos historicos"
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data.retencion} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={T.grid} vertical={false} />
            <XAxis dataKey="mes" tick={{ fontSize: T.axisFontSize, fill: T.tickFill }} axisLine={false} tickLine={false} />
            <YAxis yAxisId="left" tick={{ fontSize: T.axisFontSize, fill: T.tickFill }} axisLine={false} tickLine={false} />
            <Tooltip content={<ChartTooltip />} />
            <Legend iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
            <Bar yAxisId="left" dataKey="recurrentes" name="Recurrentes" fill={T.brand} stackId="a" radius={[0, 0, 0, 0]} />
            <Bar yAxisId="left" dataKey="nuevos" name="Nuevos" fill={T.violet} stackId="a" radius={[6, 6, 0, 0]} />
            <Line yAxisId="left" type="monotone" dataKey="total" name="Total" stroke={T.amber} strokeWidth={2} dot={{ r: 3, fill: T.amber }} strokeDasharray="4 4" />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* ── Row 3: 2 secondary charts ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="Actividad diaria"
          Icon={Users}
          height={280}
          subtitle="Clientes activos vs nuevos por dia"
          isEmpty={data.clientesPorDia.length === 0}
          emptyText="Sin actividad en el periodo"
        >
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data.clientesPorDia} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gradActivos" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={T.brand} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={T.brand} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={T.grid} vertical={false} />
              <XAxis dataKey="dia" tick={{ fontSize: T.axisFontSize, fill: T.tickFill }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: T.axisFontSize, fill: T.tickFill }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Area type="monotone" dataKey="activos" name="Activos" stroke={T.brand} fill="url(#gradActivos)" strokeWidth={2} />
              <Bar dataKey="nuevos" name="Nuevos" fill={T.violet} radius={[4, 4, 0, 0]} opacity={0.8} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Frecuencia de compra"
          Icon={ShoppingCart}
          height={280}
          subtitle="Compras por cliente en el periodo"
          isEmpty={!data.frecuenciaCompra.some((f) => f.cantidad > 0)}
          emptyText="Sin compras en el periodo"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.frecuenciaCompra} barCategoryGap="22%" margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={T.grid} vertical={false} />
              <XAxis dataKey="frecuencia" tick={{ fontSize: T.axisFontSize, fill: T.tickFill }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: T.axisFontSize, fill: T.tickFill }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="cantidad" name="Clientes" radius={[6, 6, 0, 0]}>
                {data.frecuenciaCompra.map((entry, i) => (
                  <Cell key={i} fill={entry.color} opacity={entry.cantidad > 0 ? 1 : 0.15} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* ── Row 4: 3 micro-insights ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartCard
          title="Segmentacion de gasto"
          Icon={Crown}
          height={220}
          isEmpty={segmentData.length === 0}
          emptyText="Sin clientes activos"
        >
          <MicroDonut
            data={segmentData}
            centerLabel={String(data.totalClientes)}
            centerSubLabel="clientes"
          />
        </ChartCard>

        <ChartCard
          title="Top 5 clientes (CLV)"
          Icon={Star}
          height={220}
          isEmpty={top5Clientes.length === 0}
          emptyText="Sin clientes"
        >
          <MicroList items={top5Clientes} barColor={T.brand} showRank />
        </ChartCard>

        <ChartCard
          title="Tasa de retencion"
          Icon={Target}
          height={220}
          subtitle={`${data.recurrentes} recurrentes`}
        >
          <MicroGauge
            value={tasaRetencion}
            max={100}
            centerLabel={`${tasaRetencion.toFixed(0)}%`}
            centerSubLabel="retencion"
            footerText={
              tasaRetencion >= 60
                ? "Lealtad alta"
                : tasaRetencion >= 30
                  ? "Lealtad media"
                  : "Captar mas recurrentes"
            }
          />
        </ChartCard>
      </div>

      {/* ── Row opcional: Cohort table + Rating ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="Cohortes de retencion (4 meses)"
          Icon={Heart}
          height={220}
          subtitle="% de clientes que regresan"
          isEmpty={!data.cohortData.some((c) => c.m0 > 0)}
          emptyText="Sin cohortes suficientes"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[var(--text-tertiary)]">
                  <th className="text-left py-2 font-medium">Cohorte</th>
                  <th className="text-center py-2 font-medium">M0</th>
                  <th className="text-center py-2 font-medium">M1</th>
                  <th className="text-center py-2 font-medium">M2</th>
                  <th className="text-center py-2 font-medium">M3</th>
                </tr>
              </thead>
              <tbody>
                {data.cohortData.map((row, i) => (
                  <tr key={i} className="border-t border-gray-50 dark:border-[var(--rule-base)]">
                    <td className="py-2 font-medium text-[var(--text-secondary)]">{row.cohorte}</td>
                    {[row.m0, row.m1, row.m2, row.m3].map((val, j) => (
                      <td key={j} className="text-center py-2">
                        <span className={cn(
                          "inline-block px-2 py-0.5 rounded-md font-bold text-[length:var(--ts-2xs)]",
                          val >= 50
                            ? "bg-[var(--accent-soft)] text-[var(--data-success)] dark:bg-[var(--accent-muted)]"
                            : val >= 20
                              ? "bg-[var(--accent-soft)] text-[var(--data-success)] dark:bg-[var(--accent-muted)]"
                              : val > 0
                                ? "bg-[var(--data-warning-50)] text-[var(--data-warning)] dark:bg-amber-950/30"
                                : "text-[var(--text-tertiary)]",
                        )}>
                          {val}%
                        </span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ChartCard>

        <ChartCard
          title="Distribucion de ratings"
          Icon={Star}
          height={220}
          subtitle={`${data.totalResenas} reseñas · ${data.ratingPromedio.toFixed(1)}/5`}
          isEmpty={!data.distribucionRating.some((r) => r.cantidad > 0)}
          emptyText="Sin reseñas aun"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.distribucionRating} barCategoryGap="22%" margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={T.grid} vertical={false} />
              <XAxis dataKey="rating" tick={{ fontSize: T.axisFontSize, fill: T.tickFill }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}★`} />
              <YAxis tick={{ fontSize: T.axisFontSize, fill: T.tickFill }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="cantidad" name="Reseñas" radius={[6, 6, 0, 0]}>
                {data.distribucionRating.map((entry, i) => (
                  <Cell key={i} fill={entry.rating >= 4 ? T.emerald : entry.rating >= 3 ? T.amber : T.red} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}
