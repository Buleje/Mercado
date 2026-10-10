"use client";

/**
 * LothSeccionTabla — la tabla de una sección del libro, leída como un libro:
 * ordenable por columna, con selección, con la suma al pie y con las líneas
 * corregidas marcadas.
 *
 * Lo que agrega respecto de la tabla que vivía inline en el módulo:
 *  · **orden por columna** (antes sólo llegaba el orden del backend);
 *  · **selección múltiple** para etiquetas QR, exportar y anular en lote;
 *  · **totales** —un libro sin suma obliga a sacar la calculadora—, sin contar
 *    las anuladas, que se ven pero no cuadran;
 *  · el vínculo de **subsanación**: qué línea corrige a cuál;
 *  · el **autofiltro de Excel** en cada cabecera (Brandon 07-10): el estado de
 *    la sección vive en `useLothSeccionTabla`; acá sólo se dibuja;
 *  · **columnas que se eligen y se arrastran**, recordadas por sección
 *    (`loth-seccion-columnas`, 08-10); las celdas, en `loth-seccion-celdas`.
 */

import { DataTable } from "@buleje/design-system";
import { EnOrden } from "@/components/admin/shared/columnas-ordenables";
import LothLineaAcciones from "./LothLineaAcciones";
import type { FiltrosTabla } from "./filtros-tabla-forestal";
import { CAJA_TABLA, cabecerasSeccion, celdasLinea, PieSeccion, TABLA_PIE_FIJO, TD, TH, type ColDef } from "./loth-seccion-celdas";
import { soloEnOrden, useOrdenSeccion } from "./loth-seccion-columnas";
import { columnaDelTotal, textoTotal } from "./loth-seccion-cifras";
import type { LothEntryDTO, LothSection } from "@/lib/forestal/loth-constants";
import { totalesDe, type OrdenCampo, type OrdenDir } from "@/lib/forestal/loth-seccion";

export type { ColDef } from "./loth-seccion-celdas";

export default function LothSeccionTabla({
  section,
  entries,
  filasTotal,
  filtros,
  cols,
  loading,
  orden,
  dir,
  onOrdenar,
  seleccion,
  onSeleccionar,
  onSeleccionarTodo,
  corregidaPor,
  mesCerrado = false,
  onDetalle,
  onCadena,
  onDuplicar,
  onCorregir,
  onAnular,
}: {
  section: LothSection;
  /** Las líneas de la página que se ve. */
  entries: LothEntryDTO[];
  /** Todas las que pasan los filtros (todas las páginas): el pie suma éstas. */
  filasTotal?: readonly LothEntryDTO[];
  /** El autofiltro de cada columna (`useLothSeccionTabla`). */
  filtros?: FiltrosTabla<LothEntryDTO>;
  cols: ColDef[];
  loading: boolean;
  orden: OrdenCampo;
  dir: OrdenDir;
  onOrdenar: (campo: OrdenCampo) => void;
  seleccion: Set<string>;
  onSeleccionar: (id: string) => void;
  onSeleccionarTodo: () => void;
  corregidaPor: Map<number, number>;
  /** El período está cerrado: las líneas son inmutables (invariante P1). */
  mesCerrado?: boolean;
  onDetalle: (e: LothEntryDTO) => void;
  onCadena: (code: string) => void;
  onDuplicar: (e: LothEntryDTO) => void;
  onCorregir: (e: LothEntryDTO) => void;
  onAnular: (e: LothEntryDTO) => void;
}) {
  const totales = totalesDe([...(filasTotal ?? entries)]);
  const todasElegidas = entries.length > 0 && entries.every((e) => seleccion.has(e.id));
  /* El orden y las columnas visibles que eligió el operador (por sección). */
  const { orden: ordenCols, refCabecera } = useOrdenSeccion(cols);
  const cabeceras = cabecerasSeccion(cols, filtros, { orden, dir, onOrdenar });

  return (
    /* Una sola caja con scroll para los dos ejes (la del `DataTable`): la
       cabecera y el total quedan pegados arriba y abajo mientras se recorren
       las 50 líneas de la página, como en el patio del CTP. En el celular la
       tabla es tarjetas y la caja no recorta. */
    <DataTable
      stickyHeader
      wrapperClassName={CAJA_TABLA}
      className={`w-full text-sm ${TABLA_PIE_FIJO}`}
      data-seccion-tabla={section}
    >
      <thead ref={refCabecera} className="bg-[var(--surface-sunken)]">
        <tr>
          <th className={`${TH} w-10`}>
            <input
              type="checkbox"
              checked={todasElegidas}
              onChange={onSeleccionarTodo}
              aria-label="Seleccionar todas las líneas de la página"
              className="h-4 w-4 cursor-pointer accent-[var(--data-info-600)]"
            />
          </th>
          <EnOrden orden={ordenCols} celdas={soloEnOrden(ordenCols, cabeceras)} />
          <th className={`${TH} text-right`}>Acciones</th>
        </tr>
      </thead>

      <tbody>
        {entries.map((e) => {
          const elegida = seleccion.has(e.id);
          return (
            <tr
              key={e.id}
              className={`border-t border-[var(--rule-soft)] transition-colors hover:bg-[var(--surface-canvas)]/40 ${
                e.status === "anulado" ? "opacity-50" : ""
              } ${elegida ? "bg-[var(--data-info-500)]/10" : ""}`}
            >
              <td className={TD}>
                <input
                  type="checkbox"
                  checked={elegida}
                  onChange={() => onSeleccionar(e.id)}
                  aria-label={`Seleccionar la línea ${e.lineNo}`}
                  className="h-4 w-4 cursor-pointer accent-[var(--data-info-600)]"
                />
              </td>
              <EnOrden orden={ordenCols} celdas={soloEnOrden(ordenCols, celdasLinea(e, cols, corregidaPor.get(e.lineNo)))} />
              <td className={`${TD} whitespace-nowrap text-right`}>
                <LothLineaAcciones
                  e={e}
                  mesCerrado={mesCerrado}
                  onDetalle={onDetalle}
                  onCadena={onCadena}
                  onDuplicar={onDuplicar}
                  onCorregir={onCorregir}
                  onAnular={onAnular}
                />
              </td>
            </tr>
          );
        })}
      </tbody>

      {/* Pie: la suma. Un libro que no suma obliga a sacar la calculadora. */}
      {entries.length > 0 && !loading && (
        <tfoot className="border-t-2 border-[var(--rule-base)] bg-[var(--surface-sunken)]">
          <PieSeccion
            orden={ordenCols}
            cols={cols}
            totales={totales}
            total={textoTotal(section, totales)}
            columnaTotal={columnaDelTotal(section)}
          />
        </tfoot>
      )}
    </DataTable>
  );
}
