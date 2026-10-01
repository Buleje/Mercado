"use client";

/**
 * Los dos gráficos del reporte.
 *
 * 1. **Progreso**: PT por día / semana / mes en barras, con el acumulado (a
 *    dónde se llega) o el promedio (si el cubo estuvo arriba o abajo de lo de
 *    siempre). Una sola unidad —PT— en el eje: mezclar m³ y PT en el mismo
 *    gráfico obliga a leer dos escalas para una misma madera.
 * 2. **Composición**: la misma barra partida por dueño, permiso o especie, y a
 *    su lado el ranking con las cifras. La barra dice CUÁNDO; el ranking,
 *    CUÁNTO — el número exacto no se lee de una barra apilada.
 *
 * Lo no declarado (sin dueño, sin permiso) tiene su propio tramo gris arriba
 * de la pila: esconderlo en «Otros» haría creer que todo tiene dueño.
 */

import { CardTitle } from "@buleje/design-system";
import { ArrowUpRight } from "@buleje/design-system/icons";
import SegmentedControl from "@/components/ui-system/SegmentedControl";
import { BulejeComposedChart, BulejeStackedBar, CHART_PALETTE } from "@/components/ui-system/charts";
import { fmtM3, fmtPiezas, fmtPt } from "@/lib/forestal/cubicacion-formato";
import { etiquetaLarga } from "@/lib/forestal/semana-de-registro";
import { formatNumber } from "@/lib/format";
import type { DimensionReporte, ReporteDeProduccion, SerieReporte } from "@/lib/forestal/reportes-produccion";
import type { LineaDeProgreso } from "../hooks/use-reporte-produccion";

type ColorSerie = "primary" | "accent" | "amber" | "info" | "purple" | "tertiary" | "quaternary";
const COLORES_DATO: readonly ColorSerie[] = ["accent", "primary", "amber", "info", "purple"];

/** El color de cada serie: lo declarado rota; lo que falta, gris; «Otros», gris claro. */
export function coloresDeSeries(series: readonly SerieReporte[]): ColorSerie[] {
  let i = 0;
  return series.map((s) =>
    s.tipo === "sin-dato" ? "tertiary" : s.tipo === "otros" ? "quaternary" : COLORES_DATO[i++ % COLORES_DATO.length]!,
  );
}

const NOMBRE_CUBO = { dia: "día", semana: "semana", mes: "mes" } as const;
const NOMBRE_DIMENSION: Record<DimensionReporte, { titulo: string; falta: string }> = {
  dueno: { titulo: "Dueño", falta: "sin dueño declarado" },
  permiso: { titulo: "Permiso", falta: "sin permiso declarado" },
  especie: { titulo: "Especie", falta: "sin especie declarada" },
};
/** Con más barras que esto, los números encima se pisan: se leen en el tooltip. */
const BARRAS_CON_NUMERO = 16;
const TOPE_RANKING = 8;

const compacto = (v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1).replace(/\.0$/, "")}k` : String(v));
const enPt = (v: number | string) => `${fmtPt(Number(v))} PT`;

function Bloque({ titulo, meta, acciones, children }: { titulo: string; meta?: string; acciones?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <CardTitle as="h3" className="text-base font-bold text-[var(--text-primary)]">
            {titulo}
          </CardTitle>
          {meta && <p className="text-sm tabular-nums text-[var(--text-secondary)]">{meta}</p>}
        </div>
        {acciones}
      </div>
      {children}
    </section>
  );
}

export function ReportesProgreso({
  reporte,
  linea,
  onLinea,
}: {
  reporte: ReporteDeProduccion;
  linea: LineaDeProgreso;
  onLinea: (l: LineaDeProgreso) => void;
}) {
  const { cubos, agrupacion, totales } = reporte;
  const promedio = cubos.length > 0 ? Math.round(totales.pt / cubos.length) : 0;
  const datos = cubos.map((c) => ({
    x: c.etiqueta,
    PT: c.pt,
    Acumulado: c.ptAcumulado,
    Promedio: promedio,
    enCurso: c.enCurso,
    titulo: c.titulo,
  }));
  const cubo = NOMBRE_CUBO[agrupacion];
  const meta = [
    `promedio ${fmtPt(promedio)} PT por ${cubo}`,
    reporte.mejorDia ? `mejor día: ${etiquetaLarga(reporte.mejorDia.dia)}, ${fmtPt(reporte.mejorDia.pt)} PT` : null,
    reporte.mejorSemana && agrupacion !== "dia"
      ? `mejor semana: ${reporte.mejorSemana.etiqueta}, ${fmtPt(reporte.mejorSemana.pt)} PT`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Bloque
      titulo={`Progreso por ${cubo}`}
      meta={meta}
      acciones={
        <SegmentedControl<LineaDeProgreso>
          label="Qué dice la línea"
          value={linea}
          onChange={onLinea}
          options={[
            { value: "acumulado", label: "Acumulado" },
            { value: "promedio", label: "Promedio" },
          ]}
        />
      }
    >
      <BulejeComposedChart
        data={datos}
        xKey="x"
        bars={[{ key: "PT", label: "PT producidos", color: "accent" }]}
        lines={
          linea === "acumulado"
            ? [{ key: "Acumulado", label: "PT acumulados", color: "primary", yAxis: "right" }]
            : [{ key: "Promedio", label: `Promedio por ${cubo}`, color: "primary" }]
        }
        height={280}
        minDataPoints={1}
        showValues={cubos.length <= BARRAS_CON_NUMERO}
        valueFormat={(v) => (v === 0 ? "" : compacto(v))}
        leftAxisFormat={compacto}
        rightAxisFormat={compacto}
        tooltipFormat={enPt}
        tooltipExtras={(e) =>
          e.enCurso ? (
            <span className="text-xs text-[var(--text-tertiary)]">{String(e.titulo)} · todavía en curso</span>
          ) : null
        }
        maxXTicks={18}
      />
      {agrupacion === "dia" && cubos.length > 92 && (
        <p className="mt-2 text-sm text-[var(--text-tertiary)]">
          {cubos.length} días en un gráfico se leen mal: agrupa por semana para ver la tendencia.
        </p>
      )}
    </Bloque>
  );
}

export function ReportesComposicion({
  reporte,
  dimension,
  onDimension,
  onIr,
}: {
  reporte: ReporteDeProduccion;
  dimension: DimensionReporte;
  onDimension: (d: DimensionReporte) => void;
  onIr?: (vista: string) => void;
}) {
  const series = reporte.series[dimension];
  const colores = coloresDeSeries(series);
  /* Claves `s0…sN` y no el nombre: recharts lee un `dataKey` con puntos como
     una ruta («CC.NN. San Luis» buscaría `CC` → `NN`…) y la serie sale vacía. */
  const datos = reporte.cubos.map((c) => ({
    x: c.etiqueta,
    ...Object.fromEntries(series.map((s, i) => [`s${i}`, c.pila[dimension][s.clave] ?? 0])),
  }));
  const partes = reporte.partes[dimension];
  const colorDe = new Map(series.map((s, i) => [s.clave, colores[i]!]));
  const sinDato = partes.find((p) => p.sinDato && p.pt > 0);
  const { titulo, falta } = NOMBRE_DIMENSION[dimension];

  return (
    <Bloque
      titulo={`Por ${titulo.toLowerCase()}`}
      meta={`${partes.length} ${dimension === "especie" ? "especie(s)" : dimension === "dueno" ? "dueño(s)" : "permiso(s)"} con producción en el período`}
      acciones={
        <SegmentedControl<DimensionReporte>
          label="Partir la producción por"
          value={dimension}
          onChange={onDimension}
          options={[
            { value: "dueno", label: "Dueño" },
            { value: "permiso", label: "Permiso" },
            { value: "especie", label: "Especie" },
          ]}
        />
      }
    >
      {/* Mitad y mitad sólo desde xl: con 26 rem fijos el ranking no entraba
          y la columna del % quedaba cortada (medido a 1280). Debajo, apilados. */}
      <div className="grid gap-4 xl:grid-cols-2">
        <BulejeStackedBar
          data={datos}
          xKey="x"
          stacks={series.map((s, i) => ({ key: `s${i}`, label: s.etiqueta, color: colores[i] }))}
          height={280}
          yAxisFormat={compacto}
          tooltipFormat={enPt}
          /* La leyenda es la lista de al lado (mismos colores). La del gráfico
             se montaba sobre las fechas del eje a 400 px. */
          showLegend={false}
        />
        <div className="min-w-0">
          {/* Lista y no tabla: en el celular una tabla se vuelve una tarjeta
              por renglón (400 px de alto cada una) y a 1280 la columna del %
              quedaba cortada. Hace también de leyenda del gráfico: el color de
              cada renglón es el de su tramo. */}
          <ul className="divide-y divide-[var(--rule-soft)]" aria-label={`Producción por ${titulo.toLowerCase()}`}>
            {partes.slice(0, TOPE_RANKING).map((p) => {
              const color = colorDe.get(p.clave) ?? "quaternary";
              return (
                <li key={p.clave} className="py-2" title={p.titulo}>
                  <div className="flex items-baseline gap-2">
                    <span
                      aria-hidden
                      className="h-3 w-3 shrink-0 self-center rounded-sm"
                      style={{ background: CHART_PALETTE[color] }}
                    />
                    <span
                      className={`min-w-0 flex-1 truncate text-sm ${p.sinDato ? "italic text-[var(--text-secondary)]" : "font-semibold text-[var(--text-primary)]"}`}
                    >
                      {p.etiqueta}
                    </span>
                    <span className="shrink-0 text-sm font-bold tabular-nums text-[var(--text-primary)]">
                      {fmtPt(p.pt)} PT
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 pl-5">
                    <span aria-hidden className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--surface-sunken)]">
                      <span
                        className="block h-full rounded-full"
                        style={{ width: `${Math.min(100, p.pct)}%`, background: CHART_PALETTE[color] }}
                      />
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-[var(--text-secondary)]">
                      {formatNumber(p.pct, 1)} % · {fmtM3(p.m3)} m³ · {fmtPiezas(p.piezas)} pzas
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
          {partes.length > TOPE_RANKING && (
            <p className="mt-1.5 text-sm text-[var(--text-tertiary)]">
              y {partes.length - TOPE_RANKING} más: están todos en el Excel.
            </p>
          )}
          {sinDato && sinDato.pct >= 1 && (
            <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-[var(--data-warning-500)]/12 px-3 py-2 text-sm text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
              <span>
                <strong>{formatNumber(sinDato.pct, 1)} %</strong> del PT ({fmtPt(sinDato.pt)} PT, {sinDato.corridas}{" "}
                {sinDato.corridas === 1 ? "corrida" : "corridas"}) está {falta}.
              </span>
              {onIr && dimension !== "especie" && (
                <button
                  type="button"
                  onClick={() => onIr("produccion")}
                  className="inline-flex items-center gap-1 font-bold underline underline-offset-2"
                >
                  Completarlo en Producción <ArrowUpRight className="h-4 w-4" aria-hidden />
                </button>
              )}
            </p>
          )}
        </div>
      </div>
    </Bloque>
  );
}
