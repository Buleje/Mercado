"use client";

/**
 * Las casillas de elegir guías en las tablas GTF del Libro TH (vigentes y
 * «Anuladas y otras»). La de cabecera tilda TODAS las filtradas, no sólo la
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

export function CasillaTodasGtf({ ids, sel, etiqueta }: { ids: readonly string[]; sel: SeleccionGuias; etiqueta: string }) {
  const tildadas = ids.filter((id) => sel.tiene(id)).length;
  const todas = ids.length > 0 && tildadas === ids.length;
  return (
    <th data-label="Elegir" className="w-px px-1 py-1.5">
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
    </th>
  );
}

export function CasillaFilaGtf({ id, numero, sel }: { id: string; numero: string; sel: SeleccionGuias }) {
  return (
    <td data-label="Elegir" className="w-px px-1 py-1.5">
      <label className={CAJA}>
        <input
          type="checkbox"
          checked={sel.tiene(id)}
          onChange={() => sel.alternar(id)}
          aria-label={`Elegir la guía ${numero}`}
          className={CASILLA}
        />
      </label>
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
