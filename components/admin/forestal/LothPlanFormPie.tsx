"use client";

/** El pie fijo del formulario del plan: el paso de los documentos, Cancelar y Crear/Guardar/Reintentar. */

import { Check, Loader2, Plus } from "@buleje/design-system/icons";
import type { LothPlanFormEstado } from "./hooks/use-loth-plan-form";

export default function LothPlanFormPie({ form, onClose }: { form: LothPlanFormEstado; onClose: () => void }) {
  const { pasoDocs, busy, puedeGuardar, editando, creadoId, meta } = form;
  return (
    <div className="sticky bottom-0 -mx-5 -mb-5 flex flex-wrap items-center justify-end gap-2 border-t-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-5 py-3">
      {pasoDocs && (
        <p role="status" className="mr-auto flex items-center gap-2 text-sm font-semibold text-[var(--text-secondary)]">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          {pasoDocs.fase === "preparando"
            ? "Preparando las carpetas del plan…"
            : pasoDocs.fase === "carpetas"
              ? "Creando carpetas y documentos…"
              : pasoDocs.fase === "subiendo"
                ? `Subiendo ${Math.min(pasoDocs.hechos + 1, pasoDocs.total)} de ${pasoDocs.total}…`
                : "Guardando los datos de las carpetas…"}
        </p>
      )}
      <button type="button" onClick={onClose} disabled={busy} className="h-11 rounded-xl px-4 text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] disabled:opacity-50">
        Cancelar
      </button>
      <button
        type="submit"
        disabled={!puedeGuardar}
        className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--accent-dark)] px-4 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : editando ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
        {creadoId ? "Reintentar lo que faltó" : editando ? "Guardar cambios" : `Crear ${meta.sigla}`}
      </button>
    </div>
  );
}
