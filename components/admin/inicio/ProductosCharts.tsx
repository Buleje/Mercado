"use client";

/**
 * ProductosCharts — charts base del módulo Productos.
 *
 * Rediseñado con DashboardSection + primitivas Buleje DS + DraggableSections.
 */

import { useMemo } from "react";
import type { ProductosData } from "./ProductosDashboard";
import { BulejeComposedChart } from "@/components/ui-system/charts";
import { DashboardSection, MicroList } from "./_shared";
import { DraggableSections, type DraggableItem } from "./DraggableSections";
import { Link2 } from "@buleje/design-system/icons";

function fmtS(v: number) {
  return `S/ ${v.toLocaleString("es-PE", { maximumFractionDigits: 0 })}`;
}
function fmtU(v: number) {
  return `${v.toLocaleString("es-PE")} u`;
}

export default function ProductosCharts({ data }: { data: ProductosData }) {
  const topIngresos = useMemo(() => {
    const total = data.topProductos.reduce((s, p) => s + p.ingresos, 0);
    const utilidad = data.topProductos.reduce((s, p) => s + p.utilidad, 0);
    const margenAvg = total > 0 ? Math.round((utilidad / total) * 100) : 0;
    const unidades = data.topProductos.reduce((s, p) => s + p.unidades, 0);
    return { total, utilidad, margenAvg, unidades };
  }, [data.topProductos]);

  const paretoKpis = useMemo(() => {
    const total = data.paretoData.length;
    const top80 = data.paretoData.filter((p) => p.acumulado <= 80).length;
    return { top80, total };
  }, [data.paretoData]);

  const topProductosRows = data.topProductos.slice(0, 10).map((p) => ({
    name: p.nombre.length > 22 ? p.nombre.slice(0, 21) + "…" : p.nombre,
    value: p.ingresos,
    label: `${fmtS(p.ingresos)} · ${p.unidades}u`,
    sublabel: `Util. ${fmtS(p.utilidad)}`,
  }));

  const sinMovRows = data.productosSinMov.slice(0, 10).map((p) => ({
    name: p.nombre.length > 22 ? p.nombre.slice(0, 21) + "…" : p.nombre,
    value: (p.stock ?? 0) * p.precio,
    label: `${fmtU(p.stock ?? 0)} · ${fmtS((p.stock ?? 0) * p.precio)}`,
    sublabel: p.categoria,
  }));

  const valorZombie = data.productosSinMov.reduce(
    (s, p) => s + (p.stock ?? 0) * p.precio,
    0,
  );

  const stockChart = data.stockProjection.slice(0, 10).map((p) => ({
    producto: p.nombre.length > 14 ? p.nombre.slice(0, 13) + "…" : p.nombre,
    dias: Math.min(p.diasRestantes, 90),
    stock: p.stock,
  }));

  const stockKpis = useMemo(() => {
    const critico = data.stockProjection.filter((p) => p.status === "critico").length;
    const alerta = data.stockProjection.filter((p) => p.status === "alerta").length;
    const worst = data.stockProjection[0];
    return { critico, alerta, worst };
  }, [data.stockProjection]);

  const catChart = data.ventasPorCategoria.map((c) => ({
    categoria: c.nombre,
    total: Math.round(c.total),
  }));

  const catKpis = useMemo(() => {
    const total = data.ventasPorCategoria.reduce((s, c) => s + c.total, 0);
    const lider = data.ventasPorCategoria[0];
    const share = lider && total > 0 ? Math.round((lider.total / total) * 100) : 0;
    return { total, lider: lider?.nombre ?? "—", share, count: data.ventasPorCategoria.length };
  }, [data.ventasPorCategoria]);

  const sections: DraggableItem[] = [
    {
      id: "top-10-productos",
      render: () => (
        <DashboardSection
          hideHeader
          kicker="Rankings · top 10 del periodo"
          title="Los productos que más venden"
          kpis={[
            { label: "Ingresos top-10", value: fmtS(topIngresos.total), tone: "primary" },
            { label: "Utilidad top-10", value: fmtS(topIngresos.utilidad), tone: "success" },
            {
              label: "Margen prom.",
              value: `${topIngresos.margenAvg}%`,
              tone: topIngresos.margenAvg >= 25 ? "success" : "warning",
            },
            { label: "Uds. top-10", value: fmtU(topIngresos.unidades), tone: "neutral" },
          ]}
        >
          <MicroList items={topProductosRows} barColor="var(--brand-primary)" showRank />
        </DashboardSection>
      ),
    },
    {
      id: "abc-pareto",
      span: "full",
      render: () => (
        <DashboardSection
          hideHeader
          kicker="ABC analysis · concentración de ingresos"
          title="Top 20 productos con curva acumulada 80/20"
          kpis={[
            { label: "Total en pareto", value: String(paretoKpis.total), tone: "neutral" },
            { label: "Clase A (≤80%)", value: String(data.claseA), tone: "success" },
            { label: "Clase B (≤95%)", value: String(data.claseB), tone: "primary" },
            { label: "Clase C (resto)", value: String(data.claseC), tone: "neutral" },
          ]}
        >
          <BulejeComposedChart
            data={data.paretoData.map((p) => ({
              producto: p.nombre.length > 14 ? p.nombre.slice(0, 13) + "…" : p.nombre,
              ingresos: Math.round(p.ingresos),
              acumuladoPct: Math.round(p.acumulado * 10) / 10,
            }))}
            xKey="producto"
            bars={[{ key: "ingresos", label: "Ingresos S/", color: "primary", yAxis: "left" }]}
            lines={[
              { key: "acumuladoPct", label: "Acumulado %", color: "accent", yAxis: "right" },
            ]}
            leftAxisFormat={(v) => `S/${(v / 1000).toFixed(0)}k`}
            rightAxisFormat={(v) => `${v}%`}
            tooltipFormat={(v, name) =>
              name?.toLowerCase().includes("acumulado")
                ? `${Number(v).toFixed(1)}%`
                : fmtS(Number(v))
            }
            height={320}
            minDataPoints={1}
          />
        </DashboardSection>
      ),
    },
    {
      id: "ventas-categoria",
      render: () => (
        <DashboardSection
          hideHeader
          kicker="Categorías · periodo"
          title="Ingresos por categoría"
          kpis={[
            { label: "Categorías activas", value: String(catKpis.count), tone: "neutral" },
            { label: "Líder", value: catKpis.lider, tone: "success" },
            {
              label: "Share líder",
              value: `${catKpis.share}%`,
              tone: catKpis.share >= 40 ? "warning" : "neutral",
            },
            { label: "Total", value: fmtS(catKpis.total), tone: "primary" },
          ]}
        >
          <BulejeComposedChart
            data={catChart}
            xKey="categoria"
            bars={[{ key: "total", label: "Ingresos S/", color: "primary", yAxis: "left" }]}
            leftAxisFormat={(v) => `S/${(v / 1000).toFixed(0)}k`}
            tooltipFormat={(v) => fmtS(Number(v))}
            height={280}
            showLegend={false}
            minDataPoints={1}
          />
        </DashboardSection>
      ),
    },
    {
      id: "stock-proyeccion",
      span: "full",
      render: () => (
        <DashboardSection
          hideHeader
          kicker="Riesgo · proyección top 10"
          title="Días hasta agotarse"
          kpis={[
            {
              label: "Crítico (<7d)",
              value: String(stockKpis.critico),
              tone: stockKpis.critico > 0 ? "warning" : "success",
            },
            {
              label: "Alerta (<14d)",
              value: String(stockKpis.alerta),
              tone: stockKpis.alerta > 0 ? "primary" : "success",
            },
            {
              label: "Más urgente",
              value: stockKpis.worst?.nombre?.slice(0, 16) ?? "—",
              tone: "warning",
            },
            {
              label: "Días urgente",
              value: `${stockKpis.worst?.diasRestantes ?? 0}d`,
              tone: "warning",
            },
          ]}
        >
          <BulejeComposedChart
            data={stockChart}
            xKey="producto"
            bars={[{ key: "dias", label: "Días restantes", color: "primary", yAxis: "left" }]}
            lines={[{ key: "stock", label: "Stock", color: "accent", yAxis: "right" }]}
            leftAxisFormat={(v) => `${v}d`}
            rightAxisFormat={(v) => v.toString()}
            tooltipFormat={(v, name) =>
              name?.toLowerCase().includes("días") ? `${v} días` : `${v} u`
            }
            height={280}
            minDataPoints={1}
          />
        </DashboardSection>
      ),
    },
    {
      id: "sin-movimiento",
      render: () => (
        <DashboardSection
          hideHeader
          kicker="Dead stock · top 10 zombies"
          title="Productos sin movimiento · capital inmovilizado"
          kpis={[
            {
              label: "Zombies",
              value: String(data.sinMovimiento),
              tone: data.sinMovimiento > 10 ? "warning" : "neutral",
            },
            { label: "Capital inmovilizado", value: fmtS(valorZombie), tone: "warning" },
            { label: "Total activos", value: String(data.productosActivos), tone: "neutral" },
            {
              label: "% del catálogo",
              value: `${data.productosActivos > 0 ? Math.round((data.sinMovimiento / data.productosActivos) * 100) : 0}%`,
              tone: "neutral",
            },
          ]}
        >
          {sinMovRows.length > 0 ? (
            <MicroList items={sinMovRows} barColor="var(--data-warning)" showRank />
          ) : (
            <div className="rounded-lg border border-dashed border-[var(--rule-base)] p-8 text-center text-sm text-[var(--text-tertiary)]">
              Sin productos zombies — todo rota ✓
            </div>
          )}
        </DashboardSection>
      ),
    },
    {
      id: "afinidades",
      render: () => (
        <DashboardSection
          hideHeader
          kicker="Análisis de cesta · co-compra"
          title="Pares que se venden juntos"
          kpis={[
            { label: "Pares detectados", value: String(data.afinidades.length), tone: "primary" },
            {
              label: "Co-compras máx",
              value: String(data.afinidades[0]?.coCompras ?? 0),
              tone: "success",
            },
            {
              label: "Co-compras min",
              value: String(data.afinidades[data.afinidades.length - 1]?.coCompras ?? 0),
              tone: "neutral",
            },
            {
              label: "Promedio",
              value: String(
                data.afinidades.length
                  ? Math.round(
                      data.afinidades.reduce((s, a) => s + a.coCompras, 0) /
                        data.afinidades.length,
                    )
                  : 0,
              ),
              tone: "neutral",
            },
          ]}
        >
          {data.afinidades.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[var(--rule-base)] p-8 text-center text-sm text-[var(--text-tertiary)]">
              Aún no hay suficiente data para detectar afinidades (mínimo 2 co-compras).
            </div>
          ) : (
            <ul className="space-y-2">
              {data.afinidades.map((a, i) => {
                const max = data.afinidades[0]?.coCompras || 1;
                const width = Math.round((a.coCompras / max) * 100);
                return (
                  <li
                    key={i}
                    className="relative rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-3 overflow-hidden"
                  >
                    <div
                      className="absolute inset-y-0 left-0 bg-[var(--accent-soft)] transition-all"
                      style={{ width: `${width}%` }}
                    />
                    <div className="relative flex items-center gap-3">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--surface-raised)] border border-[var(--rule-base)] text-[10px] font-bold text-[var(--text-tertiary)] shrink-0">
                        {i + 1}
                      </span>
                      <span className="text-sm font-semibold text-[var(--text-primary)] truncate">
                        {a.productoA}
                      </span>
                      <Link2 className="h-3.5 w-3.5 text-[var(--text-tertiary)] shrink-0" />
                      <span className="text-sm font-semibold text-[var(--text-primary)] truncate">
                        {a.productoB}
                      </span>
                      <span className="ml-auto text-xs font-bold text-[var(--text-secondary)] shrink-0">
                        {a.coCompras}× juntos
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </DashboardSection>
      ),
    },
  ];

  return <DraggableSections items={sections} storageKey="productos-base-order" layout="grid" />;
}
