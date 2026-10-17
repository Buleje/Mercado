"use client";

/**
 * Cómo se dibuja una punta (D1 o D2) en la tabla del patio, en sus tarjetas y
 * en los modales que la listan: el número, de dónde salió y —si falta— el
 * atajo para anotarla. Una sola forma para que la misma pieza diga lo mismo
 * en todos lados.
 */

import { Ruler } from "@buleje/design-system/icons";
import { FUENTE_MEDIDA_META, type FuenteMedida } from "@/lib/forestal/trozas-patio-medidas";
import { formatNumber } from "@/lib/format";

/** Un diámetro en cm: hasta un decimal (Oxapampa convertido trae medio cm). */
export const cm = (v: number | null) => (v == null ? "—" : formatNumber(v, { max: 1 }));

/**
 * El número con su marca de origen. La marca va sólo cuando NO es la guía: es
 * la excepción la que hay que señalar, y la fila normal queda limpia.
 */
export function ValorMedida({ v, fuente }: { v: number | null; fuente: FuenteMedida | null }) {
  if (v == null) return <span className="text-[var(--text-tertiary)]">—</span>;
  const meta = fuente ? FUENTE_MEDIDA_META[fuente] : null;
  return (
    <span title={meta?.label} className="inline-flex items-baseline gap-0.5">
      <span>{cm(v)}</span>
      {meta?.marca && (
        <sup className="font-sans text-[length:var(--ts-2xs)] font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]">
          {meta.marca}
        </sup>
      )}
    </span>
  );
}

/** «Anotar»: abre la planilla de D1/D2 con esta pieza primero. No abre la ficha. */
export function BotonAnotarMedidas({ onClick, etiqueta = "Anotar" }: { onClick: () => void; etiqueta?: string }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onKeyDown={(e) => e.stopPropagation()}
      title="La guía no trae D1/D2 de esta pieza: anótalos (quedan marcados como medidos en planta)"
      className="inline-flex h-6 items-center gap-1 rounded-md border border-dashed border-[var(--rule-strong)] px-1 font-sans text-[length:var(--ts-2xs)] font-bold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent-ink)] dark:hover:text-[var(--accent)]"
    >
      <Ruler className="h-3 w-3" aria-hidden="true" />
      {etiqueta}
    </button>
  );
}
