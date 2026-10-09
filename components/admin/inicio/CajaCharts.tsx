"use client";

/**
 * CajaCharts — gráficos base de la pestaña Caja del Inicio.
 *
 * Cada sección responde UNA pregunta del dueño y se oculta sola si no tiene
 * con qué responderla (regla única `lib/admin/inicio/hay-datos`):
 *  1. Día por día — ¿qué días entró y salió plata? (barras, un solo eje)
 *  2. Cómo te pagan — ¿efectivo o digital? (lista; donut desde 3 métodos)
 *  3. De lo que vendiste a lo que te queda — cascada ventas → utilidad (opcional)
 *  4. Mes a mes — últimos 6 meses
 *  5. Cobros de hoy por hora — ¿a qué hora se mueve la caja?
 *  6. Cuánto te queda de cada sol (gauge, opcional)
 *
 * Colores fijos por concepto (`COLOR_CONCEPTO`): entra = teal, sale = coral,
 * lo que queda = tinta, en esta pestaña y en las demás.
 */

import { useMemo } from "react";
import { coloresFijos, colorDeMetodo, ejeSoles, type CajaData } from "./caja-presentacion";
import {
  BulejeComposedChart,
  BulejeDonutChart,
  BulejeGaugeChart,
  BulejeWaterfallChart,
  type WaterfallStep,
} from "@/components/ui-system/charts";
import { DashboardSection, MicroList } from "./_shared";
import { DraggableSections, type DraggableItem } from "./DraggableSections";
import { hayDatosEnSerie, hayTendencia, kpiSinDato, modoRanking, valorConDato } from "@/lib/admin/inicio/hay-datos";
import { cantidad, COLOR_CONCEPTO, fechaConDia, porcentaje, soles, solesEje } from "@/lib/admin/inicio/formato-tablero";

/** Entra teal (ranura primary) y sale coral (ranura amber) en todos los gráficos de caja. */
export const COLORES_FLUJO = coloresFijos({ primary: COLOR_CONCEPTO.cajaEntra, amber: COLOR_CONCEPTO.cajaSale });
const SERIES_FLUJO = [
  { key: "ingresos", label: "Entró", color: "primary" as const, yAxis: "left" as const },
  { key: "egresos", label: "Salió", color: "amber" as const, yAxis: "left" as const },
];
const tooltipSoles = (v: number | string) => soles(v);
const etiquetaSoles = (v: number) => (v === 0 ? "" : solesEje(v));

/** «Quedó: -S/ 599.90» bajo el tooltip del día o del mes. */
function lineaQuedo(entry: Record<string, unknown>) {
  const neto = Number(entry.ingresos ?? 0) - Number(entry.egresos ?? 0);
  return (
    <p className={`mt-1 text-xs font-bold ${neto < 0 ? "text-[var(--data-warning-500)]" : "text-[var(--text-primary)]"}`}>
      Quedó: {soles(neto)}
    </p>
  );
}

export default function CajaCharts({ data, periodo }: { data: CajaData; periodo: string }) {
  const dias = data.flujoDiario;
  const diaFlujo = useMemo(() => {
    const masEntro = dias.reduce<CajaData["flujoDiario"][number] | null>((b, d) => (d.ingresos > (b?.ingresos ?? 0) ? d : b), null);
    const masSalio = dias.reduce<CajaData["flujoDiario"][number] | null>((b, d) => (d.egresos > (b?.egresos ?? 0) ? d : b), null);
    return { masEntro, masSalio, enRojo: dias.filter((d) => d.balance < 0).length };
  }, [dias]);

  const meses = useMemo(() => {
    const conMovimiento = data.flujoMensual
      .filter((m) => m.ingresos !== 0 || m.egresos !== 0)
      .map((m) => ({ ...m, neto: m.ingresos - m.egresos }));
    const orden = [...conMovimiento].sort((a, b) => b.neto - a.neto);
    return { mejor: orden[0], peor: orden.length > 1 ? orden[orden.length - 1] : undefined };
  }, [data.flujoMensual]);

  const horas = useMemo(() => {
    const activas = data.ingresosPorHora.filter((h) => h.monto > 0);
    const pico = activas.reduce<{ hora: string; monto: number } | null>((b, h) => (h.monto > (b?.monto ?? 0) ? h : b), null);
    const total = activas.reduce((s, h) => s + h.monto, 0);
    return { activas: activas.length, pico, promedio: activas.length ? total / activas.length : null };
  }, [data.ingresosPorHora]);

  const metodos = data.metodosPago.filter((m) => valorConDato(m.monto));
  const modoMetodos = modoRanking(metodos, "monto");
  const efectivo = metodos.find((m) => m.metodo === "Efectivo");
  const digital = metodos.filter((m) => m.metodo !== "Efectivo").reduce((a, m) => a + m.monto, 0);
  const totalCobrado = metodos.reduce((a, m) => a + m.monto, 0);
  const digitalPct = totalCobrado > 0 ? (digital / totalCobrado) * 100 : 0;

  // Cascada: sin el «Inicio = 0» de relleno ni pasos en cero; el total siempre.
  const waterfallSteps: WaterfallStep[] = useMemo(
    () =>
      data.waterfall
        .filter((w) => w.tipo === "balance" || valorConDato(w.monto))
        .map((w) => ({
          label: w.concepto,
          value: w.monto,
          type: w.tipo === "balance" ? "total" : w.monto >= 0 ? "positive" : "negative",
        })),
    [data.waterfall],
  );

  const ratioLiquido = data.ingresos > 0 ? Math.max(0, Math.min(100, (data.balance / data.ingresos) * 100)) : 0;

  const sections: DraggableItem[] = [
    {
      id: "flujo-14d",
      render: () => (
        <DashboardSection
          chartId="caja.flujo-diario"
          hasData={hayTendencia(dias, ["ingresos", "egresos"])}
          kicker={`Caja · ${periodo}`}
          title="Día por día"
          description="Barras de lo que entró y salió cada día con movimiento (hasta 14 días). Pasa el mouse para ver lo que quedó."
          kpis={[
            {
              label: "Más cobro", value: soles(diaFlujo.masEntro?.ingresos), tone: "success",
              sinDato: !diaFlujo.masEntro, sinDatoHint: "Ningún día con cobros en el período.",
              sub: diaFlujo.masEntro ? fechaConDia(diaFlujo.masEntro.fecha) : undefined,
            },
            {
              label: "Más salida", value: soles(diaFlujo.masSalio?.egresos), tone: "warning",
              sinDato: !diaFlujo.masSalio, sinDatoHint: "Ningún día con compras en el período.",
              sub: diaFlujo.masSalio ? fechaConDia(diaFlujo.masSalio.fecha) : undefined,
            },
            {
              label: "En rojo", value: cantidad(diaFlujo.enRojo),
              tone: diaFlujo.enRojo > 0 ? "warning" : "success",
              hint: "Días en que salió más plata de la que entró.",
              sub: `de ${cantidad(dias.length)} días`,
            },
          ]}
        >
          <div style={COLORES_FLUJO}>
            <BulejeComposedChart
              data={dias}
              xKey="dia"
              bars={SERIES_FLUJO}
              leftAxisFormat={ejeSoles}
              tooltipFormat={tooltipSoles}
              tooltipExtras={lineaQuedo}
              showValues={dias.length <= 10}
              valueFormat={etiquetaSoles}
              height={300}
            />
          </div>
        </DashboardSection>
      ),
    },
    {
      id: "metodo-pago",
      render: () => (
        <DashboardSection
          chartId="caja.metodo-pago"
          hasData={modoMetodos !== "oculto"}
          kicker={`Cobros · ${periodo}`}
          title="Cómo te pagan"
          kpis={[
            {
              label: "Efectivo", value: porcentaje(totalCobrado > 0 ? ((efectivo?.monto ?? 0) / totalCobrado) * 100 : null),
              sinDato: !efectivo, sinDatoHint: "Nada cobrado en efectivo en el período.",
              sub: efectivo ? soles(efectivo.monto) : undefined,
            },
            {
              label: "Digital", value: porcentaje(digitalPct), hint: "Yape, Plin, tarjeta y transferencias.",
              sinDato: kpiSinDato(digital), sinDatoHint: "Todo te lo pagaron en efectivo.",
              sub: soles(digital),
            },
          ]}
        >
          <div className={modoMetodos === "grafico" ? "grid grid-cols-1 items-center gap-5 @xl:grid-cols-5" : ""}>
            {modoMetodos === "grafico" && (
              <div className="@xl:col-span-2">
                <BulejeDonutChart
                  data={metodos.map((m) => ({ name: m.metodo, value: m.monto }))}
                  colors={metodos.map((m) => colorDeMetodo(m.metodo))}
                  height={200}
                  format={(v) => soles(v)}
                  label={
                    <span className="block text-center">
                      <span className="block text-lg font-extrabold text-[var(--text-primary)]">{porcentaje(metodos[0]?.porcentaje)}</span>
                      <span className="block text-xs text-[var(--text-secondary)]">{metodos[0]?.metodo}</span>
                    </span>
                  }
                />
              </div>
            )}
            <div className={modoMetodos === "grafico" ? "@xl:col-span-3" : ""}>
              <MicroList
                items={metodos.slice(0, 5).map((m) => ({
                  name: m.metodo, value: m.monto, label: soles(m.monto),
                  sublabel: porcentaje(m.porcentaje), color: colorDeMetodo(m.metodo),
                }))}
              />
            </div>
          </div>
        </DashboardSection>
      ),
    },
    {
      id: "waterfall-flujo",
      render: () => (
        <DashboardSection
          chartId="caja.waterfall-flujo"
          hasData={waterfallSteps.some((s) => valorConDato(s.value))}
          kicker={`Utilidad · ${periodo}`}
          title="De lo que vendiste a lo que te queda"
          description="Ventas del mostrador y pedidos, menos el costo de lo vendido («Costo») y las compras del período."
          defaultVisible={false}
        >
          <div style={coloresFijos({ accent: COLOR_CONCEPTO.ventas, primary: COLOR_CONCEPTO.utilidad })}>
            <BulejeWaterfallChart
              steps={waterfallSteps}
              formatValue={solesEje}
              height={280}
              className="rounded-none border-0 bg-transparent p-0"
            />
          </div>
        </DashboardSection>
      ),
    },
    {
      id: "tendencia-mensual",
      render: () => (
        <DashboardSection
          chartId="caja.tendencia-mensual"
          hasData={hayTendencia(data.flujoMensual, ["ingresos", "egresos"])}
          kicker="Caja · últimos 6 meses"
          title="Mes a mes"
          kpis={[
            { label: "Mejor mes", value: soles(meses.mejor?.neto), sinDato: !meses.mejor, sub: meses.mejor?.mes, tone: (meses.mejor?.neto ?? 0) < 0 ? "warning" : "success", hint: "El mes en que más quedó (entró − salió)." },
            ...(meses.peor ? [{ label: "Peor mes", value: soles(meses.peor.neto), sub: meses.peor.mes, tone: meses.peor.neto < 0 ? ("warning" as const) : ("neutral" as const), hint: "El mes en que menos quedó." }] : []),
          ]}
        >
          <div style={COLORES_FLUJO}>
            <BulejeComposedChart
              data={data.flujoMensual}
              xKey="mes"
              bars={SERIES_FLUJO}
              leftAxisFormat={ejeSoles}
              tooltipFormat={tooltipSoles}
              tooltipExtras={lineaQuedo}
              valueFormat={etiquetaSoles}
              height={260}
            />
          </div>
        </DashboardSection>
      ),
    },
    {
      id: "ingresos-por-hora",
      render: () => (
        <DashboardSection
          chartId="caja.ingresos-por-hora"
          hasData={hayDatosEnSerie(data.ingresosPorHora, ["monto"])}
          kicker="Hoy · por hora"
          title="Cobros de hoy por hora"
          kpis={[
            { label: "Hora pico", value: horas.pico?.hora ?? null, sub: horas.pico ? soles(horas.pico.monto) : undefined, tone: "success" },
            { label: "Horas con cobro", value: cantidad(horas.activas), sub: horas.promedio !== null ? `prom. ${soles(horas.promedio)} por hora` : undefined },
          ]}
        >
          <div style={COLORES_FLUJO}>
            <BulejeComposedChart
              data={data.ingresosPorHora}
              xKey="hora"
              bars={[{ key: "monto", label: "Cobrado", color: "primary", yAxis: "left" }]}
              leftAxisFormat={ejeSoles}
              tooltipFormat={tooltipSoles}
              valueFormat={etiquetaSoles}
              height={240}
              showLegend={false}
              minDataPoints={1}
            />
          </div>
        </DashboardSection>
      ),
    },
    {
      id: "ratio-liquido",
      render: () => (
        <DashboardSection
          chartId="caja.ratio-liquido"
          hasData={valorConDato(data.ingresos)}
          defaultVisible={false}
          kicker={`Caja · ${periodo}`}
          title="Cuánto te queda de cada sol"
          description="Lo que quedó (entró − salió) sobre lo que entró. Si salió más de lo que entró, marca 0 %."
          kpis={[
            { label: "Quedó", value: soles(data.balance), tone: data.balance < 0 ? "warning" : "success" },
            { label: "Entró", value: soles(data.ingresos) },
          ]}
        >
          <div className="flex items-center justify-center py-2">
            <BulejeGaugeChart
              value={ratioLiquido}
              max={100}
              label="De cada S/ 100 que entran"
              sublabel={ratioLiquido >= 30 ? "Vas bien" : ratioLiquido >= 10 ? "Vigila lo que sale" : "Sale casi todo"}
              format="percentage"
              size={260}
            />
          </div>
        </DashboardSection>
      ),
    },
  ];

  // Columna, no grilla: la grilla iguala TODAS las filas a la más alta
  // (gridAutoRows 1fr) y dejaba ~200 px en blanco sobre «Mes a mes» y «Por hora».
  return <DraggableSections items={sections} storageKey="caja-base-order" layout="column" gap={1} />;
}
