"use client";

import { cn } from "@/lib/utils";
import { MIME_EXPLORADOR, leerCarga, arrastreActual, fijarArrastre } from "../explorador/destino-soltar";
import { CheckSquare, Plus } from "@buleje/design-system/icons";
import type { ModeloArchivo } from "./use-archivo";
export default function RaizDelArbol({ arch }: { arch: ModeloArchivo }) {
  const { rootDropActive, ex, setRootDropActive, draggingFolderId, folderById, dropFolderOnFolder, folders,
    selectingFolders, salirSeleccion, setSelectingFolders, openCreateChild } = arch;
  return (
    <>
          <div
            className={cn("flex items-center justify-between px-3 py-2 rounded-lg transition-all", rootDropActive && "bg-primary/10 ring-2 ring-primary")}
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes(MIME_EXPLORADOR)) {
                if (!ex.barra.puedeSoltar(null)) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setRootDropActive(true);
                return;
              }
              if (!e.dataTransfer.types.includes("application/x-folder-id")) return;
              if (draggingFolderId && (folderById.get(draggingFolderId)?.parentId ?? null) === null) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              setRootDropActive(true);
            }}
            onDragLeave={() => setRootDropActive(false)}
            onDrop={(e) => {
              if (e.dataTransfer.types.includes(MIME_EXPLORADOR)) {
                e.preventDefault();
                e.stopPropagation();
                setRootDropActive(false);
                const carga = leerCarga(e.dataTransfer) ?? arrastreActual();
                fijarArrastre(null);
                if (carga) ex.barra.onSoltar(carga, null);
                return;
              }
              if (!e.dataTransfer.types.includes("application/x-folder-id")) return;
              e.preventDefault();
              e.stopPropagation();
              dropFolderOnFolder(e.dataTransfer.getData("application/x-folder-id"), null);
            }}
          >
            <p className="text-[length:var(--ts-2xs,11px)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
              {draggingFolderId ? "Suelta acá → raíz" : "Carpetas"}
            </p>
            <div className="flex items-center gap-0.5">
              {folders.length > 1 && (
                <button
                  onClick={() => (selectingFolders ? salirSeleccion() : setSelectingFolders(true))}
                  aria-pressed={selectingFolders}
                  className={cn(
                    "h-6 w-6 inline-flex items-center justify-center rounded-lg transition-colors",
                    selectingFolders
                      ? "bg-primary text-white"
                      : "text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-primary",
                  )}
                  aria-label={selectingFolders ? "Salir de la selección" : "Seleccionar varias carpetas"}
                  title={selectingFolders ? "Salir de la selección" : "Seleccionar varias carpetas"}
                >
                  <CheckSquare className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                onClick={() => openCreateChild(null)}
                className="h-6 w-6 inline-flex items-center justify-center rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-primary transition-colors"
                aria-label="Nueva carpeta"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
    </>
  );
}