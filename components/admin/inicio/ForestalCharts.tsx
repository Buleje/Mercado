"use client";

import { useMemo } from "react";
import { BulejeComposedChart } from "@/components/ui-system/charts";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { formatNumber } from "@/lib/format";
import { hayTendencia } from "@/lib/admin/inicio/hay-datos";
import { fechaConDia, fechaCorta, MESES_CORTOS, numeroEje, partesDeFecha } from "@/lib/admin/inicio/formato-tablero";
import { cantidadDelPeriodo, simboloDeUnidad, type InicioForestalCtp } from "@/lib/forestal/inicio-forestal";
import { DashboardSection } from "./_shared";

type Paso = InicioForestalCtp["serie"]["paso"];

const m3 = (n: number) => `${formatNumber(n, 2)} m³`;
const PASO_TXT: Record<Paso, string> = { dia: "por día", semana: "por semana", mes: "por mes" };

/**
 * Las tres series en el orden en que viaja la madera. Los colores salen de
 * `.charts-forestal` (globals.css), los mismos del Libro CTP, y no rotan con la
 * posición de la tarjeta: entra = pizarra, se produce = turquesa, sale = coral.
 */
const SERIES = [
  { key: "ingreso", label: "Ingresado", ranura: "primary" },
  { key: "producido", label: "Producido", ranura: "accent" },
  { key: "despachado", label: "Despachado", ranura: "amber" },
] as const;

/** «28 set» para días y semanas (la semana arranca el lunes); «oct 2026» para meses. */
function rotulo(fecha: string, paso: Paso): string {
  if (paso !== "mes") return fechaCorta(fecha);
  const p = partesDeFecha(fecha);
  return p ? `${MESES_CORTOS[p.mes - 1]} ${p.anio}` : fecha;
}

/** Qué abarca la barra, para el tooltip: «Semana del 28 set al 04 oct» · «jueves 01/10». */
function alcance(fecha: string, paso: Paso): string {
  if (paso === "dia") return fechaConDia(fecha);
  if (paso === "mes") return "";
  const p = partesDeFecha(fecha);
  if (!p) return "";
  const domingo = new Date(Date.UTC(p.anio, p.mes - 1, p.dia + 6)).toISOString().slice(0, 10);
  return `Semana del ${fechaCorta(fecha)} al ${fechaCorta(domingo)}`;
}

/**
 * Ingresado vs producido vs despachado, por semana.
 *
 * Las barras son las del Tablero del Libro CTP (`movimientoDelLibro`)
 * agrupadas en semanas con su mismo corte (lunes): la suma de las barras es el
 * número de las tarjetas de arriba.
 *
 * Se oculta (R2 del tablero, 09-10) mientras ninguna serie tenga 2 semanas con
 * movimiento: con una sola semana son tres barras sueltas que ya dicen las
 * tarjetas. La leyenda va en el orden de la madera (la de Recharts las ordena
 * por nombre) y dice en qué unidad está cada serie, porque el eje no la lleva.
 */
export function ForestalCharts({ ctp }: { ctp: InicioForestalCtp }) {
  const { serie } = ctp;
  /* Las semanas vacías del PRINCIPIO no se dibujan: con «Año», 30 semanas en
     cero dejaban las barras de un pelo. Las del medio sí (un hueco sin ingreso
     es justo lo que hay que ver) y los totales no cambian: son ceros. */
  const desde = Math.max(0, serie.puntos.findIndex((p) => p.ingresoM3 > 0 || p.producido > 0 || p.despachado > 0));
  const datos = useMemo(
    () =>
      serie.puntos.slice(desde).map((p) => ({
        x: rotulo(p.fecha, serie.paso),
        alcance: alcance(p.fecha, serie.paso),
        ingreso: p.ingresoM3,
        producido: p.producido,
        despachado: p.despachado,
      })),
    [serie.puntos, serie.paso, desde],
  );
  /* Producido y despachado van con SU unidad sólo si el período entero declara
     en una (`cantidadDelPeriodo`); ingresado es siempre m³ de troza. */
  const { unidadProducido: uProd, unidadDespachado: uDesp } = ctp;
  const mezcla = uProd == null || uDesp == null;
  const unidad: Record<(typeof SERIES)[number]["key"], string> = {
    ingreso: "m³ de troza",
    producido: uProd ? simboloDeUnidad(uProd) : "varias unidades",
    despachado: uDesp ? simboloDeUnidad(uDesp) : "varias unidades",
  };

  return (
    <DashboardSection
      chartId="forestal.movimiento-semanal"
      hasData={hayTendencia(datos, ["ingreso", "producido", "despachado"])}
      className="charts-forestal"
      kicker={`Libro CTP · ${PASO_TXT[serie.paso]}`}
      title="Lo que entró, se produjo y salió"
      rightSlot={
        <InfoTip
          side="left"
          title="De dónde salen las barras"
          what="Del Tablero del Libro CTP, el mismo cálculo y el mismo período: ingresos validados, producción declarada y despachos registrados. Cada barra es una semana que arranca el lunes; la suma de las barras es la cifra de cada tarjeta."
          affects={
            mezcla
              ? "Lo producido o lo despachado de este período mezcla unidades (m³ con pt o unidades): cada barra suma las cantidades tal cual, como el Tablero, y por eso va sin unidad."
              : `Ingresado en m³ de troza; producido en ${simboloDeUnidad(uProd)} y despachado en ${simboloDeUnidad(uDesp)}, la unidad en que se declararon. Si un período mezcla unidades, van sin unidad, como en el Tablero.`
          }
          example={ctp.serieTruncada ? "El período es muy largo: el Tablero cortó el eje en 400 tramos." : "Una semana con ingreso alto y producción baja es madera que se acumula en el patio."}
        />
      }
    >
      <ul className="mb-2 flex flex-wrap gap-x-5 gap-y-1.5 text-sm" aria-label="Qué es cada color">
        {SERIES.map((s) => (
          <li key={s.key} className="inline-flex items-center gap-2">
            <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: `var(--section-${s.ranura})` }} aria-hidden />
            <span className="font-bold text-[var(--text-primary)]">{s.label}</span>
            <span className="text-[var(--text-tertiary)]">{unidad[s.key]}</span>
          </li>
        ))}
      </ul>
      <BulejeComposedChart
        data={datos}
        xKey="x"
        bars={SERIES.map((s) => ({ key: s.key, label: s.label, color: s.ranura }))}
        showLegend={false}
        leftAxisFormat={(v) => numeroEje(v)}
        valueFormat={(v) => numeroEje(v)}
        tooltipFormat={(v, nombre) =>
          nombre === "Producido"
            ? cantidadDelPeriodo(Number(v), uProd)
            : nombre === "Despachado"
              ? cantidadDelPeriodo(Number(v), uDesp)
              : m3(Number(v))
        }
        tooltipExtras={(e) => (typeof e.alcance === "string" && e.alcance ? <span>{e.alcance}</span> : null)}
        height={280}
        minDataPoints={1}
        maxXTicks={14}
      />
    </DashboardSection>
  );
}
