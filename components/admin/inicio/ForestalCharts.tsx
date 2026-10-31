"use client";

import { useMemo } from "react";
import { BulejeComposedChart } from "@/components/ui-system/charts";
import { EnlacePanel } from "@/components/admin/shared/EnlacePanel";
import { numeroEje } from "@/lib/admin/inicio/formato-tablero";
import { formatNumber } from "@/lib/format";
import { cantidadDelPeriodo, simboloDeUnidad, type InicioForestalCtp } from "@/lib/forestal/inicio-forestal";
import { DatosEnLinea, TarjetaTablero } from "./resumen/TarjetaTablero";
import { CTP, m3, PuntoLeyenda, TINTA } from "./forestal/comun";
import { alcance, hayGraficoForestal, PASO_TXT, rotulo, tramosConMovimiento } from "./forestal/serie";

/**
 * Las tres series en el orden en que viaja la madera. Los colores salen de
 * `.charts-forestal` (globals.css), los mismos del Libro CTP, y no rotan con la
 * posición de la tarjeta: entra = pizarra, se produce = turquesa, sale = coral.
 */
const SERIES = [
  { key: "ingreso", label: "Ingresado", ranura: "primary", color: TINTA.entra },
  { key: "producido", label: "Producido", ranura: "accent", color: TINTA.producto },
  { key: "despachado", label: "Despachado", ranura: "amber", color: TINTA.sale },
] as const;

const TRAMO: Record<InicioForestalCtp["serie"]["paso"], { mejor: string; con: string }> = {
  dia: { mejor: "Día con más ingreso", con: "Días con ingreso" },
  semana: { mejor: "Semana con más ingreso", con: "Semanas con ingreso" },
  mes: { mejor: "Mes con más ingreso", con: "Meses con ingreso" },
};

/**
 * Ingresado vs producido vs despachado, por semana (2026-10-31: tarjeta del
 * tablero denso, como las del Resumen).
 *
 * Las barras son las del Tablero del Libro CTP (`movimientoDelLibro`)
 * agrupadas en semanas con su mismo corte (lunes): la suma de las barras es la
 * cifra de arriba. No se dibuja (R2 del tablero, 09-10) mientras ninguna serie
 * tenga 2 tramos con movimiento: serían tres barras sueltas que ya dice la
 * tira. La leyenda va en el orden de la madera (la de Recharts las ordena por
 * nombre) y dice en qué unidad está cada serie, porque el eje no la lleva.
 */
export function ForestalCharts({ ctp, className }: { ctp: InicioForestalCtp; className?: string }) {
  const { serie } = ctp;
  const datos = useMemo(
    () =>
      tramosConMovimiento(serie).map((p) => ({
        x: rotulo(p.fecha, serie.paso),
        alcance: alcance(p.fecha, serie.paso),
        ingreso: p.ingresoM3,
        producido: p.producido,
        despachado: p.despachado,
      })),
    [serie],
  );
  if (!hayGraficoForestal(serie)) return null;

  /* Producido y despachado van con SU unidad sólo si el período entero declara
     en una (`cantidadDelPeriodo`); ingresado es siempre m³ de troza. */
  const { unidadProducido: uProd, unidadDespachado: uDesp } = ctp;
  const unidad: Record<(typeof SERIES)[number]["key"], string> = {
    ingreso: "m³ de troza",
    producido: uProd ? simboloDeUnidad(uProd) : "varias unidades",
    despachado: uDesp ? simboloDeUnidad(uDesp) : "varias unidades",
  };
  // El tramo de más ingreso y cuántos tuvieron: se leen de las barras, no se calculan.
  const mejor = datos.reduce((a, d) => (d.ingreso > a.ingreso ? d : a), datos[0]);
  const conIngreso = datos.filter((d) => d.ingreso > 0).length;
  const t = TRAMO[serie.paso];

  return (
    <TarjetaTablero
      id="forestal-movimiento"
      titulo={`Lo que entró, se produjo y salió · ${PASO_TXT[serie.paso]}`}
      ayuda={`Del Tablero del Libro CTP, el mismo cálculo y el mismo período: ingresos validados, producción declarada y despachos registrados. Cada barra es un tramo (la semana arranca el lunes) y la suma de las barras es la cifra de arriba. ${
        uProd == null || uDesp == null
          ? "Lo producido o lo despachado mezcla unidades (m³ con pt o unidades): cada barra suma las cantidades tal cual, como el Tablero, y por eso va sin unidad."
          : `Ingresado en m³ de troza; producido en ${simboloDeUnidad(uProd)} y despachado en ${simboloDeUnidad(uDesp)}.`
      }${ctp.serieTruncada ? " El período es muy largo: el Tablero cortó el eje en 400 tramos." : ""}`}
      className={className}
      datos={
        <DatosEnLinea
          datos={[
            { label: t.mejor, valor: mejor.ingreso > 0 ? m3(mejor.ingreso) : null, extra: mejor.x },
            { label: t.con, valor: `${formatNumber(conIngreso)} de ${formatNumber(datos.length)}` },
          ]}
        />
      }
      pie={
        <EnlacePanel href={`${CTP}&vista=tablero`} className="inline-flex min-h-11 items-center">
          Ver el Tablero del Libro CTP
        </EnlacePanel>
      }
    >
      <ul className="mb-2 flex flex-wrap gap-x-5 gap-y-1.5 text-sm" aria-label="Qué es cada color">
        {SERIES.map((s) => (
          <PuntoLeyenda key={s.key} color={s.color} texto={s.label} detalle={unidad[s.key]} />
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
        height={260}
        minDataPoints={1}
        maxXTicks={14}
      />
    </TarjetaTablero>
  );
}
