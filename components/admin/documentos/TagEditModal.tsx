"use client";

import { useState } from "react";
import { Tag, X, Loader2 } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
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
    <AdminModal
      open
      onClose={onClose}
      title={nombre}
      description="Etiquetas de este documento"
      icon={Tag}
      variant="centered-sm"
    >
      <div className={cn(MODAL_BODY, "flex flex-col gap-3 overflow-visible")}>
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
          inputClassName="w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-2 text-sm font-medium text-[var(--text-primary)] outline-none focus:border-primary"
        />
      </div>
    </AdminModal>
  );
}
