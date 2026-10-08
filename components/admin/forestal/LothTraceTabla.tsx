"use client";

/**
 * LothTraceTabla — la misma información de las tarjetas, en densidad de hoja de
 * fiscalización. El código del árbol abre su ventana de detalle, igual que en
 * las tarjetas (la cadena de custodia se abre desde ahí).
 *
 * Reemplaza al cuadro «Censo vs realidad» que vivía debajo de la lista: era la
 * misma pregunta contestada por segunda vez, con otros decimales y sin las
 * columnas de tiempo. Acá hay una fila por árbol —incluidos los censados que
 * siguen en pie— y cada número sale de la MISMA fila fusionada que alimenta la
 * tarjeta, así que no pueden discrepar.
 *
 * Al nivel de las Secciones (backlog L11, 08-10): UNA tabla para los dos tramos
 * («En movimiento» y «Terminados» son filas de grupo, no dos tablas), en su caja
 * con la cabecera y el total fijos; columnas que se ocultan, se arrastran y se
 * recuerdan (`loth-seccion-columnas`, clave `loth-arbol`). El pie suma con
 * `resumirFilas`, la MISMA cuenta que «Avance del permiso»: sin otros filtros
 * que Especie o Última, «Talados» de arriba y el total del pie son un número.
 */

import type { ReactNode } from "react";
import { DataTable } from "@buleje/design-system";
import { EnOrden } from "@/components/admin/shared/columnas-ordenables";
import { resumirFilas, type TraceFila } from "@/lib/forestal/loth-trace-tabla";
import type { GrupoArbol } from "@/lib/forestal/loth-trace-grupos";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { formatNumber } from "@/lib/format";
import { fmtPct, type TraceOrden } from "./loth-trace-ui";
import type { FiltrosTabla } from "./filtros-tabla-forestal";
import { CAJA_TABLA, FilaPie, TABLA_PIE_FIJO } from "./loth-seccion-celdas";
import { ColumnasRecordadas, soloEnOrden, useOrdenRecordado } from "./loth-seccion-columnas";
import { COLUMNAS, EN_PATIO, HEAD, cabeceras, Fila } from "./loth-trace-celdas";
import { GRUPO_META } from "./LothTraceGrupo";

const TOTAL = "whitespace-nowrap font-mono text-base font-black tabular-nums text-[var(--text-primary)]";

const DE_FABRICA: string[] = COLUMNAS.map((c) => c.key);
const ELEGIBLES = COLUMNAS.map((c) => ({ id: c.key, label: HEAD[c.key] }));
const NUMERICAS = new Set<string>(COLUMNAS.filter((c) => c.num).map((c) => c.key));

/** Las columnas elegidas de «Por árbol», recordadas en este navegador. Envuelve la cabecera de la lista y la tabla. */
export function LothTraceColumnas({ children }: { children: ReactNode }) {
  return (
    <ColumnasRecordadas clave="loth-arbol" porDefecto={DE_FABRICA} elegibles={ELEGIBLES}>
      {children}
    </ColumnasRecordadas>
  );
}

export interface GrupoDeTabla {
  grupo: Exclude<GrupoArbol, "en_pie">;
  /** Árboles del grupo con los filtros puestos (todas las páginas). */
  total: number;
  /** Los de ESTA página. */
  filas: TraceFila[];
}

export default function LothTraceTabla({
  grupos,
  filasTotal,
  seleccion,
  onSeleccionar,
  onAbrir,
  orden,
  onOrden,
  filtros,
}: {
  grupos: GrupoDeTabla[];
  /** Los talados que deja el filtro, todas las páginas: el pie suma éstos. */
  filasTotal: TraceFila[];
  seleccion: Set<string>;
  onSeleccionar: (tree: string) => void;
  /** Abre la ventana de detalle del árbol. */
  onAbrir?: (tree: string) => void;
  orden: TraceOrden;
  onOrden: (o: TraceOrden) => void;
  /** El autofiltro de cada columna, pegado a su título (Brandon 07-10). */
  filtros?: FiltrosTabla<TraceFila>;
}) {
  const { orden: cols, refCabecera } = useOrdenRecordado(DE_FABRICA);
  if (grupos.every((g) => g.filas.length === 0)) return null;

  return (
    <DataTable stickyHeader wrapperClassName={CAJA_TABLA} className={`w-full border-collapse ${TABLA_PIE_FIJO}`} data-tabla-arbol>
      <thead ref={refCabecera}>
        <tr>
          <th className="w-10">
            <span className="sr-only">Seleccionar</span>
          </th>
          <EnOrden orden={cols} celdas={soloEnOrden(cols, cabeceras(orden, onOrden, filtros))} />
        </tr>
      </thead>
      {grupos
        .filter((g) => g.filas.length > 0)
        .map((g) => (
          <tbody key={g.grupo} data-grupo={g.grupo}>
            <tr>
              <th colSpan={cols.length + 1} scope="colgroup" className="bg-[var(--surface-sunken)]/60 px-3 py-2 text-left text-sm">
                <span className="font-bold text-[var(--text-primary)]">{GRUPO_META[g.grupo].titulo}</span>{" "}
                <span className="font-normal tabular-nums text-[var(--text-tertiary)]">
                  {formatNumber(g.total)} · {GRUPO_META[g.grupo].nota}
                </span>
              </th>
            </tr>
            {g.filas.map((f) => (
              <Fila key={f.tree} f={f} cols={cols} seleccionada={seleccion.has(f.tree)} onSeleccionar={onSeleccionar} onAbrir={onAbrir} />
            ))}
          </tbody>
        ))}
      <tfoot className="border-t-2 border-[var(--rule-base)] bg-[var(--surface-sunken)]">
        <PieArbol cols={cols} filas={filasTotal} />
      </tfoot>
    </DataTable>
  );
}

/** El total de lo filtrado (todas las páginas), cada cifra bajo su columna; lo que cae en una columna oculta, en el rótulo. */
function PieArbol({ cols, filas }: { cols: readonly string[]; filas: TraceFila[] }) {
  const r = resumirFilas(filas);
  const m = r.m3;
  const dato: Record<string, ReactNode> = { talado: <span className={TOTAL}>{fmtM3(m.talado)}</span> };
  if (m.censo > 0) dato.censo = <span className={TOTAL}>{fmtM3(m.censo)}</span>;
  if (r.trozados > 0) dato.trozado = <span className={TOTAL}>{fmtM3(m.trozado)}</span>;
  if (r.mermaPct != null) dato.merma = <span className="whitespace-nowrap font-mono text-sm font-bold tabular-nums">{fmtM3(m.merma)} · {fmtPct(r.mermaPct)}</span>;
  if (m.movilizado > 0 || m.patio > 0.0005)
    dato.movilizado = (
      <>
        <span className={TOTAL}>{fmtM3(m.movilizado)}</span>
        {m.patio > 0.0005 && <span className={EN_PATIO}>{fmtM3(m.patio)} en patio</span>}
      </>
    );
  const aLaVista = Object.fromEntries(Object.entries(dato).filter(([id]) => cols.includes(id)));
  const rotulo = (
    <>
      <span className="text-xs font-black uppercase tracking-widest text-[var(--text-secondary)]">
        Total · {formatNumber(filas.length)} árbol{filas.length === 1 ? "" : "es"}
      </span>
      {/* El total que no se ve (columna oculta) se dice igual: ocultar no es borrar. */}
      {!cols.includes("talado") && <span className="ml-2 whitespace-nowrap font-mono text-sm font-black tabular-nums">{fmtM3(m.talado)} m³ talados</span>}
    </>
  );
  return <FilaPie orden={cols} dato={aLaVista} rotulo={rotulo} derecha={(id) => NUMERICAS.has(id)} alFinal={0} />;
}
