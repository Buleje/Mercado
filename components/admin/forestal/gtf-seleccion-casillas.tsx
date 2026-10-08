"use client";

/**
 * Las casillas de elegir guías en las tablas GTF del Libro TH (vigentes y
 * «Anuladas y otras») y en la lista de «Guías emitidas» del CTP. La de cabecera tilda TODAS las filtradas, no sólo la
 * página: elegir el mes para la relación de guías no puede ser ir página por
 * página.
 *
 * A 400 px la tabla se vuelve tarjetas y el `<thead>` se esconde: la de
 * cabecera desaparece (por eso la tabla ofrece «Elegir las N» al pie en
 * móvil) y el `data-label` evita que cada tarjeta se rotule con el
 * `aria-label` de la casilla (memoria `th-con-casilla-rotula-las-tarjetas-movil`).
 */

import type { SeleccionGuias } from "./hooks/use-seleccion-guias";

const CAJA = "inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg hover:bg-[var(--surface-canvas)]";
const CASILLA = "h-5 w-5 cursor-pointer accent-[var(--accent)]";

/**
 * La casilla de «todas»: tilda o destilda las filtradas, a medias si hay
 * algunas. Sin celda: la tabla la envuelve en su `<th>`, la lista de «Guías
 * emitidas» del CTP la pone sola encima de las filas.
 */
export function CasillaTodasGuias({ ids, sel, etiqueta }: { ids: readonly string[]; sel: SeleccionGuias; etiqueta: string }) {
  const tildadas = ids.filter((id) => sel.tiene(id)).length;
  const todas = ids.length > 0 && tildadas === ids.length;
  return (
    <label className={CAJA} title={etiqueta}>
      <input
        type="checkbox"
        checked={todas}
        disabled={ids.length === 0}
        ref={(el) => {
          if (el) el.indeterminate = tildadas > 0 && !todas;
        }}
        onChange={() => sel.marcar(ids, !todas)}
        aria-label={etiqueta}
        className={CASILLA}
      />
    </label>
  );
}

/**
 * La casilla de una guía, sin celda (ver `CasillaTodasGuias`). Con `ids`
 * (las líneas de despacho de UNA guía del CTP) tilda o destilda la guía
 * entera: se elige la guía, no la línea.
 */
export function CasillaGuia({ id, ids, numero, sel }: { id: string; ids?: readonly string[]; numero: string; sel: SeleccionGuias }) {
  const lineas = ids && ids.length > 1 ? ids : null;
  const tildada = lineas ? lineas.every((x) => sel.tiene(x)) : sel.tiene(id);
  return (
    <label className={CAJA}>
      <input
        type="checkbox"
        checked={tildada}
        onChange={() => (lineas ? sel.marcar(lineas, !tildada) : sel.alternar(id))}
        aria-label={lineas ? `Elegir la guía ${numero} (sus ${lineas.length} líneas)` : `Elegir la guía ${numero}`}
        className={CASILLA}
      />
    </label>
  );
}

export function CasillaTodasGtf({ ids, sel, etiqueta }: { ids: readonly string[]; sel: SeleccionGuias; etiqueta: string }) {
  return (
    <th data-label="Elegir" className="w-px px-1 py-1.5">
      <CasillaTodasGuias ids={ids} sel={sel} etiqueta={etiqueta} />
    </th>
  );
}

export function CasillaFilaGtf({ id, numero, sel }: { id: string; numero: string; sel: SeleccionGuias }) {
  return (
    <td data-label="Elegir" className="w-px px-1 py-1.5">
      <CasillaGuia id={id} numero={numero} sel={sel} />
    </td>
  );
}

/** «Elegir las N» al pie, sólo en móvil (donde no hay cabecera). */
export function ElegirFiltradasMovil({ ids, sel }: { ids: readonly string[]; sel: SeleccionGuias }) {
  if (ids.length === 0) return null;
  const todas = ids.every((id) => sel.tiene(id));
  return (
    <button
      type="button"
      onClick={() => sel.marcar(ids, !todas)}
      className="inline-flex h-10 items-center rounded-xl border border-[var(--rule-base)] px-3 text-sm font-semibold text-[var(--text-primary)] hover:border-[var(--accent)] sm:hidden"
    >
      {todas ? "Quitar las elegidas" : `Elegir las ${ids.length}`}
    </button>
  );
}
