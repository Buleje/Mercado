"use client";

import { Download, Trash2, X, CheckSquare, FolderOpen, Tag, Star } from "@buleje/design-system/icons";
import type { DbDocumentFolder } from "@/lib/types/documents";

interface Props {
  count: number;
  allSelected: boolean;
  folders: DbDocumentFolder[];
  onSelectAll: () => void;
  onDownload: () => void;
  onMove: (folderId: string | null) => void;
  onTag: () => void;
  onFavorite: () => void;
  onDelete: () => void;
  onClear: () => void;
}

/** Barra de acciones que aparece al seleccionar ≥1 documento. */
export default function BulkActionBar({
  count,
  allSelected,
  folders,
  onSelectAll,
  onDownload,
  onMove,
  onTag,
  onFavorite,
  onDelete,
  onClear,
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border-2 border-primary bg-primary/10 px-4 py-3">
      <span className="text-base font-bold text-[var(--text-primary)]">
        {count} seleccionado{count === 1 ? "" : "s"}
      </span>

      <button
        type="button"
        onClick={onSelectAll}
        className="flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
      >
        <CheckSquare className="h-4 w-4" />
        {allSelected ? "Quitar todo" : "Seleccionar todo"}
      </button>

      <div className="flex flex-wrap items-center gap-2 ml-auto">
        {/* Mover a carpeta */}
        <div className="relative flex items-center">
          <FolderOpen className="absolute left-2.5 h-4 w-4 text-[var(--text-tertiary)] pointer-events-none" />
          <select
            aria-label="Mover a carpeta"
            value=""
            onChange={(e) => {
              const v = e.target.value;
              if (!v) return;
              onMove(v === "__none__" ? null : v);
              e.target.value = "";
            }}
            className="h-10 pl-8 pr-3 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-base font-semibold text-[var(--text-secondary)]"
          >
            <option value="">Mover a…</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
            <option value="__none__">Sin carpeta</option>
          </select>
        </div>

        <button
          type="button"
          onClick={onFavorite}
          className="flex items-center gap-2 h-10 px-3 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-base font-semibold text-[var(--text-secondary)] hover:text-[var(--data-warning-500)] hover:border-[var(--data-warning-500)] transition-colors"
        >
          <Star className="h-4 w-4" /> Favorito
        </button>
        <button
          type="button"
          onClick={onTag}
          className="flex items-center gap-2 h-10 px-3 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-base font-semibold text-[var(--text-secondary)] hover:text-primary hover:border-primary transition-colors"
        >
          <Tag className="h-4 w-4" /> Etiquetar
        </button>
        <button
          type="button"
          onClick={onDownload}
          className="flex items-center gap-2 h-10 px-3 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-base font-semibold text-[var(--text-secondary)] hover:text-primary hover:border-primary transition-colors"
        >
          <Download className="h-4 w-4" /> Descargar
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="flex items-center gap-2 h-10 px-3 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--surface-raised)] text-base font-semibold text-[var(--data-error-500)] hover:bg-[var(--data-error-50)] dark:hover:bg-red-950/20 transition-colors"
        >
          <Trash2 className="h-4 w-4" /> Borrar
        </button>
        <button
          type="button"
          onClick={onClear}
          aria-label="Cerrar selección"
          className="p-2 rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)]"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
