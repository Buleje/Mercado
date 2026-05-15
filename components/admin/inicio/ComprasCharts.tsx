"use client";

/**
 * ComprasCharts — charts base del módulo Compras.
 *
 * Rediseñado con DashboardSection + primitivas Buleje DS + DraggableSections.
 *
 * Secciones:
 *  1. Compras diarias (rango activo)
 *  2. Tendencia mensual (rango activo)
 *  3. Top proveedores del periodo (monto + órdenes)
 *  4. Estado de cuentas por pagar (Donut)
 *  5. Cuentas por vencer (Composed con umbrales)
 *  6. Top proveedores histórico (MicroList)
 */

import { useMemo } from "react";
import type { ComprasData } from "./ComprasDashboard";
import {
  BulejeComposedChart,
  BulejeDonutChart,
} from "@/components/ui-system/charts";
import { DashboardSection, MicroList } from "./_shared";
import { DraggableSections, type DraggableItem } from "./DraggableSections";

function fmtS(v: number) {
  return `S/ ${v.toLocaleString("es-PE", { maximumFractionDigits: 0 })}`;
}

export default function ComprasCharts({ data }: { data: ComprasData }) {
  const diariasKpis = useMemo(() => {
    const total = data.comprasDiarias.reduce((s, d) => s + d.total, 0);
    const dias = data.comprasDiarias.length || 1;
    const prom = total / dias;
    const pico = data.comprasDiarias.reduce(
      (best, d) => (d.total > best.total ? d : best),
      { dia: "—", total: 0 },
    );
    return { total, prom, pico };
  }, [data.comprasDiarias]);

  const mensualKpis = useMemo(() => {
    const total = data.comprasMensuales.reduce((s, m) => s + m.total, 0);
    const prom = total / Math.max(1, data.comprasMensuales.length);
    const best = [...data.comprasMensuales].sort((a, b) => b.total - a.total)[0];
    const worst = [...data.comprasMensuales].sort((a, b) => a.total - b.total)[0];
    return { total, prom, best, worst };
  }, [data.comprasMensuales]);

  const topProvRows = data.topProveedores.slice(0, 10).map((p) => ({
    name: p.nombre.length > 22 ? p.nombre.slice(0, 21) + "…" : p.nombre,
    value: p.total,
    label: `${fmtS(p.total)} · ${p.ordenes} OC`,
  }));

  const cuentasChart = data.cuentasPorVencer.slice(0, 10).map((c) => ({
    proveedor: c.nombre.length > 14 ? c.nombre.slice(0, 13) + "…" : c.nombre,
    dias: c.diasRestantes,
    monto: c.monto,
    umbralVencido: 0,
    umbralUrgente: 7,
  }));

  const cuentasKpis = useMemo(() => {
    const vencidos = data.cuentasPorVencer.filter((c) => c.status === "vencido").length;
    const urgentes = data.cuentasPorVencer.filter((c) => c.status === "urgente").length;
    const totalMonto = data.cuentasPorVencer.reduce((s, c) => s + c.monto, 0);
    const worst = data.cuentasPorVencer[0];
    return { vencidos, urgentes, totalMonto, worst };
  }, [data.cuentasPorVencer]);

  const sections: DraggableItem[] = [
    {
      id: "compras-diarias",
      span: "full",
      render: () => (
        <DashboardSection
          hideHeader
          kicker="Compras · rango activo"
          title="Monto de compras por día"
          kpis={[
            { label: "Total periodo", value: fmtS(diariasKpis.total), tone: "primary" },
            { label: "Promedio/día", value: fmtS(diariasKpis.prom), tone: "neutral" },
            { label: "Día pico", value: diariasKpis.pico.dia, tone: "success" },
            { label: "Monto pico", value: fmtS(diariasKpis.pico.total), tone: "primary" },
          ]}
        >
          <BulejeComposedChart
            data={data.comprasDiarias}
            xKey="dia"
            bars={[{ key: "total", label: "Compras S/", color: "primary", yAxis: "left" }]}
            leftAxisFormat={(v) => `S/${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
            tooltipFormat={(v) => fmtS(Number(v))}
            height={280}
            showLegend={false}
            minDataPoints={1}
          />
        </DashboardSection>
      ),
    },
    {
      id: "tendencia-mensual",
      span: "full",
      render: () => (
        <DashboardSection
          hideHeader
          kicker="Compras · rango activo"
          title="Tendencia mensual"
          kpis={[
            { label: "Total 6m", value: fmtS(mensualKpis.total), tone: "primary" },
            { label: "Promedio mes", value: fmtS(mensualKpis.prom), tone: "neutral" },
            { label: "Mejor mes", value: mensualKpis.best?.mes ?? "—", tone: "success" },
            { label: "Mes mínimo", value: mensualKpis.worst?.mes ?? "—", tone: "warning" },
          ]}
        >
          <BulejeComposedChart
            data={data.comprasMensuales}
            xKey="mes"
            bars={[{ key: "total", label: "Compras S/", color: "primary", yAxis: "left" }]}
            leftAxisFormat={(v) => `S/${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
            tooltipFormat={(v) => fmtS(Number(v))}
            height={280}
            showLegend={false}
            minDataPoints={2}
          />
        </DashboardSection>
      ),
    },
    {
      id: "top-proveedores-periodo",
      render: () => (
        <DashboardSection
          chartId="compras.top-proveedores-periodo"
          hasData={true}
          kicker="Proveedores · periodo"
          title="Top 10 proveedores por monto y órdenes"
          kpis={[
            {
              label: "Líder",
              value: data.comprasPorProveedor[0]?.nombre ?? "—",
              tone: "success",
            },
            {
              label: "Monto líder",
              value: fmtS(data.comprasPorProveedor[0]?.total ?? 0),
              tone: "primary",
            },
            {
              label: "OC líder",
              value: String(data.comprasPorProveedor[0]?.ordenes ?? 0),
              tone: "neutral",
            },
            {
              label: "Proveedores activos",
              value: String(data.comprasPorProveedor.length),
              tone: "neutral",
            },
          ]}
        >
          <BulejeComposedChart
            data={data.comprasPorProveedor.map((p) => ({
              proveedor: p.nombre.length > 14 ? p.nombre.slice(0, 13) + "…" : p.nombre,
              total: Math.round(p.total),
              ordenes: p.ordenes,
            }))}
            xKey="proveedor"
            bars={[{ key: "total", label: "Monto S/", color: "primary", yAxis: "left" }]}
            lines={[{ key: "ordenes", label: "Órdenes", color: "accent", yAxis: "right" }]}
            leftAxisFormat={(v) => `S/${(v / 1000).toFixed(0)}k`}
            rightAxisFormat={(v) => v.toString()}
            tooltipFormat={(v, name) =>
              name?.toLowerCase().includes("órdenes")
                ? Number(v).toString()
                : fmtS(Number(v))
            }
            height={300}
            minDataPoints={1}
          />
        </DashboardSection>
      ),
    },
    {
      id: "estado-cuentas",
      render: () => (
        <DashboardSection
          chartId="compras.estado-cuentas"
          hasData={true}
          kicker="Cuentas por pagar · estado"
          title="Distribución por estado de cuenta"
          kpis={[
            {
              label: "Deuda total",
              value: fmtS(data.deudaPendiente),
              tone: data.deudaPendiente > 0 ? "warning" : "success",
            },
            {
              label: "Vencidas",
              value: String(data.cuentasVencidas),
              tone: data.cuentasVencidas > 0 ? "warning" : "success",
            },
            {
              label: "Estados activos",
              value: String(data.estadoCuentas.length),
              tone: "neutral",
            },
            {
              label: "Monto pendiente",
              value: fmtS(data.estadoCuentas.reduce((s, e) => s + e.monto, 0)),
              tone: "primary",
            },
          ]}
        >
          <div className="flex items-center justify-center py-2">
            <div className="w-full max-w-md">
              <BulejeDonutChart
                data={data.estadoCuentas.map((e) => ({ name: e.estado, value: e.monto }))}
                height={260}
                format={(v) => fmtS(Number(v))}
                label={
                  <div className="text-center">
                    <p className="text-[length:var(--ts-3xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                      Total
                    </p>
                    <p className="text-lg font-extrabold text-[var(--text-primary)]">
                      {fmtS(data.deudaPendiente)}
                    </p>
                    <p className="text-[length:var(--ts-xs)] text-[var(--text-secondary)]">pendiente</p>
                  </div>
                }
              />
            </div>
          </div>
        </DashboardSection>
      ),
    },
    {
      id: "cuentas-por-vencer",
      render: () => (
        <DashboardSection
          chartId="compras.cuentas-por-vencer"
          hasData={true}
          kicker="Cuentas · próximos vencimientos"
          title="Días restantes para pagar"
          kpis={[
            {
              label: "Vencidas",
              value: String(cuentasKpis.vencidos),
              tone: cuentasKpis.vencidos > 0 ? "warning" : "success",
            },
            {
              label: "Urgentes (<7d)",
              value: String(cuentasKpis.urgentes),
              tone: cuentasKpis.urgentes > 0 ? "primary" : "success",
            },
            { label: "Total monto", value: fmtS(cuentasKpis.totalMonto), tone: "primary" },
            {
              label: "Más urgente",
              value: cuentasKpis.worst?.nombre?.slice(0, 18) ?? "—",
              tone: "warning",
            },
          ]}
        >
          <BulejeComposedChart
            data={cuentasChart}
            xKey="proveedor"
            bars={[{ key: "dias", label: "Días restantes", color: "primary", yAxis: "left" }]}
            lines={[
              { key: "monto", label: "Monto S/", color: "accent", yAxis: "right" },
            ]}
            leftAxisFormat={(v) => `${v}d`}
            rightAxisFormat={(v) => `S/${(v / 1000).toFixed(0)}k`}
            tooltipFormat={(v, name) =>
              name?.toLowerCase().includes("monto")
                ? fmtS(Number(v))
                : `${v} días`
            }
            height={280}
            minDataPoints={1}
          />
        </DashboardSection>
      ),
    },
    {
      id: "top-proveedores-historico",
      render: () => (
        <DashboardSection
          chartId="compras.top-proveedores-historico"
          hasData={true}
          kicker="Proveedores · histórico total"
          title="Top 10 proveedores acumulados"
          kpis={[
            { label: "Proveedores", value: String(data.totalProveedores), tone: "neutral" },
            {
              label: "Líder histórico",
              value: data.topProveedores[0]?.nombre.slice(0, 20) ?? "—",
              tone: "success",
            },
            {
              label: "Compras líder",
              value: fmtS(data.topProveedores[0]?.total ?? 0),
              tone: "primary",
            },
            {
              label: "OC líder",
              value: String(data.topProveedores[0]?.ordenes ?? 0),
              tone: "neutral",
            },
          ]}
        >
          <MicroList items={topProvRows} barColor="var(--brand-primary)" showRank />
        </DashboardSection>
      ),
    },
  ];

  return <DraggableSections items={sections} storageKey="compras-base-order" layout="column" gap={4} />;
}
