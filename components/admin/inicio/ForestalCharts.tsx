"use client";

import { useMemo } from "react";
import { BulejeComposedChart } from "@/components/ui-system/charts";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { formatNumber } from "@/lib/format";
import { cantidadDelPeriodo, simboloDeUnidad, type InicioForestalCtp } from "@/lib/forestal/inicio-forestal";
import { DashboardSection } from "./_shared";

const m3 = (n: number) => `${formatNumber(n, 2)} m³`;
const PASO_TXT = { dia: "por día", semana: "por semana", mes: "por mes" } as const;

/**
 * Ingresado vs producido vs despachado, por semana.
 *
 * Las barras son las del Tablero del Libro CTP (`movimientoDelLibro`)
 * agrupadas en semanas con su mismo corte (lunes): la suma de las barras es el
 * número de las tarjetas de arriba. Tres colores fijos que se repiten en todo
 * el Inicio forestal: ingreso = tinta, producido = turquesa, despacho = coral.
 */
export function ForestalCharts({ ctp }: { ctp: InicioForestalCtp }) {
  const { serie } = ctp;
  /* Las semanas vacías del PRINCIPIO no se dibujan: con «Año», 30 semanas en
     cero dejaban las barras de un pelo. Las del medio sí (un hueco sin ingreso
     es justo lo que hay que ver) y los totales no cambian: son ceros. */
  const desde = Math.max(0, serie.puntos.findIndex((p) => p.ingresoM3 > 0 || p.producido > 0 || p.despachado > 0));
  const puntos = useMemo(() => serie.puntos.slice(desde), [serie.puntos, desde]);
  const datos = useMemo(
    () =>
      puntos.map((p) => ({
        semana: p.etiqueta,
        ingreso: p.ingresoM3,
        producido: p.producido,
        despachado: p.despachado,
      })),
    [puntos],
  );
  const hayMovimiento = puntos.some((p) => p.ingresoM3 > 0 || p.producido > 0 || p.despachado > 0);
  const mayor = (k: "ingresoM3" | "producido") =>
    puntos.reduce<(typeof puntos)[number] | null>((a, p) => (p[k] > (a?.[k] ?? 0) ? p : a), null);
  const topIngreso = mayor("ingresoM3");
  const topProducido = mayor("producido");
  /* Producido y despachado van con SU unidad sólo si el período entero declara
     en una (`cantidadDelPeriodo`); ingresado es siempre m³ de troza. */
  const { unidadProducido: uProd, unidadDespachado: uDesp } = ctp;
  const mezcla = uProd == null || uDesp == null;

  return (
    <DashboardSection
      chartId="forestal.movimiento-semanal"
      hasData={hayMovimiento}
      kicker={`Libro CTP · ${PASO_TXT[serie.paso]}${desde > 0 && puntos.length > 0 ? ` · desde ${puntos[0].etiqueta}` : ""}`}
      title="Ingresado, producido y despachado"
      rightSlot={
        <InfoTip
          side="left"
          title="De dónde salen las barras"
          what="Del Tablero del Libro CTP, el mismo cálculo y el mismo período: ingresos validados, producción declarada y despachos registrados. Cada barra es una semana que arranca el lunes."
          affects={
            mezcla
              ? "Lo producido o lo despachado de este período mezcla unidades (m³ con pt o unidades): cada barra suma las cantidades tal cual, como el Tablero, y por eso va sin unidad."
              : `Ingresado en m³ de troza; producido en ${simboloDeUnidad(uProd)} y despachado en ${simboloDeUnidad(uDesp)}, la unidad en que se declararon. Si un período mezcla unidades, van sin unidad, como en el Tablero.`
          }
          example={ctp.serieTruncada ? "El período es muy largo: el Tablero cortó el eje en 400 tramos." : "Una semana con ingreso alto y producción baja es madera que se acumula en el patio."}
        />
      }
      kpis={[
        { label: topIngreso ? `Más ingreso · ${topIngreso.etiqueta}` : "Más ingreso", value: topIngreso ? m3(topIngreso.ingresoM3) : "—", tone: "primary", hint: "La semana que más madera entró" },
        { label: topProducido ? `Más producción · ${topProducido.etiqueta}` : "Más producción", value: topProducido ? cantidadDelPeriodo(topProducido.producido, uProd) : "—", tone: "success", hint: "La semana que más salió de la sierra" },
        { label: "Troza consumida", value: m3(ctp.consumoM3), tone: "neutral" },
        { label: "Rendimiento", value: ctp.rendimiento > 0 ? `${formatNumber(ctp.rendimiento, 1)} %` : "Sin dato", tone: "neutral", hint: "Ponderado por m³ consumidos; sólo corridas declaradas en m³" },
      ]}
    >
      <BulejeComposedChart
        data={datos}
        xKey="semana"
        bars={[
          { key: "ingreso", label: "Ingresado", color: "primary" },
          { key: "producido", label: "Producido", color: "accent" },
          { key: "despachado", label: "Despachado", color: "amber" },
        ]}
        leftAxisFormat={(v) => `${formatNumber(v, 0)}`}
        tooltipFormat={(v, serie) =>
          serie === "Producido"
            ? cantidadDelPeriodo(Number(v), uProd)
            : serie === "Despachado"
              ? cantidadDelPeriodo(Number(v), uDesp)
              : m3(Number(v))
        }
        height={300}
        minDataPoints={1}
        maxXTicks={14}
      />
    </DashboardSection>
  );
}
