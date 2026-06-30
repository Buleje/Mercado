"use client";

import { useEffect, useRef, useState } from "react";
import { X, Loader2, Calendar, Tag } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { DOC_CATEGORIES } from "@/lib/types/documents";
import type { DbDocument } from "@/lib/types/documents";
import { CAT_LABEL, toDateInput } from "./shared";
import type { DocMetaPatch } from "./use-superadmin-documents";

interface Props {
  doc: DbDocument;
  onClose: () => void;
  onSave: (id: string, patch: DocMetaPatch) => Promise<boolean>;
}

const FIELD =
  "w-full h-12 text-base border-2 border-[var(--rule-base)] rounded-2xl px-3 bg-[var(--surface-raised)] text-[var(--text-primary)]";

/** Normaliza el input de tags: split por coma, trim, sin vacíos, dedupe, máx 20×40. */
function parseTags(raw: string): string[] {
  const seen = new Set<string>();
  for (const t of raw.split(",")) {
    const v = t.trim().slice(0, 40);
    if (v) seen.add(v);
  }
  return [...seen].slice(0, 20);
}

export default function DocumentEditModal({ doc, onClose, onSave }: Props) {
  const [name, setName] = useState(doc.name);
  const [category, setCategory] = useState(doc.category);
  const [tagsRaw, setTagsRaw] = useState(doc.tags.join(", "));
  const [expiresAt, setExpiresAt] = useState(toDateInput(doc.expiresAt));
  const [saving, setSaving] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleSave = async () => {
    setSaving(true);
    const trimmed = name.trim() || doc.name;
    const ok = await onSave(doc.id, {
      name: trimmed,
      category,
      tags: parseTags(tagsRaw),
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
    });
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Editar documento"
        className="w-full max-w-md rounded-2xl bg-[var(--surface-raised)] border-2 border-[var(--rule-base)] shadow-[var(--shadow-lg)] p-5 space-y-4"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-extrabold text-[var(--text-primary)]">Editar documento</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="p-1.5 rounded-lg hover:bg-[var(--surface-sunken)] text-[var(--text-tertiary)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <label className="block space-y-1">
          <span className="text-sm font-semibold text-[var(--text-secondary)]">Nombre</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className={FIELD} />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-semibold text-[var(--text-secondary)]">Categoría</span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className={FIELD}
          >
            {DOC_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CAT_LABEL[c] ?? c}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1">
          <span className="flex items-center gap-1 text-sm font-semibold text-[var(--text-secondary)]">
            <Tag className="h-4 w-4" /> Etiquetas
          </span>
          <input
            value={tagsRaw}
            onChange={(e) => setTagsRaw(e.target.value)}
            placeholder="separadas por coma"
            className={FIELD}
          />
        </label>

        <label className="block space-y-1">
          <span className="flex items-center gap-1 text-sm font-semibold text-[var(--text-secondary)]">
            <Calendar className="h-4 w-4" /> Vencimiento
          </span>
          <div className="flex gap-2">
            <input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className={cn(FIELD, "flex-1")}
            />
            {expiresAt && (
              <button
                type="button"
                onClick={() => setExpiresAt("")}
                className="h-12 px-3 rounded-2xl border-2 border-[var(--rule-base)] text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-alt)]"
              >
                Quitar
              </button>
            )}
          </div>
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="h-12 px-4 rounded-2xl border-2 border-[var(--rule-base)] text-base font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-alt)]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 h-12 px-5 rounded-2xl bg-primary text-white text-base font-bold hover:bg-primary/90 disabled:opacity-50"
          >
            {saving && <Loader2 className="h-5 w-5 animate-spin" />}
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}
