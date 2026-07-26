"use client";

import { useEffect } from "react";
import { FolderInput, Folder, X, Check, CornerUpLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DbDocument, DbDocumentFolder } from "@/lib/types/documents";
import { buildChildrenMap, flattenAll } from "@/lib/documentos/folder-tree";

/**
 * Picker para mover UN documento a cualquier carpeta (o a la raíz). Muestra el
 * árbol completo indentado por profundidad. Se dispara desde el kebab de la lista
 * y desde las acciones al pasar el mouse en la grilla.
 */
export function MoveToFolderModal({
  doc,
  folders,
  onMove,
  onClose,
}: {
  doc: DbDocument;
  folders: DbDocumentFolder[];
  onMove: (folderId: string | null) => void | Promise<void>;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const rows = flattenAll(buildChildrenMap(folders));
  const currentFolderId = doc.folderId ?? null;

  const move = async (folderId: string | null) => {
    if (folderId !== currentFolderId) await onMove(folderId);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-[30rem] rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-[var(--shadow-xl)]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-[var(--rule-base)] px-5 py-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"><FolderInput className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-extrabold text-[var(--text-primary)]">Mover a carpeta</p>
            <p className="truncate text-xs text-[var(--text-tertiary)]">{doc.name}</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)]" aria-label="Cerrar"><X className="h-4 w-4" /></button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-2">
          <button
            onClick={() => move(null)}
            className={cn(
              "flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-bold transition-colors",
              currentFolderId === null ? "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]" : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
            )}
          >
            <CornerUpLeft className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" />
            <span className="flex-1 text-left">Sin carpeta (raíz)</span>
            {currentFolderId === null && <Check className="h-4 w-4 shrink-0" />}
          </button>
          {rows.length === 0 && (
            <p className="px-3 py-6 text-center text-xs italic text-[var(--text-tertiary)]">No hay carpetas todavía.</p>
          )}
          {rows.map(({ folder: f, depth }) => {
            const isCurrent = currentFolderId === f.id;
            return (
              <button
                key={f.id}
                onClick={() => move(f.id)}
                style={{ paddingLeft: depth * 16 + 12 }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg py-2.5 pr-3 text-sm font-bold transition-colors",
                  isCurrent ? "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]" : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
                )}
              >
                <Folder className={cn("h-4 w-4 shrink-0", isCurrent ? "text-primary" : "text-[var(--text-tertiary)]")} />
                <span className="flex-1 truncate text-left">{f.name}</span>
                {isCurrent && <Check className="h-4 w-4 shrink-0" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
