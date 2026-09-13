"use client";

import { FolderInput, Folder, Check, CornerUpLeft } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { DbDocument, DbDocumentFolder } from "@/lib/types/documents";
import { buildChildrenMap, flattenAll } from "@/lib/documentos/folder-tree";
import AdminModal from "@/components/admin/shared/AdminModal";

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
  const rows = flattenAll(buildChildrenMap(folders));
  const currentFolderId = doc.folderId ?? null;

  const move = async (folderId: string | null) => {
    if (folderId !== currentFolderId) await onMove(folderId);
    onClose();
  };

  return (
    <AdminModal open onClose={onClose} title="Mover a carpeta" description={doc.name} icon={FolderInput}>
        <div className="max-h-[60vh] overflow-y-auto p-2">
          <button
            onClick={() => move(null)}
            className={cn(
              "flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold transition-colors",
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
                  "flex w-full items-center gap-2 rounded-xl py-2.5 pr-3 text-sm font-bold transition-colors",
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
    </AdminModal>
  );
}
