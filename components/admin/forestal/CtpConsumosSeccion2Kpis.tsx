"use client";

/**
 * Las cifras del cuadro «Sección 2 · Consumos» (ADR-345/400/431).
 *
 * Reflejan lo FILTRADO —igual que el CSV—, así el número y lo que se baja
 * coinciden. Los filtros viven en la barra pegada al cuadro; acá dentro sólo va
 * la nota de qué recortó las cifras (antes eran los mismos filtros repetidos).
 *
 * Cuatro tarjetas: la de «corridas sin origen» salió — es deuda y la dice
 * `CtpAvisoSinOrigen`, una sola vez.
 */

import { Flame, Gauge, Leaf, TreePine } from "@buleje/design-system/icons";
import { StatCard } from "@buleje/design-system";
import type { CtpPeriod } from "@/lib/forestal/ctp-period";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { formatNumber } from "@/lib/format";
import { useKpisPlegables } from "./kpis-plegables";
import { NotaFiltrosKpi, notaDeFiltros } from "./CtpKpiFiltros";
import type { EstadoConsumosSeccion2 } from "./hooks/use-consumos-seccion2";

const nf = (n: number) => formatNumber(n);

/**
 * Los indicadores del cuadro como `{ boton, panel }` (2026-09-24): el botón va
 * en el encabezado del cuadro, al lado de «Opciones», y el panel debajo del
 * título — antes era una fila suelta entre el aviso y el cuadro.
 */
export function useSeccion2Kpis(s2: EstadoConsumosSeccion2, period: CtpPeriod) {
  const { visibles, filas, total, especies, resumen, veredicto, filtro } = s2;
  const nota = notaDeFiltros([
    { label: "Búsqueda", valores: filtro.texto.trim() ? [`«${filtro.texto.trim()}»`] : [] },
    { label: "Especie", valor: filtro.especie },
    { label: "Permiso", valor: filtro.permiso },
    { label: "Guía", valor: filtro.gtf },
  ]);

  return useKpisPlegables({
      alto: "sm",
      claveMemoria: "consumos-seccion2",
      filtrosActivos: s2.cuantosFiltros,
      filtros: <NotaFiltrosKpi nota={nota} onLimpiar={s2.limpiar} />,
      resumen:
        s2.cargandoInicial
          ? "Leyendo los consumos del período…"
          : visibles.length === 0
            ? "Sin consumos en el período"
            : `${nf(visibles.length)} consumo${visibles.length === 1 ? "" : "s"} · ${fmtM3(total)} m³ a la sierra` +
              (resumen.rendimientoPct != null ? ` · ${resumen.rendimientoPct} %` : ""),
      tarjetas: [
        <StatCard
          key="consumos"
          density="compact"
          label="Consumos"
          value={nf(visibles.length)}
          subValue={visibles.length === filas.length ? period.label : `de ${nf(filas.length)} · filtrado`}
          icon={Flame}
          emphasis="neutral"
        />,
        <StatCard
          key="volumen"
          density="compact"
          label="Volumen consumido"
          value={`${fmtM3(total)} m³`}
          subValue="Entró a la sierra"
          icon={TreePine}
          emphasis="neutral"
        />,
        <StatCard
          key="especies"
          density="compact"
          label="Especies"
          value={nf(especies)}
          subValue={especies === 1 ? "Una sola especie" : "Distintas en el período"}
          icon={Leaf}
          emphasis="neutral"
        />,
        /* De lo que entró a la sierra, ¿cuánto salió? */
        <StatCard
          key="rendimiento"
          density="compact"
          label="Rendimiento"
          value={resumen.rendimientoPct != null ? `${resumen.rendimientoPct}%` : "—"}
          subValue={
            resumen.rendimientoPct != null
              ? `${fmtM3(Number(resumen.producido))} m³ producidos · ${veredicto.texto}`
              : resumen.corridasOtraUnidad > 0
                ? `${resumen.corridasOtraUnidad} corrida(s) en otra unidad`
                : "Sin producción declarada todavía"
          }
          icon={Gauge}
          /* Neutral: el verde y el ámbar del valor del StatCard no llegan a 3:1
             en claro (axe, 24-09). El veredicto va escrito debajo. */
          emphasis="neutral"
        />,
      ],
  });
}
