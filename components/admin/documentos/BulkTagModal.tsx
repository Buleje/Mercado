"use client";

import { useState } from "react";
import { Tag, Loader2, Check } from "@buleje/design-system/icons";
import { EtiquetaAutocomplete } from "./EtiquetaAutocomplete";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";

/**
 * Etiquetar EN LOTE: a diferencia de TagEditModal (un documento, con su
 * propia lista de tags para sacar/poner), acá la selección es heterogénea
 * — no hay "tags actuales" únicos que mostrar. Por eso el patrón es
 * "elegir de la taxonomía o crear una nueva" y cada click APLICA de una
 * a los N seleccionados (nunca resta), con feedback de qué ya se aplicó
 * en esta sesión del modal.
 */
export function BulkTagModal({
  count,
  todasLasTags,
  onApply,
  onClose,
}: {
  count: number;
  todasLasTags: string[];
  onApply: (tag: string) => Promise<void> | void;
  onClose: () => void;
}) {
  const [value, setValue] = useState("");
  // Set (no un único string): dos etiquetas pueden aplicarse en simultáneo
  // sin que la segunda quede bloqueada esperando a que termine la primera.
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [aplicadas, setAplicadas] = useState<string[]>([]);

  const apply = async (tag: string) => {
    // Sin lowercase: un chip existente ("GTF") se aplica TAL CUAL aparece en
    // la taxonomía — normalizarlo acá crearía un duplicado ("gtf") separado
    // del tag real que el usuario quiso elegir.
    const t = tag.trim();
    if (!t || busy.has(t)) return;
    setBusy((prev) => new Set(prev).add(t));
    try {
      await onApply(t);
      setAplicadas((prev) => (prev.includes(t) ? prev : [...prev, t]));
    } finally {
      setBusy((prev) => {
        const next = new Set(prev);
        next.delete(t);
        return next;
      });
    }
  };

  return (
    <AdminModal
      open
      onClose={onClose}
      title={`Etiquetar ${count} documento${count === 1 ? "" : "s"}`}
      description="Elige una etiqueta existente o crea una nueva"
      icon={Tag}
      size="md"
      claveVentana="bulk-tag"
    >
      <div className={`flex flex-col gap-3 ${MODAL_BODY}`}>
        {todasLasTags.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto">
            {todasLasTags.map((t) => {
              const aplicada = aplicadas.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => apply(t)}
                  disabled={busy.has(t) || aplicada}
                  className={
                    aplicada
                      ? "inline-flex items-center gap-1 rounded-lg bg-[var(--data-success-500)]/15 px-2 py-1 text-xs font-bold text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"
                      : "inline-flex items-center gap-1 rounded-lg bg-[var(--surface-sunken)] px-2 py-1 text-xs font-bold text-[var(--text-secondary)] hover:bg-primary/10 hover:text-[var(--accent-ink)] disabled:opacity-50 dark:hover:text-[var(--accent)]"
                  }
                >
                  {busy.has(t) ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : aplicada ? (
                    <Check className="h-3 w-3" />
                  ) : null}
                  #{t}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="text-sm italic text-[var(--text-tertiary)]">
            Todavía no tienes etiquetas — crea la primera abajo.
          </p>
        )}

        <EtiquetaAutocomplete
          value={value}
          onChange={setValue}
          onSubmit={apply}
          todasLasTags={todasLasTags}
          excluir={aplicadas}
          placeholder="Crear etiqueta nueva…"
          ariaLabel="Crear y aplicar etiqueta nueva a la selección"
          inputClassName="w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-2 text-sm font-medium text-[var(--text-primary)] outline-none focus:border-primary"
        />

        {aplicadas.length > 0 && (
          <p className="text-xs font-medium text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
            Aplicadas: {aplicadas.map((t) => `#${t}`).join(", ")}
          </p>
        )}
      </div>
    </AdminModal>
  );
}
