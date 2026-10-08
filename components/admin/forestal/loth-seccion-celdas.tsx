/**
 * Las celdas de la tabla de una sección del Libro TH —cabecera, cuerpo y pie—
 * como mapas `id → celda`, para pintarlas con `<EnOrden>` en el orden que
 * eligió el operador (`loth-seccion-columnas`). La cabecera, cada fila y el pie
 * usan el MISMO orden: si uno pintara con el suyo, el dato quedaría bajo el
 * título de otra columna.
 *
 * La tabla vive en `LothSeccionTabla`; acá sólo se dibuja cada celda.
 */

import type { ReactNode } from "react";
import {
  diasDeRegistro,
  estaFueraDePlazo,
  PLAZO_REGISTRO_DIAS,
  type LothEntryDTO,
} from "@/lib/forestal/loth-constants";
import type { OrdenCampo, OrdenDir, TotalesSeccion } from "@/lib/forestal/loth-seccion";
import { formatDate } from "@/lib/format";
import { FiltroEnCabecera, type FiltrosTabla } from "./filtros-tabla-forestal";

export interface ColDef {
  key: string;
  label: string;
  align?: "right";
  /** Campo por el que ordena esta columna (si se puede ordenar). */
  orden?: OrdenCampo;
  render: (e: LothEntryDTO) => ReactNode;
  filtros?: readonly string[]; // autofiltros de la cabecera si no es sólo `key` («permiso»: Permiso y Titular)
}

export const TH = "px-4 py-2.5 text-left font-bold text-[var(--text-primary)]";
export const TD = "px-4 py-2.5 align-top";

const fmtFecha = (iso: string) => formatDate(iso, { soloFecha: true });

interface Orden {
  orden: OrdenCampo;
  dir: OrdenDir;
  onOrdenar: (campo: OrdenCampo) => void;
}

/** Los `<th>` movibles (con `data-col`: el arrastre los reconoce por ahí). */
export function cabecerasSeccion(cols: readonly ColDef[], filtros: FiltrosTabla<LothEntryDTO> | undefined, o: Orden): Record<string, ReactNode> {
  const filtro = (ids: readonly string[]) => filtros && ids.map((id) => <FiltroEnCabecera key={id} id={id} f={filtros} compacto />);
  const out: Record<string, ReactNode> = {
    lineNo: <Encabezado id="lineNo" label="N°" campo="lineNo" {...o} alinear="right" filtro={filtro(["lineNo"])} />,
    fecha: <Encabezado id="fecha" label="Fecha" campo="fecha" {...o} filtro={filtro(["fecha"])} />,
    obs: (
      <th data-col="obs" className={TH}>
        <span className="whitespace-nowrap">
          Observaciones
          {filtro(["obs"])}
        </span>
      </th>
    ),
  };
  for (const c of cols) {
    out[c.key] = c.orden ? (
      <Encabezado id={c.key} label={c.label} campo={c.orden} {...o} alinear={c.align} filtro={filtro(c.filtros ?? [c.key])} />
    ) : (
      <th data-col={c.key} className={`${TH} ${c.align === "right" ? "text-right" : ""}`}>
        <span className="whitespace-nowrap">
          {c.label}
          {filtro(c.filtros ?? [c.key])}
        </span>
      </th>
    );
  }
  return out;
}

/** Las celdas movibles de una línea. */
export function celdasLinea(e: LothEntryDTO, cols: readonly ColDef[], corregida: number | undefined): Record<string, ReactNode> {
  const anulada = e.status === "anulado";
  const tarde = !anulada && estaFueraDePlazo(e.entryDate, e.createdAt);
  const out: Record<string, ReactNode> = {
    lineNo: (
      <td className={`${TD} text-right`}>
        <span className="font-mono tabular-nums text-[var(--text-tertiary)]">{e.lineNo}</span>
      </td>
    ),
    fecha: (
      <td className={`${TD} whitespace-nowrap`}>
        <span className="text-[var(--text-secondary)]">{fmtFecha(e.entryDate)}</span>
      </td>
    ),
    obs: (
      <td className={TD}>
        <div className="flex flex-wrap items-center gap-1.5">
          {e.discarded && <Etiqueta tono="error">descartado</Etiqueta>}
          {anulada && <Etiqueta tono="error">ANULADA</Etiqueta>}
          {corregida != null && <Etiqueta tono="info">corregida por N° {corregida}</Etiqueta>}
          {e.correctsLineNo != null && <Etiqueta tono="info">corrige a N° {e.correctsLineNo}</Etiqueta>}
          {tarde && (
            <span
              title={`Asentada ${diasDeRegistro(e.entryDate, e.createdAt)} días después de la actividad — SERFOR exige registro dentro de ${PLAZO_REGISTRO_DIAS} días`}
              className="rounded-full bg-[var(--data-warning-500)]/15 px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
            >
              fuera de plazo · {diasDeRegistro(e.entryDate, e.createdAt)}d
            </span>
          )}
          {e.observations && <span className="text-xs text-[var(--text-tertiary)]">{e.observations}</span>}
          {anulada && e.annulledReason && (
            <span className="text-xs text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">· {e.annulledReason}</span>
          )}
        </div>
      </td>
    ),
  };
  for (const c of cols) {
    out[c.key] = (
      <td className={`${TD} ${c.align === "right" ? "text-right" : ""}`}>
        {/* La anulada se tacha en su código (la primera columna de la sección). */}
        {anulada && c.key === cols[0]?.key ? <span className="line-through">{c.render(e)}</span> : c.render(e)}
      </td>
    );
  }
  return out;
}

/**
 * El pie, en el orden de la tabla. El rótulo «Total · N líneas» ocupa la
 * casilla y las columnas que hay ANTES de la primera con dato; si la primera
 * columna visible ya tiene dato (se arrastró «Vol.» al frente), el rótulo pasa
 * al final. PURO en lo que reparte: `repartoDelPie` se prueba sin navegador.
 */
export function repartoDelPie(orden: readonly string[], conDato: ReadonlySet<string>): { rotuloAntes: number; rotuloDespues: number; conCeldas: string[] } {
  const primera = orden.findIndex((id) => conDato.has(id));
  if (primera < 0) return { rotuloAntes: orden.length + 2, rotuloDespues: 0, conCeldas: [] };
  if (primera > 0) return { rotuloAntes: primera + 1, rotuloDespues: 0, conCeldas: orden.slice(primera) };
  let ultima = orden.length - 1;
  while (ultima > 0 && !conDato.has(orden[ultima])) ultima--;
  // La casilla queda vacía; el rótulo, a la derecha de la última con dato (más «Acciones»).
  return { rotuloAntes: 0, rotuloDespues: orden.length - ultima, conCeldas: orden.slice(0, ultima + 1) };
}

export function PieSeccion({
  orden,
  cols,
  totales,
  total,
  columnaTotal,
}: {
  orden: readonly string[];
  cols: readonly ColDef[];
  totales: TotalesSeccion;
  /** El total ya escrito (`textoTotal`): el mismo texto que la tarjeta de arriba. */
  total: string;
  columnaTotal: string | null;
}) {
  const variasUnidades = totales.unidades.length > 1;
  const piezasEnColumna = orden.includes("pcs");
  const dato: Record<string, ReactNode> = {};
  if (columnaTotal && orden.includes(columnaTotal) && total) {
    dato[columnaTotal] = (
      <span
        className="whitespace-nowrap font-mono text-base font-black tabular-nums text-[var(--text-primary)]"
        title={variasUnidades ? "Mezcla unidades: no hay un total real" : undefined}
      >
        {total}
      </span>
    );
  }
  if (piezasEnColumna && totales.piezas > 0) {
    dato.pcs = <span className="whitespace-nowrap font-mono text-xs tabular-nums text-[var(--text-secondary)]">{totales.piezas} piezas</span>;
  }
  const r = repartoDelPie(orden, new Set(Object.keys(dato)));
  const alineada = (id: string) => (cols.find((c) => c.key === id)?.align === "right" ? "text-right" : "");

  const rotulo = (
    <>
      <span className="text-xs font-black uppercase tracking-widest text-[var(--text-secondary)]">
        Total · {totales.lineas} línea{totales.lineas === 1 ? "" : "s"}
      </span>
      {totales.anuladas > 0 && (
        <span className="ml-2 text-xs text-[var(--text-tertiary)]">
          ({totales.anuladas} anulada{totales.anuladas === 1 ? "" : "s"}, no suman)
        </span>
      )}
      {/* El total que no se ve (columna oculta) se dice igual: ocultar no es borrar. */}
      {columnaTotal && !orden.includes(columnaTotal) && total && (
        <span className="ml-2 whitespace-nowrap font-mono text-sm font-black tabular-nums text-[var(--text-primary)]">{total}</span>
      )}
      {variasUnidades && (
        <span className="ml-2 text-xs font-semibold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
          Hay {totales.unidades.length} unidades distintas ({totales.unidades.join(", ")}): sumarlas no daría un total real.
        </span>
      )}
      {!piezasEnColumna && totales.piezas > 0 && (
        <span className="ml-2 font-mono text-xs tabular-nums text-[var(--text-secondary)]">{totales.piezas} piezas</span>
      )}
    </>
  );

  return (
    <tr>
      {r.rotuloAntes > 0 ? (
        <td className={TD} colSpan={r.rotuloAntes}>{rotulo}</td>
      ) : (
        <td className={TD} />
      )}
      {r.conCeldas.map((id) => (
        <td key={id} className={`${TD} ${alineada(id)}`}>{dato[id]}</td>
      ))}
      {r.rotuloDespues > 0 ? (
        <td className={`${TD} text-right`} colSpan={r.rotuloDespues}>{rotulo}</td>
      ) : (
        r.rotuloAntes <= orden.length + 1 && <td className={TD} />
      )}
    </tr>
  );
}

function Encabezado({
  id,
  label,
  campo,
  orden,
  dir,
  onOrdenar,
  alinear,
  filtro,
}: Orden & {
  id: string;
  label: string;
  campo: OrdenCampo;
  alinear?: "right";
  /** El autofiltro de la columna, pegado al título. */
  filtro?: ReactNode;
}) {
  const activo = orden === campo;
  return (
    <th data-col={id} className={`${TH} ${alinear === "right" ? "text-right" : ""}`}>
      <span className="whitespace-nowrap">
        <button
          type="button"
          onClick={() => onOrdenar(campo)}
          title={`Ordenar por ${label.toLowerCase()} · arrastra el título para moverla`}
          className={`inline-flex items-center gap-1 rounded uppercase transition-colors hover:text-[var(--accent-ink)] dark:hover:text-[var(--accent)] ${
            activo ? "text-[var(--accent-ink)] dark:text-[var(--accent)]" : ""
          }`}
        >
          {label}
          {activo && <span aria-hidden="true">{dir === "asc" ? "↑" : "↓"}</span>}
        </button>
        {filtro}
      </span>
    </th>
  );
}

function Etiqueta({ children, tono }: { children: ReactNode; tono: "error" | "info" }) {
  const cls =
    tono === "error"
      ? "bg-[var(--data-error-500)]/15 text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"
      : "bg-[var(--data-info-500)]/15 text-[var(--data-info-700)] dark:text-[var(--data-info-500)]";
  return (
    <span className={`rounded-full px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide ${cls}`}>{children}</span>
  );
}
