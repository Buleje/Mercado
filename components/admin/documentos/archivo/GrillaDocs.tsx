"use client";

import { DocCard } from "./DocCard";
import type { ModeloArchivo } from "./use-archivo";
export default function GrillaDocs({ arch }: { arch: ModeloArchivo }) {
  const { displayDocs, tarjetasVisibles, selectedIds, renaming, terminosBusqueda, filterMode, folderById,
    toggleSelect, setPreview, filtros, patch, reloadAllTags, menuDe, abrirMenuEn, startRename, commitRename,
    setRenaming, setDraggingDocId, setDragOverFolderId, draggingDocId, setTarjetasVisibles } = arch;
  return (
    <>
            <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
              {displayDocs.slice(0, tarjetasVisibles).map((doc) => (
                <DocCard
                  key={doc.id}
                  doc={doc}
                  selected={selectedIds.has(doc.id)}
                  isRenaming={renaming?.id === doc.id}
                  renameValue={renaming?.id === doc.id ? renaming.value : doc.name}
                  terminos={terminosBusqueda}
                  folderNombre={filterMode === "folder" ? undefined : (doc.folderId ? folderById.get(doc.folderId)?.name ?? null : null)}
                  onSelect={() => toggleSelect(doc.id)}
                  onPreview={() => setPreview(doc)}
                  tagsActivos={filtros.tags}
                  onPromoteAiTag={(t) => {
                    if (doc.tags.includes(t)) return;
                    patch(doc.id, { tags: [...doc.tags, t] });
                    reloadAllTags();
                  }}
                  onSetStatus={(s) => patch(doc.id, { status: s })}
                  menu={menuDe(doc, "flotante")}
                  onMenuContextual={(e) => abrirMenuEn(e, doc.id)}
                  onStartRename={() => startRename(doc)}
                  onCommitRename={commitRename}
                  onCancelRename={() => setRenaming(null)}
                  onRenameChange={(v) => setRenaming(renaming ? { ...renaming, value: v } : null)}
                  onDragStart={(e) => {
                    e.dataTransfer.setData("application/x-doc-id", doc.id);
                    e.dataTransfer.effectAllowed = "move";
                    setDraggingDocId(doc.id);
                  }}
                  onDragEnd={() => { setDraggingDocId(null); setDragOverFolderId(null); }}
                  dragging={draggingDocId === doc.id}
                />
              ))}
            </div>
            {displayDocs.length > tarjetasVisibles && (
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={() => setTarjetasVisibles((n) => n + 20)}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-5 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:border-primary hover:text-primary"
                >
                  Ver más <span className="tabular-nums text-[var(--text-tertiary)]">({displayDocs.length - tarjetasVisibles} restantes)</span>
                </button>
              </div>
            )}
            </div>
    </>
  );
}