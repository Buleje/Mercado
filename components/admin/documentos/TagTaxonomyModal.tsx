"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Tag, X, Pencil, Trash2, Check, Loader2 } from "@buleje/design-system/icons";
import { fetchTags, renameDocTag, deleteDocTag } from "@/hooks/use-documents";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import { useModalAccesible } from "@/hooks/use-modal-accesible";

type TagRow = { tag: string; count: number };

/**
 * Editor de taxonomía de etiquetas: renombrar / fusionar / borrar #tags en todos
 * los documentos a la vez. Renombrar hacia una etiqueta existente = fusiona (dedupe
 * en backend). Al cambiar algo llama `onChanged` para refrescar la lista de docs.
 */
export function TagTaxonomyModal({ onChanged, onClose }: { onChanged: () => void; onClose: () => void }) {
  const { confirm } = useConfirm();
  const [tags, setTags] = useState<TagRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [busy, setBusy] = useState(false);
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  // Escape ya lo maneja el efecto de más abajo (respeta `editing`).
  useModalAccesible(panelRef, { onCerrar: onClose, activo: true, cerrarConEscape: false });

  const load = () => {
    setLoading(true);
    fetchTags().then(setTags).catch(() => setTags([])).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !editing) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, editing]);

  const startEdit = (tag: string) => { setEditing(tag); setEditValue(tag); };

  /**
   * Un renombre a la vez. Enter y el blur del input llaman los dos a
   * `commitRename`: con el `window.confirm` nativo el hilo quedaba bloqueado y
   * el segundo nunca corría; con la confirmación async, `setEditing(null)`
   * desmonta el input mientras se espera, el blur dispara otra vez y se abrían
   * dos confirmaciones. `busy` no alcanza: se prende recién después.
   */
  const renombrando = useRef(false);
  const commitRename = async (from: string) => {
    if (renombrando.current) return;
    const to = editValue.trim().toLowerCase();
    setEditing(null);
    if (!to || to === from || busy) return;
    renombrando.current = true;
    try {
      const exists = tags.some((t) => t.tag === to);
      if (exists && !(await confirm({
        title: `¿Fusionar "#${from}" dentro de "#${to}"?`,
        description: `La etiqueta "#${to}" ya existe.`,
        intent: "warning",
        confirmLabel: "Sí, fusionar",
      }))) return;
      setBusy(true);
      try {
        await renameDocTag(from, to);
        onChanged();
        load();
      } finally {
        setBusy(false);
      }
    } finally {
      renombrando.current = false;
    }
  };

  const remove = async (tag: string) => {
    if (busy) return;
    if (!(await confirm({
      title: `¿Quitar la etiqueta "#${tag}"?`,
      description: "Se quita de todos los documentos. No borra los documentos.",
      intent: "warning",
      confirmLabel: "Sí, quitar",
    }))) return;
    setBusy(true);
    try {
      await deleteDocTag(tag);
      onChanged();
      load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-modal-2 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className="flex max-h-[85vh] w-full max-w-[30rem] flex-col overflow-hidden rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-[var(--shadow-xl)]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-[var(--rule-base)] px-5 py-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"><Tag className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <p id={titleId} className="text-sm font-extrabold text-[var(--text-primary)]">Etiquetas</p>
            <p className="text-xs text-[var(--text-tertiary)]">Renombra, fusiona o borra en todos los documentos</p>
          </div>
          <button onClick={onClose} className="rounded-xl p-1.5 text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)]" aria-label="Cerrar"><X className="h-4 w-4" /></button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {loading ? (
            <p className="flex items-center justify-center gap-2 px-3 py-10 text-sm text-[var(--text-tertiary)]"><Loader2 className="h-4 w-4 animate-spin" /> Cargando…</p>
          ) : tags.length === 0 ? (
            <p className="px-3 py-10 text-center text-sm italic text-[var(--text-tertiary)]">No hay etiquetas todavía. Etiqueta documentos desde la barra de selección.</p>
          ) : (
            <ul className="space-y-0.5">
              {tags.map((t) => (
                <li key={t.tag} className="group flex items-center gap-2 rounded-lg px-2.5 py-2 hover:bg-[var(--surface-sunken)]">
                  {editing === t.tag ? (
                    <input
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") commitRename(t.tag); if (e.key === "Escape") setEditing(null); }}
                      onBlur={() => commitRename(t.tag)}
                      autoFocus
                      maxLength={40}
                      aria-label={`Renombrar etiqueta ${t.tag}`}
                      className="min-w-0 flex-1 rounded-xl border-2 border-primary bg-[var(--surface-raised)] px-2 py-1 text-sm font-bold text-[var(--text-primary)] outline-none"
                    />
                  ) : (
                    <>
                      <span className="min-w-0 flex-1 truncate text-sm font-bold text-primary">#{t.tag}</span>
                      <span className="shrink-0 rounded-md bg-[var(--surface-sunken)] px-1.5 py-0.5 text-[length:var(--ts-2xs,11px)] font-bold tabular-nums text-[var(--text-tertiary)]">{t.count}</span>
                      <button onClick={() => startEdit(t.tag)} disabled={busy} className="shrink-0 rounded-xl p-1.5 text-[var(--text-tertiary)] opacity-0 transition-colors hover:bg-[var(--surface-raised)] hover:text-primary group-hover:opacity-100 disabled:opacity-40" aria-label={`Renombrar ${t.tag}`} title="Renombrar / fusionar"><Pencil className="h-3.5 w-3.5" /></button>
                      <button onClick={() => remove(t.tag)} disabled={busy} className="shrink-0 rounded-xl p-1.5 text-[var(--text-tertiary)] opacity-0 transition-colors hover:bg-[var(--data-error-50)] hover:text-[var(--data-error-700)] group-hover:opacity-100 dark:hover:bg-[var(--data-error-500)]/15 dark:hover:text-[var(--data-error-500)] disabled:opacity-40" aria-label={`Borrar ${t.tag}`} title="Borrar de todos los documentos"><Trash2 className="h-3.5 w-3.5" /></button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-[var(--rule-base)] px-5 py-3">
          <span className="inline-flex items-center gap-1.5 text-xs text-[var(--text-tertiary)]">
            {busy ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Aplicando…</> : <><Check className="h-3.5 w-3.5" /> {tags.length} etiqueta(s)</>}
          </span>
          <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]">Listo</button>
        </div>
      </div>
    </div>
  );
}
