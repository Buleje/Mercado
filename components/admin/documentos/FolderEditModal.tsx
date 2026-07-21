"use client";

import { useEffect, useState } from "react";
import { X, Check, Ban } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DbDocumentFolder } from "@/lib/types/documents";
import { FOLDER_COLORS, FOLDER_ICON_OPTIONS, FolderGlyph } from "./folder-visuals";

/**
 * Editar una carpeta: nombre + color + ícono. Persiste vía PATCH
 * (`updateFolder` del hook). El color se guarda como valor hex; el ícono como clave.
 */
export function FolderEditModal({
  folder,
  onSave,
  onClose,
}: {
  folder: DbDocumentFolder;
  onSave: (patch: { name: string; color: string | null; icon: string | null }) => void | Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(folder.name);
  const [color, setColor] = useState<string | null>(folder.color);
  const [icon, setIcon] = useState<string | null>(folder.icon);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      await onSave({ name: trimmed, color, icon });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-[28rem] rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-[var(--shadow-xl)]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-[var(--rule-base)] px-5 py-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--surface-sunken)]">
            <FolderGlyph folder={{ icon, color }} className="h-5 w-5" active />
          </span>
          <p className="flex-1 text-sm font-extrabold text-[var(--text-primary)]">Editar carpeta</p>
          <button onClick={onClose} className="rounded-md p-1.5 text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)]" aria-label="Cerrar"><X className="h-4 w-4" /></button>
        </div>

        <div className="space-y-5 p-5">
          {/* Nombre */}
          <div>
            <label className="mb-1.5 block text-[length:var(--ts-2xs,11px)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Nombre</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") save(); }}
              autoFocus
              maxLength={80}
              className="w-full rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2.5 text-sm font-bold text-[var(--text-primary)] outline-none focus:border-primary"
            />
          </div>

          {/* Color */}
          <div>
            <label className="mb-2 block text-[length:var(--ts-2xs,11px)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Color</label>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setColor(null)}
                className={cn("flex h-8 w-8 items-center justify-center rounded-full border-2 transition-transform hover:scale-110", color === null ? "border-primary" : "border-[var(--rule-base)]")}
                title="Sin color"
                aria-label="Sin color"
              >
                <Ban className="h-4 w-4 text-[var(--text-tertiary)]" />
              </button>
              {FOLDER_COLORS.map((c) => (
                <button
                  key={c.key}
                  onClick={() => setColor(c.value)}
                  style={{ backgroundColor: c.value }}
                  className={cn("flex h-8 w-8 items-center justify-center rounded-full ring-2 ring-offset-2 ring-offset-[var(--surface-raised)] transition-transform hover:scale-110", color === c.value ? "ring-primary" : "ring-transparent")}
                  title={c.label}
                  aria-label={c.label}
                >
                  {color === c.value && <Check className="h-4 w-4 text-white" />}
                </button>
              ))}
            </div>
          </div>

          {/* Ícono */}
          <div>
            <label className="mb-2 block text-[length:var(--ts-2xs,11px)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Ícono</label>
            <div className="grid grid-cols-5 gap-2">
              {FOLDER_ICON_OPTIONS.map((o) => {
                const selected = (icon ?? "folder") === o.key;
                return (
                  <button
                    key={o.key}
                    onClick={() => setIcon(o.key)}
                    className={cn("flex aspect-square items-center justify-center rounded-xl border-2 transition-colors", selected ? "border-primary bg-primary/10" : "border-[var(--rule-base)] hover:border-primary/40")}
                    title={o.label}
                    aria-label={o.label}
                  >
                    <o.Icon className="h-5 w-5" style={color ? { color } : undefined} />
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[var(--rule-base)] px-5 py-4">
          <button onClick={onClose} className="rounded-xl px-4 py-2.5 text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]">Cancelar</button>
          <button
            onClick={save}
            disabled={saving || !name.trim()}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-primary-dark disabled:opacity-50"
          >
            <Check className="h-4 w-4" /> Guardar
          </button>
        </div>
      </div>
    </div>
  );
}
