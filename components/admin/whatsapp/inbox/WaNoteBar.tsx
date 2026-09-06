"use client";

import { useEffect, useState } from "react";
import { StickyNote, Check } from "@buleje/design-system/icons";

/**
 * WaNoteBar — nota interna de la conversación (solo la ve el equipo).
 * Colapsada muestra la nota (o el botón para crearla); expandida edita.
 */
export default function WaNoteBar({
  phone,
  note,
  onSave,
}: {
  phone: string;
  note: string;
  onSave: (phone: string, note: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note);

  // Cambio de hilo o nota actualizada por otro cajero → resetear el editor
  useEffect(() => {
    setDraft(note);
    setEditing(false);
  }, [phone, note]);

  function save() {
    onSave(phone, draft);
    setEditing(false);
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-2 border-b border-slate-200 bg-[var(--data-warning-50)]/60 px-4 py-1.5 dark:border-slate-700 dark:bg-[var(--data-warning-500)]/5">
        <StickyNote className="h-3.5 w-3.5 shrink-0 text-[var(--data-warning-700)]" aria-hidden />
        {note ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="min-w-0 flex-1 truncate text-left text-[length:var(--ts-xs)] font-semibold text-slate-700 hover:underline dark:text-slate-200"
            title="Editar nota interna (el cliente no la ve)"
          >
            {note}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-[length:var(--ts-xs)] font-semibold text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
          >
            + Nota interna (solo la ve tu equipo)
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 border-b border-slate-200 bg-[var(--data-warning-50)]/60 px-4 py-2 dark:border-slate-700 dark:bg-[var(--data-warning-500)]/5">
      <StickyNote className="h-3.5 w-3.5 shrink-0 text-[var(--data-warning-700)]" aria-hidden />
      <input
        // El foco es respuesta directa al click "editar nota" (no autofocus de
        // carga de página, que es lo que la regla a11y quiere evitar).
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus
        value={draft}
        maxLength={500}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") { setDraft(note); setEditing(false); }
        }}
        onBlur={save}
        placeholder="Ej: quedó en pasar el viernes a recoger…"
        className="h-9 min-w-0 flex-1 rounded-xl border-2 border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-primary dark:border-slate-700 dark:bg-slate-950 dark:text-white"
      />
      <button
        type="button"
        onClick={save}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-white transition hover:opacity-90"
        aria-label="Guardar nota"
      >
        <Check className="h-4 w-4" />
      </button>
    </div>
  );
}
