"use client";

/**
 * ClientesCharts — charts base del módulo Clientes.
 * Rediseñado con DashboardSection + primitivas Buleje + DraggableSections.
 */

import { useMemo } from "react";
import type { ClientesData } from "./ClientesDashboard";
import {
  BulejeComposedChart,
  BulejeDonutChart,
} from "@/components/ui-system/charts";
import { DashboardSection, MicroList } from "./_shared";
import { DraggableSections, type DraggableItem } from "./DraggableSections";

function fmtS(v: number) {
  return `S/ ${v.toLocaleString("es-PE", { maximumFractionDigits: 0 })}`;
}

export default function ClientesCharts({ data }: { data: ClientesData }) {
  const topRows = data.topClientes.slice(0, 10).map((c) => ({
    name: c.nombre.length > 22 ? c.nombre.slice(0, 21) + "…" : c.nombre,
    value: c.gasto,
    label: `${fmtS(c.gasto)} · ${c.pedidos} ped.`,
  }));

  const topKpis = useMemo(() => {
    const total = data.topClientes.reduce((s, c) => s + c.gasto, 0);
    const pedidos = data.topClientes.reduce((s, c) => s + c.pedidos, 0);
    const ticket = pedidos > 0 ? total / pedidos : 0;
    return { total, pedidos, ticket, lider: data.topClientes[0] };
  }, [data.topClientes]);

  const retencionKpis = useMemo(() => {
    const total = data.retencion.reduce((s, m) => s + m.total, 0);
    const nuevos = data.retencion.reduce((s, m) => s + m.nuevos, 0);
    const recurrentes = data.retencion.reduce((s, m) => s + m.recurrentes, 0);
    const retPct = total > 0 ? Math.round((recurrentes / total) * 100) : 0;
    return { total, nuevos, recurrentes, retPct };
  }, [data.retencion]);

  const porDiaKpis = useMemo(() => {
    const nuevos = data.clientesPorDia.reduce((s, d) => s + d.nuevos, 0);
    const activosMax = data.clientesPorDia.reduce(
      (best, d) => (d.activos > best.activos ? d : best),
      { dia: "—", nuevos: 0, activos: 0 },
    );
    const promActivos = data.clientesPorDia.length
      ? Math.round(
          data.clientesPorDia.reduce((s, d) => s + d.activos, 0) /
            data.clientesPorDia.length,
        )
      : 0;
    return { nuevos, pico: activosMax, prom: promActivos };
  }, [data.clientesPorDia]);

  const gastoKpis = useMemo(() => {
    const total = data.distribucionGasto.reduce((s, r) => s + r.cantidad, 0);
    const top = data.distribucionGasto.reduce(
      (best, r) => (r.cantidad > best.cantidad ? r : best),
      { rango: "—", cantidad: 0, color: "" },
    );
    const top500 = data.distribucionGasto.find((r) => r.rango === "S/ 500+")?.cantidad ?? 0;
    return { total, top, top500 };
  }, [data.distribucionGasto]);

  const freqKpis = useMemo(() => {
    const total = data.frecuenciaCompra.reduce((s, r) => s + r.cantidad, 0);
    const loyal =
      (data.frecuenciaCompra.find((r) => r.frecuencia === "8+ compras")?.cantidad ?? 0) +
      (data.frecuenciaCompra.find((r) => r.frecuencia === "4-7 compras")?.cantidad ?? 0);
    const oneShot = data.frecuenciaCompra.find((r) => r.frecuencia === "1 compra")?.cantidad ?? 0;
    return { total, loyal, oneShot };
  }, [data.frecuenciaCompra]);

  const ticketChart = data.ticketPorCliente.map((c) => ({
    cliente: c.nombre.length > 14 ? c.nombre.slice(0, 13) + "…" : c.nombre,
    ticket: Math.round(c.ticket),
    visitas: c.visitas,
  }));

  const sections: DraggableItem[] = [
    {
      id: "top-10-clientes",
      render: () => (
        <DashboardSection
          kicker="Ranking · top 10 clientes del periodo"
          title="Quién más te compra"
          kpis={[
            { label: "Top-10 gastó", value: fmtS(topKpis.total), tone: "primary" },
            { label: "Pedidos top-10", value: String(topKpis.pedidos), tone: "neutral" },
            { label: "Ticket prom. top-10", value: fmtS(topKpis.ticket), tone: "success" },
            {
              label: "Líder",
              value: topKpis.lider?.nombre?.slice(0, 18) ?? "—",
              tone: "success",
            },
          ]}
        >
          {topRows.length > 0 ? (
            <MicroList items={topRows} barColor="var(--brand-primary)" showRank />
          ) : (
            <div className="rounded-lg border border-dashed border-[var(--rule-base)] p-8 text-center text-sm text-[var(--text-tertiary)]">
              Aún no hay clientes en el periodo.
            </div>
          )}
        </DashboardSection>
      ),
    },
    {
      id: "retencion-6m",
      render: () => (
        <DashboardSection
          kicker="Retención · rango activo"
          title="Nuevos vs recurrentes por mes"
          kpis={[
            { label: "Total 6m", value: String(retencionKpis.total), tone: "primary" },
            { label: "Nuevos 6m", value: String(retencionKpis.nuevos), tone: "success" },
            { label: "Recurrentes 6m", value: String(retencionKpis.recurrentes), tone: "success" },
            {
              label: "Retención",
              value: `${retencionKpis.retPct}%`,
              tone:
                retencionKpis.retPct >= 50
                  ? "success"
                  : retencionKpis.retPct >= 30
                    ? "primary"
                    : "warning",
            },
          ]}
        >
          <BulejeComposedChart
            data={data.retencion}
            xKey="mes"
            bars={[
              { key: "nuevos", label: "Nuevos", color: "primary", yAxis: "left" },
              { key: "recurrentes", label: "Recurrentes", color: "tertiary", yAxis: "left" },
            ]}
            lines={[{ key: "total", label: "Total activos", color: "accent", yAxis: "left" }]}
            leftAxisFormat={(v) => v.toString()}
            tooltipFormat={(v) => Number(v).toString()}
            height={300}
            minDataPoints={2}
          />
        </DashboardSection>
      ),
    },
    {
      id: "clientes-por-dia",
      render: () => (
        <DashboardSection
          kicker="Actividad · rango activo"
          title="Clientes nuevos y activos por día"
          kpis={[
            { label: "Nuevos 14d", value: String(porDiaKpis.nuevos), tone: "success" },
            { label: "Día pico", value: porDiaKpis.pico.dia, tone: "success" },
            {
              label: "Activos pico",
              value: String(porDiaKpis.pico.activos),
              tone: "primary",
            },
            { label: "Prom. activos/día", value: String(porDiaKpis.prom), tone: "neutral" },
          ]}
        >
          <BulejeComposedChart
            data={data.clientesPorDia}
            xKey="dia"
            bars={[{ key: "nuevos", label: "Nuevos", color: "primary", yAxis: "left" }]}
            lines={[{ key: "activos", label: "Activos", color: "accent", yAxis: "left" }]}
            leftAxisFormat={(v) => v.toString()}
            tooltipFormat={(v) => Number(v).toString()}
            height={280}
            minDataPoints={2}
          />
        </DashboardSection>
      ),
    },
    {
      id: "distribucion-gasto",
      render: () => (
        <DashboardSection
          kicker="Distribución · gasto histórico"
          title="Cuántos clientes en cada rango de gasto"
          kpis={[
            { label: "Total clientes", value: String(gastoKpis.total), tone: "primary" },
            { label: "Rango líder", value: gastoKpis.top.rango, tone: "success" },
            {
              label: "VIP (S/ 500+)",
              value: String(gastoKpis.top500),
              tone: gastoKpis.top500 > 0 ? "success" : "neutral",
            },
            {
              label: "% VIP",
              value: `${gastoKpis.total > 0 ? Math.round((gastoKpis.top500 / gastoKpis.total) * 100) : 0}%`,
              tone: "primary",
            },
          ]}
        >
          <div className="flex items-center justify-center py-2">
            <div className="w-full max-w-md">
              <BulejeDonutChart
                data={data.distribucionGasto.map((d) => ({ name: d.rango, value: d.cantidad }))}
                height={240}
                format={(v) => `${v} clientes`}
                label={
                  <div className="text-center">
                    <p className="text-[length:var(--ts-3xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                      Total
                    </p>
                    <p className="text-xl font-extrabold text-[var(--text-primary)]">
                      {gastoKpis.total}
                    </p>
                    <p className="text-[11px] text-[var(--text-secondary)]">clientes</p>
                  </div>
                }
              />
            </div>
          </div>
        </DashboardSection>
      ),
    },
    {
      id: "frecuencia-compra",
      render: () => (
        <DashboardSection
          kicker="Frecuencia · en el periodo"
          title="Cuántas veces compran tus clientes"
          kpis={[
            { label: "Total activos", value: String(freqKpis.total), tone: "primary" },
            { label: "Fieles (4+)", value: String(freqKpis.loyal), tone: "success" },
            {
              label: "Solo 1 compra",
              value: String(freqKpis.oneShot),
              tone: freqKpis.oneShot > 0 ? "warning" : "neutral",
            },
            {
              label: "% fieles",
              value: `${freqKpis.total > 0 ? Math.round((freqKpis.loyal / freqKpis.total) * 100) : 0}%`,
              tone: "primary",
            },
          ]}
        >
          <div className="flex items-center justify-center py-2">
            <div className="w-full max-w-md">
              <BulejeDonutChart
                data={data.frecuenciaCompra.map((d) => ({
                  name: d.frecuencia,
                  value: d.cantidad,
                }))}
                height={240}
                format={(v) => `${v} clientes`}
              />
            </div>
          </div>
        </DashboardSection>
      ),
    },
    {
      id: "ticket-por-cliente",
      render: () => (
        <DashboardSection
          kicker="Ticket promedio · top clientes"
          title="Cuánto gastan por visita"
          kpis={[
            {
              label: "Top 1",
              value: ticketChart[0]?.cliente ?? "—",
              tone: "success",
            },
            {
              label: "Ticket top 1",
              value: fmtS(ticketChart[0]?.ticket ?? 0),
              tone: "primary",
            },
            {
              label: "Visitas top 1",
              value: String(ticketChart[0]?.visitas ?? 0),
              tone: "neutral",
            },
            {
              label: "Promedio top",
              value: fmtS(
                ticketChart.length > 0
                  ? ticketChart.reduce((s, c) => s + c.ticket, 0) / ticketChart.length
                  : 0,
              ),
              tone: "neutral",
            },
          ]}
        >
          <BulejeComposedChart
            data={ticketChart}
            xKey="cliente"
            bars={[{ key: "ticket", label: "Ticket S/", color: "primary", yAxis: "left" }]}
            lines={[{ key: "visitas", label: "Visitas", color: "accent", yAxis: "right" }]}
            leftAxisFormat={(v) => `S/${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
            rightAxisFormat={(v) => v.toString()}
            tooltipFormat={(v, name) =>
              name?.toLowerCase().includes("ticket")
                ? fmtS(Number(v))
                : `${v} visitas`
            }
            height={280}
            minDataPoints={1}
          />
        </DashboardSection>
      ),
    },
  ];

  return <DraggableSections items={sections} storageKey="clientes-base-order" />;
}
