"use client";

import { useState } from "react";
import { Tag, X, Loader2 } from "@buleje/design-system/icons";
import { EtiquetaAutocomplete } from "./EtiquetaAutocomplete";

/**
 * Editor de etiquetas de UN documento. Reemplaza el `prompt()` nativo de antes
 * (una etiqueta por vez, sin ver las que ya tiene, sin autocompletar) — acá se
 * ven todas como chips removibles y el input sugiere de la taxonomía existente
 * para no terminar con "factura" Y "facturas" por un typo.
 */
export function TagEditModal({
  nombre, tags, todasLasTags, onAdd, onRemove, onClose,
}: {
  nombre: string;
  tags: string[];
  todasLasTags: string[];
  onAdd: (tag: string) => Promise<void> | void;
  onRemove: (tag: string) => Promise<void> | void;
  onClose: () => void;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const add = async (tag: string) => {
    const t = tag.trim().toLowerCase();
    if (!t || tags.includes(t)) return;
    setBusy(t);
    try {
      await onAdd(t);
    } finally {
      setBusy(null);
    }
  };

  const remove = async (tag: string) => {
    setBusy(tag);
    try {
      await onRemove(tag);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-[26rem] flex-col overflow-visible rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-[var(--shadow-xl)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-[var(--rule-base)] px-5 py-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"><Tag className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-extrabold text-[var(--text-primary)] truncate" title={nombre}>{nombre}</p>
            <p className="text-xs text-[var(--text-tertiary)]">Etiquetas de este documento</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)]" aria-label="Cerrar"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex flex-col gap-3 p-5">
          {tags.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {tags.map((t) => (
                <span key={t} className="inline-flex items-center gap-1 rounded-lg bg-primary/10 px-2 py-1 text-xs font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]">
                  #{t}
                  <button
                    onClick={() => remove(t)}
                    disabled={busy === t}
                    className="rounded-full p-0.5 hover:bg-primary/20 disabled:opacity-50"
                    aria-label={`Quitar etiqueta ${t}`}
                  >
                    {busy === t ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm italic text-[var(--text-tertiary)]">Todavía no tiene etiquetas.</p>
          )}

          <EtiquetaAutocomplete
            value={value}
            onChange={setValue}
            onSubmit={add}
            todasLasTags={todasLasTags}
            excluir={tags}
            placeholder="Agregar etiqueta…"
            ariaLabel="Agregar etiqueta a este documento"
            inputClassName="w-full rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-2 text-sm font-medium text-[var(--text-primary)] outline-none focus:border-primary"
          />
        </div>
      </div>
    </div>
  );
}
