"use client";

import { Sparkles, FolderArchive, ChevronRight, FileArchive } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { FolderGlyph } from "../folder-visuals";
import type { ModeloArchivo } from "./use-archivo";
export default function RutaDeCarpeta({ arch }: { arch: ModeloArchivo }) {
  const { semantic, ex, filterMode, activePath, setFilterMode, setActiveFolderId, displayDocs,
    downloadFolderZip, zipping, activeChildren, dragOverFolderId, setExpandedFolders, setDragOverFolderId,
    dropDocOnFolder } = arch;
  return (
    <>
          {/* Indicador del modo de búsqueda IA (semántica) */}
          {semantic && (
            <div className="flex items-center gap-2 rounded-lg bg-[var(--accent)]/10 px-3 py-1.5 text-xs font-medium text-[var(--accent)]">
              <Sparkles className="h-3.5 w-3.5 shrink-0" />
              Modo IA activo: describe el documento (ej. &ldquo;el contrato del local&rdquo;), no solo palabras exactas.
            </div>
          )}

          {/* Breadcrumbs de la carpeta activa (subcarpetas anidadas) — en
              Tarjetas; el explorador tiene su propia barra. */}
          {!ex.explorando && filterMode === "folder" && activePath.length > 0 && (
            <nav className="flex items-center gap-1 flex-wrap text-sm" aria-label="Ruta de carpetas">
              <button
                onClick={() => { setFilterMode("all"); setActiveFolderId(null); }}
                className="inline-flex items-center gap-1.5 font-bold text-[var(--text-tertiary)] hover:text-primary transition-colors"
              >
                <FolderArchive className="h-4 w-4" /> Todos
              </button>
              {activePath.map((f, i) => {
                const last = i === activePath.length - 1;
                return (
                  <span key={f.id} className="inline-flex items-center gap-1">
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--text-tertiary)]" />
                    <button
                      onClick={() => { setFilterMode("folder"); setActiveFolderId(f.id); }}
                      disabled={last}
                      className={cn(
                        "font-bold rounded-xl px-1 transition-colors",
                        last ? "text-primary" : "text-[var(--text-secondary)] hover:text-primary"
                      )}
                    >
                      {f.name}
                    </button>
                  </span>
                );
              })}
              {displayDocs.length > 0 && (
                <button
                  onClick={downloadFolderZip}
                  disabled={zipping}
                  className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 py-1.5 text-xs font-bold text-[var(--text-secondary)] transition-colors hover:border-primary hover:text-primary disabled:opacity-60"
                  title="Descargar todos los documentos de esta carpeta en un ZIP"
                >
                  <FileArchive className="h-3.5 w-3.5" /> {zipping ? "Comprimiendo…" : "Descargar carpeta (ZIP)"}
                </button>
              )}
            </nav>
          )}

          {/* Subcarpetas de la carpeta activa — atajo para bajar un nivel */}
          {!ex.explorando && filterMode === "folder" && activeChildren.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[length:var(--ts-2xs,11px)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Subcarpetas</span>
              {activeChildren.map((f) => {
                const dropTarget = dragOverFolderId === f.id;
                return (
                  <button
                    key={f.id}
                    onClick={() => { setFilterMode("folder"); setActiveFolderId(f.id); setExpandedFolders((prev) => new Set(prev).add(f.id)); }}
                    onDragOver={(e) => {
                      if (!e.dataTransfer.types.includes("application/x-doc-id")) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      if (dragOverFolderId !== f.id) setDragOverFolderId(f.id);
                    }}
                    onDragLeave={() => setDragOverFolderId((cur) => (cur === f.id ? null : cur))}
                    onDrop={(e) => {
                      if (!e.dataTransfer.types.includes("application/x-doc-id")) return;
                      e.preventDefault();
                      e.stopPropagation();
                      dropDocOnFolder(e.dataTransfer.getData("application/x-doc-id"), f.id);
                    }}
                    className={cn(
                      "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border-2 bg-[var(--surface-raised)] text-sm font-bold text-[var(--text-secondary)] hover:border-primary hover:text-primary transition-colors",
                      dropTarget ? "border-primary ring-2 ring-primary" : "border-[var(--rule-base)]"
                    )}
                  >
                    <FolderGlyph folder={f} className="h-4 w-4" /> {f.name}
                    {f.documentCount !== undefined && f.documentCount > 0 && (
                      <span className="tabular-nums text-[var(--text-tertiary)]">{f.documentCount}</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
    </>
  );
}