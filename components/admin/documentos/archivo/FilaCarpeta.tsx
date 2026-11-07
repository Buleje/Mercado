"use client";

import { fijarArrastre, MIME_EXPLORADOR, leerCarga, arrastreActual } from "../explorador/destino-soltar";
import { cn } from "@/lib/utils";
import { descendantIds } from "@/lib/documentos/folder-tree";
import { ChevronRight, Check, MoreHorizontal } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import { FolderGlyph } from "../folder-visuals";
import MarcasCarpeta from "../explorador/MarcasCarpeta";
import { tagsVisibles } from "./compartido";
import type { ModeloArchivo } from "./use-archivo";
import type { DbDocumentFolder } from "@/lib/types/documents";
export default function FilaCarpeta({ arch, f, depth, hasChildren }: { arch: ModeloArchivo; f: DbDocumentFolder; depth: number; hasChildren: boolean }) {
  const { filterMode, activeFolderId, dragOverFolderId, expandedFolders, setDraggingFolderId,
    setDragOverFolderId, setRootDropActive, draggingFolderId, ex, childrenMap, dropFolderOnFolder,
    dropDocOnFolder, selectingFolders, selectedFolderIds, toggleFolderSelected, toggleExpand, setFilterMode,
    setActiveFolderId,
    newFolderParent, newFolderName, setNewFolderName, handleCreateFolder, setNewFolderParent } = arch;
              const active = filterMode === "folder" && activeFolderId === f.id;
              const dropTarget = dragOverFolderId === f.id;
              const isOpen = expandedFolders.has(f.id);
  return (
                <li key={f.id}>
                  <div
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("application/x-folder-id", f.id);
                      e.dataTransfer.effectAllowed = "move";
                      setDraggingFolderId(f.id);
                      // Para que las carpetas del explorador y la ruta la reciban.
                      fijarArrastre({ docs: [], carpetas: [f.id] });
                    }}
                    onDragEnd={() => { setDraggingFolderId(null); setDragOverFolderId(null); setRootDropActive(false); fijarArrastre(null); }}
                    className={cn(
                      "group relative rounded-lg transition-all",
                      dropTarget && "bg-primary/10 ring-2 ring-primary",
                      draggingFolderId === f.id && "opacity-40"
                    )}
                    onDragOver={(e) => {
                      const t = e.dataTransfer.types;
                      // Lo que viene del explorador (uno o varios) pasa por sus reglas y se deshace con Ctrl+Z.
                      if (t.includes(MIME_EXPLORADOR)) {
                        if (!ex.barra.puedeSoltar(f.id)) return;
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "move";
                        if (dragOverFolderId !== f.id) setDragOverFolderId(f.id);
                        return;
                      }
                      const isDoc = t.includes("application/x-doc-id");
                      const isFolder = t.includes("application/x-folder-id");
                      if (!isDoc && !isFolder) return;
                      // Reparent inválido: sobre sí misma o sobre un descendiente.
                      if (isFolder && draggingFolderId && (draggingFolderId === f.id || descendantIds(childrenMap, draggingFolderId).has(f.id))) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      if (dragOverFolderId !== f.id) setDragOverFolderId(f.id);
                    }}
                    onDragLeave={() => setDragOverFolderId((cur) => (cur === f.id ? null : cur))}
                    onDrop={(e) => {
                      const t = e.dataTransfer.types;
                      if (t.includes(MIME_EXPLORADOR)) {
                        e.preventDefault();
                        e.stopPropagation();
                        setDragOverFolderId(null);
                        const carga = leerCarga(e.dataTransfer) ?? arrastreActual();
                        fijarArrastre(null);
                        if (carga) ex.barra.onSoltar(carga, f.id);
                      } else if (t.includes("application/x-folder-id")) {
                        e.preventDefault();
                        e.stopPropagation();
                        dropFolderOnFolder(e.dataTransfer.getData("application/x-folder-id"), f.id);
                      } else if (t.includes("application/x-doc-id")) {
                        e.preventDefault();
                        e.stopPropagation();
                        dropDocOnFolder(e.dataTransfer.getData("application/x-doc-id"), f.id);
                      }
                    }}
                  >
                    <div className="flex items-stretch" style={{ paddingLeft: depth * 14 }}>
                      {selectingFolders && (
                        <label
                          className="flex shrink-0 cursor-pointer items-center pl-1 pr-0.5"
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={selectedFolderIds.has(f.id)}
                            onChange={() => toggleFolderSelected(f.id)}
                            className="h-3.5 w-3.5 accent-[var(--accent)]"
                            aria-label={`Seleccionar la carpeta ${f.name}`}
                          />
                        </label>
                      )}
                      {hasChildren ? (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); toggleExpand(f.id); }}
                          className="shrink-0 w-5 inline-flex items-center justify-center text-[var(--text-tertiary)] hover:text-primary"
                          aria-label={isOpen ? `Colapsar ${f.name}` : `Expandir ${f.name}`}
                          aria-expanded={isOpen}
                        >
                          <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", isOpen && "rotate-90")} />
                        </button>
                      ) : (
                        <span className="shrink-0 w-5" />
                      )}
                      <button
                        onClick={() => { setFilterMode("folder"); setActiveFolderId(f.id); }}
                        onContextMenu={(e) => { e.preventDefault(); ex.abrirMenu({ tipo: "carpeta", carpeta: f }, { x: e.clientX, y: e.clientY }); }}
                        // El nombre completo con el aviso del navegador: el cartel oscuro de antes salía
                        // al instante y tapaba la carpeta de abajo (Brandon 31-10).
                        title={f.name}
                        className={cn(
                          "relative flex-1 min-w-0 flex items-center gap-2 py-2 pr-1 rounded-xl text-sm font-bold transition-colors",
                          active ? "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]" : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
                        )}
                      >
                        <FolderGlyph folder={f} active={active} className="h-4 w-4 shrink-0" />
                        <span className="flex-1 text-left truncate">{f.name}</span>
                        <MarcasCarpeta carpeta={f} />
                        {/* Con el checkbox puesto, el ancho del sidebar no alcanza
                            para nombre + etiquetas: en modo selección hay que poder
                            LEER qué se marca, así que los chips se guardan. */}
                        {tagsVisibles(f.tags).length > 0 && !selectingFolders && (
                          <span className="hidden shrink-0 items-center gap-0.5 xl:flex" title={`Etiquetas: ${tagsVisibles(f.tags).join(", ")}`}>
                            {tagsVisibles(f.tags).slice(0, 2).map((t) => (
                              <span
                                key={t}
                                className="rounded-full bg-[var(--surface-sunken)] px-1.5 text-[length:var(--ts-2xs,11px)] font-medium text-[var(--text-tertiary)]"
                              >
                                {t}
                              </span>
                            ))}
                            {tagsVisibles(f.tags).length > 2 && (
                              <span className="text-[length:var(--ts-2xs,11px)] text-[var(--text-tertiary)]">+{tagsVisibles(f.tags).length - 2}</span>
                            )}
                          </span>
                        )}
                        {f.documentCount !== undefined && f.documentCount > 0 && (
                          <span className={cn(
                            "text-[length:var(--ts-2xs,11px)] tabular-nums px-1.5 py-0.5 rounded-md font-bold",
                            active ? "bg-primary text-white" : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]"
                          )}>
                            {f.documentCount}
                          </span>
                        )}
                      </button>
                      {/* Un «⋯» con su propio lugar (no encima de la estrella, el vínculo ni la cifra):
                          abre el mismo menú del clic derecho, que trae Nueva subcarpeta, Cambiar ícono,
                          Compartir, Eliminar y el resto (Brandon 31-10: «que no se superpongan»). */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const r = e.currentTarget.getBoundingClientRect();
                          ex.abrirMenu({ tipo: "carpeta", carpeta: f }, { x: r.left, y: r.bottom });
                        }}
                        className={button({ variant: "ghost", size: "icon", className: "h-9 w-8 shrink-0 self-center rounded-lg text-[var(--text-tertiary)] opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100" })}
                        aria-label={`Opciones de ${f.name}`}
                        title="Opciones (también con clic derecho)"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  {newFolderParent === f.id && (
                    <div className="flex items-stretch gap-1 py-1 pr-2" style={{ paddingLeft: (depth + 1) * 14 + 20 }}>
                      <input
                        value={newFolderName}
                        onChange={(e) => setNewFolderName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") handleCreateFolder(); if (e.key === "Escape") { setNewFolderParent(undefined); setNewFolderName(""); } }}
                        ref={(el) => el?.focus()}
                        placeholder="Subcarpeta…"
                        className="flex-1 min-w-0 px-2 py-1.5 rounded-xl border border-[var(--rule-base)] text-xs outline-none focus:border-primary"
                      />
                      <button aria-label="Confirmar" onClick={handleCreateFolder} className="px-2 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary-dark shrink-0"><Check className="h-3 w-3" /></button>
                    </div>
                  )}
                </li>
  );
}