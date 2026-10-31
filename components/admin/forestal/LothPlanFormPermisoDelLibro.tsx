"use client";

/**
 * LothPlanFormPermisoDelLibro — en el alta de un plan, la propuesta de
 * declararlo bajo el MISMO permiso del Directorio que el plan elegido en el
 * chip del libro (02-10-2026: «acceso directo al crear campos y registros»).
 *
 * Propone, no aplica: un clic en «Usar» hace lo mismo que elegir el permiso en
 * «Traer del Directorio» (completa sólo lo vacío) y la equis la descarta. Nunca
 * aparece si ya se eligió un permiso a mano.
 */

import { FileText, X as XIcon } from "@buleje/design-system/icons";
import type { Contrato } from "@/lib/forestal/contratos";

export default function LothPlanFormPermisoDelLibro({
  contrato,
  planDelLibro,
  onUsar,
  onDescartar,
}: {
  contrato: Contrato;
  /** Cómo se llama el plan elegido en el libro («PO 12»). */
  planDelLibro: string;
  onUsar: () => void;
  onDescartar: () => void;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-dashed border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-2">
      <FileText className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden="true" />
      <span className="min-w-0 text-sm text-[var(--text-secondary)]">
        ¿Lo declaras bajo el permiso <span className="font-mono font-bold text-[var(--text-primary)]">{contrato.codigo}</span>, como{" "}
        {planDelLibro}?
      </span>
      <span className="ml-auto flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={onUsar}
          className="inline-flex h-8 items-center rounded-lg border border-[var(--accent)] px-3 text-xs font-bold text-[var(--accent-ink)] transition-colors hover:bg-[var(--accent-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          Usar
        </button>
        <button
          type="button"
          onClick={onDescartar}
          className="grid h-8 w-8 place-items-center rounded-lg text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          aria-label="No usar ese permiso"
          title="No usar ese permiso"
        >
          <XIcon className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </span>
    </div>
  );
}
