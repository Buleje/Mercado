"use client";

/**
 * ComprasAdvancedCharts — gráficos opcionales de la pestaña Compras. Todos
 * arrancan APAGADOS (se prenden en «Gráficos») y, sin datos, figuran ahí como
 * «Sin datos todavía» (`hasData` con `lib/admin/inicio/hay-datos`).
 *
 * 1. ¿Dependo de pocos proveedores? — Pareto en UN eje de % (antes S/ y % en dos).
 * 2. Salud de las cuentas por pagar — % al día.
 * 3. Qué le compro a cada uno, día por día — mix de los 5 principales.
 * 4. Cómo cambió la deuda en 30 días — cascada (el punto de partida es estimado).
 * 5. Esta semana contra la anterior.
 * 6. Tus proveedores de siempre — ranking histórico (antes en los base).
 * «Año actual vs año pasado» se juntó con «Compras por mes» (ComprasCharts).
 */

import { memo, useMemo, type CSSProperties } from "react";
import { useDashboardData } from "@/contexts/dashboard-data-context";
import {
  BulejeComposedChart,
  BulejeGaugeChart,
  BulejeStackedBar,
  BulejeWaterfallChart,
  BulejeComparisonOverlay,
} from "@/components/ui-system/charts";
import { DashboardSection, MicroList } from "./_shared";
import { DraggableSections, type DraggableItem } from "./DraggableSections";
import { hayDatosEnSerie, hayFilas } from "@/lib/admin/inicio/hay-datos";
import { cantidad, COLOR_CONCEPTO, numeroEje, porcentaje, soles, solesEje } from "@/lib/admin/inicio/formato-tablero";
import type { ComprasData } from "./compras-presentacion";
import {
  cascadaDeDeuda,
  mixPorProveedor,
  paretoDeProveedores,
  saludDeCuentas,
  semanaContraAnterior,
  type CompraCruda,
  type CuentaCruda,
} from "./compras-avanzados";

/** Colores fijos por concepto: `--section-*` lo rota DraggableSections por posición. */
const VARS_PARETO = { "--section-secondary": COLOR_CONCEPTO.utilidad } as CSSProperties;
const VARS_MIX = { "--section-secondary": "var(--data-2)", "--section-tertiary": "var(--data-3)" } as CSSProperties;
const VARS_SEMANA = { "--section-primary": COLOR_CONCEPTO.compras, "--section-tertiary": COLOR_CONCEPTO.anterior } as CSSProperties;

export const ComprasAdvancedCharts = memo(function ComprasAdvancedCharts({
  topProveedores,
}: {
  topProveedores: ComprasData["topProveedores"];
}) {
  const { data } = useDashboardData();

  const purchases = (data?.purchases ?? []) as CompraCruda[];
  const payables = (data?.payables ?? []) as CuentaCruda[];

  // «Ahora» se toma cuando llegan los datos (cada 30 s), no en cada render.
  const pareto = useMemo(() => paretoDeProveedores(purchases, Date.now()), [purchases]);
  const salud = useMemo(() => saludDeCuentas(payables, Date.now()), [payables]);
  const mixProv = useMemo(() => mixPorProveedor(purchases, Date.now()), [purchases]);
  const waterfall = useMemo(() => cascadaDeDeuda(payables, Date.now()), [payables]);
  const comp = useMemo(() => semanaContraAnterior(purchases, Date.now()), [purchases]);

  const sections: DraggableItem[] = [
    {
      id: "pareto-proveedores",
      title: "¿Dependes de pocos proveedores?",
      render: () => (
        <DashboardSection
          chartId="compras.advanced.pareto"
          hasData={pareto.totalProvs >= 3}
          defaultVisible={false}
          kicker="Proveedores · últimos 30 días"
          title="¿Dependes de pocos proveedores?"
          description="Las barras son la parte de cada proveedor en lo que compraste; la línea, cuánto suman de a uno. Si 1 o 2 llegan al 80 %, dependes de ellos."
          kpis={[
            { label: "El 80 %", value: `${cantidad(pareto.provsFor80)} de ${cantidad(pareto.totalProvs)}`, sub: "proveedores lo suman" },
            { label: "Principal", value: porcentaje(pareto.rows[0]?.parte ?? null), sub: pareto.rows[0]?.proveedor },
          ]}
        >
          <div style={VARS_PARETO}>
            <BulejeComposedChart
              data={pareto.rows}
              xKey="proveedor"
              bars={[{ key: "parte", label: "Su parte", color: "purple", yAxis: "left" }]}
              lines={[{ key: "acumuladoPct", label: "Acumulado", color: "secondary", yAxis: "left" }]}
              leftAxisFormat={(v) => `${v}%`}
              tooltipFormat={(v) => porcentaje(v, 1)}
              tooltipExtras={(f) => `Le compraste ${soles(f.monto)}`}
              valueFormat={(v) => porcentaje(v)}
              minDataPoints={1}
              height={300}
            />
          </div>
        </DashboardSection>
      ),
    },
    {
      id: "salud-cuentas",
      title: "Cuentas por pagar al día",
      render: () => (
        <DashboardSection
          chartId="compras.advanced.salud-cuentas"
          hasData={salud.total > 0}
          defaultVisible={false}
          kicker="Cuentas por pagar · hoy"
          title="Cuentas por pagar al día"
          description="Qué parte de tus cuentas por pagar vence en más de 7 días. Lo vencido y lo que vence esta semana baja el porcentaje."
          kpis={[
            { label: "Vencidas", value: salud.vencidas > 0 ? cantidad(salud.vencidas) : "Ninguna", tone: salud.vencidas > 0 ? "warning" : "neutral" },
            { label: "Por vencer", value: salud.urgente > 0 ? cantidad(salud.urgente) : "Ninguna", sub: "en 7 días" },
            { label: "Al día", value: cantidad(salud.ok), sub: `de ${cantidad(salud.total)}` },
          ]}
        >
          <div className="flex items-center justify-center py-2">
            <BulejeGaugeChart
              value={salud.pct}
              max={100}
              label="Al día"
              sublabel={salud.pct >= 90 ? "Excelente" : salud.pct >= 70 ? "Bien" : salud.pct >= 50 ? "Atención" : "Crítico"}
              format="percentage"
              size={240}
            />
          </div>
        </DashboardSection>
      ),
    },
    {
      id: "mix-proveedores",
      title: "Qué le compras a cada uno, día por día",
      render: () => (
        <DashboardSection
          chartId="compras.advanced.mix-proveedores"
          hasData={mixProv.topProvs.length >= 2 && mixProv.rows.length >= 2}
          defaultVisible={false}
          kicker="Proveedores · últimos 14 días"
          title="Qué le compras a cada uno, día por día"
          description="Cada barra es un día con compras, partida por tus 5 proveedores principales."
        >
          <div style={VARS_MIX}>
            <BulejeStackedBar
              data={mixProv.rows}
              xKey="day"
              stacks={mixProv.stacks}
              yAxisFormat={(v) => numeroEje(v).replace(/ /g, "\u00a0")}
              tooltipFormat={(v) => soles(v)}
              height={300}
            />
          </div>
        </DashboardSection>
      ),
    },
    {
      id: "waterfall-deuda",
      span: "full",
      title: "Cómo cambió tu deuda en 30 días",
      render: () => (
        <DashboardSection
          chartId="compras.advanced.deuda-30d"
          hasData={waterfall.nuevaDeuda > 0 || waterfall.pagado > 0}
          defaultVisible={false}
          kicker="Cuentas por pagar · últimos 30 días"
          title="Cómo cambió tu deuda en 30 días"
          description="«Hace 30 d» es una estimación: la deuda de hoy, menos las cuentas nuevas de estos 30 días, más lo que ya pagaste de esas cuentas."
          kpis={[
            { label: "Nuevas", value: soles(waterfall.nuevaDeuda), sinDato: waterfall.nuevaDeuda === 0, sub: "cuentas en 30 días" },
            { label: "Pagaste", value: soles(waterfall.pagado), sinDato: waterfall.pagado === 0, sub: "de esas cuentas" },
            { label: "Debes hoy", value: waterfall.deudaActual > 0 ? soles(waterfall.deudaActual) : "Nada" },
          ]}
        >
          <BulejeWaterfallChart steps={waterfall.steps} formatValue={soles} height={280} />
        </DashboardSection>
      ),
    },
    {
      id: "comparativa-semana",
      title: "Esta semana contra la anterior",
      render: () => (
        <DashboardSection
          chartId="compras.advanced.comparativa-semana"
          hasData={hayDatosEnSerie(comp.rows, ["current", "previous"], { minPuntos: 2 })}
          defaultVisible={false}
          kicker="Compras · últimos 14 días"
          title="Esta semana contra la anterior"
        >
          <div style={VARS_SEMANA}>
            <BulejeComparisonOverlay
              data={comp.rows}
              xKey="day"
              currentKey="current"
              previousKey="previous"
              currentLabel="Últimos 7 días"
              previousLabel="7 días antes"
              yAxisFormat={solesEje}
              tooltipFormat={(v) => soles(v)}
              height={260}
            />
          </div>
        </DashboardSection>
      ),
    },
    {
      id: "top-proveedores-historico",
      title: "Tus proveedores de siempre",
      render: () => (
        <DashboardSection
          chartId="compras.top-proveedores-historico"
          hasData={hayFilas(topProveedores)}
          defaultVisible={false}
          kicker="Proveedores · desde el inicio"
          title="Tus proveedores de siempre"
        >
          <MicroList
            barColor={COLOR_CONCEPTO.compras}
            items={topProveedores.map((p) => ({
              name: p.nombre,
              value: p.total,
              label: soles(p.total),
              sublabel: `${cantidad(p.ordenes)} ${p.ordenes === 1 ? "compra" : "compras"}`,
            }))}
          />
        </DashboardSection>
      ),
    },
  ];

  return <DraggableSections items={sections} storageKey="compras-advanced-order" layout="column" gap={1.5} />;
});
