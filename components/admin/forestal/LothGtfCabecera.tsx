/**
 * La cabecera de la vista GTF del Libro TH, en UNA fila (Brandon 08-10):
 * «Indicadores» con los demás botones —en «Anuladas y otras» quedaba solo en
 * una fila propia— y, para que entre, el rótulo de la vista pasa a ⓘ y los
 * botones dicen lo justo (el detalle va en su `title`). Salió de
 * `LothGtfView` (08-10) sin cambiar el DOM.
 */

import type { ReactNode } from "react";
import { FileDown, Plus, Truck } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";

const BOTON_BORDE =
  "inline-flex h-11 items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-semibold text-[var(--text-primary)] hover:border-[var(--accent)]";

export default function LothGtfCabecera({
  botonIndicadores,
  onImportarGuias,
  onAnotar,
  onDespachar,
}: {
  /** El botón de `useKpisPlegables` (o nada mientras carga o sin guías). */
  botonIndicadores: ReactNode;
  onImportarGuias?: () => void;
  onAnotar: () => void;
  onDespachar: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <InfoTip
        title="Guías de Transporte Forestal"
        what="Las guías del Libro TH. Son internas: la GTF oficial se emite en el SNIFFS de SERFOR."
        affects="Cada guía de trozas ampara las líneas de Despacho del libro y, al llegar, el ingreso al Libro CTP."
        example="Importa la guía que ya salió por SNIFFS, o despacha con guía desde acá."
      />
      {botonIndicadores}
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {/* ADR-461: las guías que ya salieron (SNIFFS, foto o recibidas en el
            aserradero) entran con sus trozas, su tala y su permiso. */}
        {onImportarGuias && (
          <button
            type="button"
            onClick={onImportarGuias}
            title="Trae guías ya despachadas con sus trozas: por N° de registro SERFOR, foto o las que ya recibió el aserradero"
            className={BOTON_BORDE}
          >
            <FileDown className="h-4 w-4" aria-hidden="true" /> Importar guías
          </button>
        )}
        {/* La guía anotada a mano sigue: sirve para las salidas que YA están
            en el libro y no tienen su guía (el aviso rojo de abajo). */}
        <button
          type="button"
          onClick={onAnotar}
          title="Anotar una guía: para despachos que ya están en el libro y no tienen su guía"
          className={BOTON_BORDE}
        >
          <Plus className="h-4 w-4" /> Anotar guía
        </button>
        <button
          type="button"
          onClick={onDespachar}
          title="La guía completa con sus trozas: se asienta el despacho en el libro en el mismo paso"
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--brand-ink)] px-4 text-sm font-semibold text-white hover:opacity-90"
        >
          <Truck className="h-4 w-4" /> Despachar con guía
        </button>
      </div>
    </div>
  );
}
