"use client";

/**
 * MarketplaceAdvancedCharts — los gráficos de la pestaña Marketplace del Inicio.
 *
 * 1. Embudo de pedidos (30 días)        4. Reseñas por estrellas (todas)
 * 2. Ingresos por mes (6 meses)          5. Esta semana vs la pasada
 * 3. Más vendidos (30 días)              6. Mapa franja × día (30 días)
 *
 * 2026-10-09 (Brandon: «ocultar gráficos que no tienen ninguna información…
 * y mejorarlos con buen diseño y formato»): cada gráfico se oculta con la regla
 * única de `lib/admin/inicio/hay-datos` (ver `queSeMuestra`), un solo eje Y,
 * color por concepto, soles con `soles()/solesEje()` y la ventana real en el
 * kicker (antes decía «rango activo» y eran 30 días fijos). Las cifras se
 * calculan igual que antes, en `vendor-dashboard/marketplace-metricas`.
 * Si la pestaña entera no tiene actividad, el paiche lo pone `VendorMarketplaceTab`.
 */

import { memo, useMemo, useState } from "react";
import { useDashboardData } from "@/contexts/dashboard-data-context";
import { DashboardSection, MicroList } from "./_shared";
import { DraggableSections, type DraggableItem } from "./DraggableSections";
import { COLOR_CONCEPTO, cantidad, porcentaje, soles, solesEje } from "@/lib/admin/inicio/formato-tablero";
import { kpiSinDato } from "@/lib/admin/inicio/hay-datos";
import { BarrasMarketplace } from "@/components/admin/vendor-dashboard/BarrasMarketplace";
import { EmbudoPedidos, MapaFranjaDia, RepartoResenas } from "@/components/admin/vendor-dashboard/MarketplaceVisuales";
import {
  distribucionResenas,
  embudoDePedidos,
  ingresosPorMes,
  mapaHorario,
  masVendidos,
  queSeMuestra,
  semanaContraLaPasada,
  type PedidoMarketplace,
  type ProductoMarketplace,
  type ResenaMarketplace,
} from "@/components/admin/vendor-dashboard/marketplace-metricas";

/** Variación % de la semana contra la anterior; sin base no hay variación. */
function variacion(actual: number, anterior: number): number | null {
  return anterior > 0 ? ((actual - anterior) / anterior) * 100 : null;
}

export const MarketplaceAdvancedCharts = memo(function MarketplaceAdvancedCharts() {
  const { data } = useDashboardData();
  // Snapshot del reloj al primer render: rango estable entre re-renders y sin
  // «Cannot call impure function» de react-hooks/purity.
  const [nowMs] = useState(() => Date.now());

  const orders = (data?.orders ?? []) as PedidoMarketplace[];
  const reviews = (data?.reviews ?? []) as ResenaMarketplace[];
  const products = (data?.products ?? []) as ProductoMarketplace[];

  const embudo = useMemo(() => embudoDePedidos(orders, nowMs), [orders, nowMs]);
  const mensual = useMemo(() => ingresosPorMes(orders, new Date(nowMs)), [orders, nowMs]);
  const top = useMemo(() => masVendidos(orders, products, nowMs), [orders, products, nowMs]);
  const resenas = useMemo(() => distribucionResenas(reviews), [reviews]);
  const semana = useMemo(() => semanaContraLaPasada(orders, nowMs), [orders, nowMs]);
  const mapa = useMemo(() => mapaHorario(orders, nowMs), [orders, nowMs]);
  const muestra = queSeMuestra({ embudo, mensual, top, resenas, semana, mapa });

  const lider = top.rows[0];
  const sections: DraggableItem[] = [
    {
      id: "funnel-pedidos",
      render: () => (
        <DashboardSection
          chartId="marketplace.advanced.funnel-pedidos"
          hasData={muestra.embudo}
          kicker="Pedidos · últimos 30 días"
          title="De pedido recibido a entregado"
          description="Cuántos de los pedidos que te llegaron avanzaron a cada etapa. Los cancelados se cuentan aparte."
          kpis={[
            {
              label: "Recibidos",
              value: cantidad(embudo.recibidos),
              sub: embudo.cancelados > 0 ? `${cantidad(embudo.cancelados)} cancelados` : "ninguno cancelado",
            },
            {
              label: "Entregados",
              value: cantidad(embudo.entregados),
              tone: embudo.conversion >= 80 ? "success" : embudo.conversion >= 60 ? "neutral" : "warning",
              sub: `${porcentaje(embudo.conversion)} de lo recibido`,
            },
          ]}
        >
          <EmbudoPedidos etapas={embudo.data} />
        </DashboardSection>
      ),
    },
    {
      id: "comparativa-semanal-mkt",
      render: () => (
        <DashboardSection
          chartId="marketplace.advanced.comparativa-semanal-mkt"
          hasData={muestra.semana}
          kicker="Ventas entregadas · por día"
          title="Esta semana vs la pasada"
          kpis={[
            {
              label: "Esta semana",
              value: soles(semana.actual),
              sinDato: kpiSinDato(semana.actual),
              sinDatoHint: "Todavía no entregaste pedidos en los últimos 7 días.",
              delta: variacion(semana.actual, semana.anterior),
              deltaLabel: "vs la pasada",
            },
            {
              label: "Semana pasada",
              value: soles(semana.anterior),
              sinDato: kpiSinDato(semana.anterior),
              sinDatoHint: "No hubo pedidos entregados entre hace 14 y hace 7 días.",
            },
          ]}
        >
          <BarrasMarketplace
            data={semana.rows}
            xKey="dia"
            series={[
              { key: "current", label: "Esta semana", color: COLOR_CONCEPTO.ventas },
              { key: "previous", label: "Semana pasada", color: COLOR_CONCEPTO.anterior },
            ]}
            formatoValor={soles}
            formatoCorto={solesEje}
            alto={220}
            ariaLabel={`Ventas entregadas por día: esta semana ${soles(semana.actual)}, la pasada ${soles(semana.anterior)}.`}
          />
        </DashboardSection>
      ),
    },
    {
      id: "ingresos-6m",
      span: "full",
      render: () => (
        <DashboardSection
          chartId="marketplace.advanced.ingresos-6m"
          hasData={muestra.mensual}
          kicker="Ventas entregadas · últimos 6 meses"
          title="Cómo viene tu facturación mensual"
          kpis={[
            { label: "Total 6 meses", value: soles(mensual.total), sub: `${cantidad(mensual.pedidos)} pedidos entregados` },
            { label: "Promedio por mes", value: soles(mensual.prom) },
            { label: "Mejor mes", value: mensual.best?.mesLargo ?? null, sub: mensual.best ? soles(mensual.best.ingresos) : undefined, tone: "success" },
          ]}
        >
          <BarrasMarketplace
            data={mensual.rows}
            xKey="mes"
            series={[{ key: "ingresos", label: "Ventas", color: COLOR_CONCEPTO.ventas }]}
            destacar={(f) => f.mes === mensual.best?.mes}
            formatoValor={soles}
            formatoCorto={solesEje}
            tituloTooltip={(f) => String(f.mesLargo ?? "")}
            extraTooltip={(f) => `${cantidad(f.pedidos)} pedidos entregados`}
            alto={240}
            ariaLabel={`Ventas entregadas por mes. Mejor mes: ${mensual.best?.mesLargo ?? "ninguno"}, ${soles(mensual.best?.ingresos)}.`}
          />
        </DashboardSection>
      ),
    },
    {
      id: "top-productos-marketplace",
      render: () => (
        <DashboardSection
          chartId="marketplace.advanced.top-productos-marketplace"
          hasData={muestra.top !== "oculto"}
          kicker="Más vendidos · últimos 30 días"
          title="Los productos que más te compran"
          kpis={[
            {
              label: "El más vendido",
              value: lider?.producto ?? null,
              sub: lider ? `${soles(lider.ingresos)} · ${cantidad(lider.unidades)} u` : undefined,
              tone: "success",
            },
            { label: "Suman", value: soles(top.sumaTop), sub: `${cantidad(top.rows.length)} productos` },
          ]}
        >
          {muestra.top === "lista" ? (
            <MicroList
              barColor={COLOR_CONCEPTO.ventas}
              items={top.rows.map((r) => ({ name: r.producto, value: r.ingresos, label: soles(r.ingresos), sublabel: `${cantidad(r.unidades)} unidades` }))}
            />
          ) : (
            <BarrasMarketplace
              data={top.rows}
              xKey="producto"
              horizontal
              series={[{ key: "ingresos", label: "Vendido", color: COLOR_CONCEPTO.ventas }]}
              formatoValor={soles}
              formatoCorto={solesEje}
              extraTooltip={(f) => `${cantidad(f.unidades)} unidades`}
              alto={Math.max(160, top.rows.length * 38)}
              ariaLabel={`Productos más vendidos. Primero: ${lider?.producto ?? "ninguno"}, ${soles(lider?.ingresos)}.`}
            />
          )}
        </DashboardSection>
      ),
    },
    {
      id: "ratings-marketplace",
      render: () => (
        <DashboardSection
          chartId="marketplace.advanced.ratings-marketplace"
          hasData={muestra.resenas}
          kicker="Reseñas · todas las fechas"
          title="Qué nota te dan tus clientes"
          kpis={[
            {
              label: "Nota promedio",
              value: `${resenas.promedio.toFixed(1)} / 5`,
              sub: `de ${cantidad(resenas.total)} ${resenas.total === 1 ? "reseña" : "reseñas"}`,
              tone: resenas.promedio >= 4 ? "success" : resenas.promedio >= 3 ? "neutral" : "warning",
            },
            {
              label: "Notas bajas",
              value: cantidad(resenas.malos),
              tone: resenas.malos > 0 ? "warning" : "success",
              hint: "Reseñas de 1 o 2 estrellas: léelas y responde para que el cliente vuelva.",
            },
          ]}
        >
          <RepartoResenas filas={resenas.arr} total={resenas.total} />
        </DashboardSection>
      ),
    },
    {
      id: "heatmap-marketplace",
      render: () => (
        <DashboardSection
          chartId="marketplace.advanced.heatmap-marketplace"
          hasData={muestra.mapa}
          kicker="Pedidos entregados · últimos 30 días"
          title="Cuándo te compran más"
          description="Cada casilla cuenta los pedidos entregados en esa franja de ese día de la semana. Más oscuro = más pedidos."
          kpis={[
            { label: "Momento pico", value: mapa.picoTexto, sub: `${cantidad(mapa.pico.valor)} pedidos` },
            {
              label: "Día más fuerte",
              value: mapa.diaFuerte?.nombre ?? null,
              sub: mapa.diaFuerte ? `${cantidad(mapa.diaFuerte.pedidos)} de ${cantidad(mapa.total)} pedidos` : undefined,
            },
          ]}
        >
          <MapaFranjaDia matrix={mapa.matrix} max={mapa.max} />
        </DashboardSection>
      ),
    },
  ];

  // 26rem: a 1280 px (≈60 rem de contenido) entran 2 por fila; con 36rem, el
  // default, iba uno por fila y la pestaña con datos medía 5,7 pantallas.
  // DraggableSections pone `gridAutoRows: 1fr` inline: TODAS las filas medían lo
  // que la más alta (a 400 px, ~300 px en blanco sobre el mapa). Con `auto` cada
  // fila mide lo suyo y las dos tarjetas de una fila siguen igualadas (stretch).
  return (
    <div className="[&_[style*=grid-auto-rows]]:[grid-auto-rows:auto]!">
      <DraggableSections items={sections} storageKey="marketplace-advanced-order" layout="grid" minColumnWidth="26rem" />
    </div>
  );
});
