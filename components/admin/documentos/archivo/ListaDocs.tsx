"use client";

import { DataTable } from "@buleje/design-system";
import { cn } from "@/lib/utils";
import { ArrowUpDown, Star } from "@buleje/design-system/icons";
import FilaCarpetaDetalles from "../explorador/FilaCarpetaDetalles";
import { getFileIcon, formatBytes } from "../archivo-visual";
import { ExpiryBadge, FolderChip } from "./piezas-sueltas";
import PorQueAparecio from "../PorQueAparecio";
import { StatusControl } from "./estado-doc";
import { tagsVisibles } from "./compartido";
import { formatDateShort } from "@/lib/format";
import type { ModeloArchivo } from "./use-archivo";
export default function ListaDocs({ arch }: { arch: ModeloArchivo }) {
  const { selectedIds, displayDocs, selectAll, clearSelection, sortBy, setSortBy, colsVisibles,
    explorandoVista, ex, abrirCarpetaExp, dropDocOnFolder, abrirMenuEn, setPreview, toggleSelect, renaming,
    setRenaming, commitRename, startRename, terminosBusqueda, patch, filterMode, folderById, setFilterMode,
    setActiveFolderId, menuDe } = arch;
  return (
    <>
            <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl overflow-hidden">
              <DataTable className="w-full">
                <thead>
                  <tr>
                    <th className="w-10">
                      <input
                        type="checkbox"
                        aria-label="Seleccionar todos"
                        checked={selectedIds.size > 0 && selectedIds.size === displayDocs.length}
                        onChange={(e) => (e.target.checked ? selectAll() : clearSelection())}
                        className="h-4 w-4 rounded border border-[var(--rule-base)] accent-[var(--color-primary)]"
                      />
                    </th>
                    {(() => {
                      // Clickear el header ordena por esa columna — antes sólo se
                      // podía cambiar el orden desde el <select> de la toolbar,
                      // sin ninguna pista visual de cuál estaba activo en la tabla.
                      const sortTh = (
                        label: string,
                        value: "name" | "size" | "expiry" | "recent",
                        opts: { align?: "left" | "right"; extraClass?: string } = {},
                      ) => {
                        const { align = "left", extraClass } = opts;
                        const active = sortBy === value;
                        return (
                          <th className={cn("", align === "right" ? "text-right" : "text-left", extraClass)}>
                            <button
                              type="button"
                              onClick={() => setSortBy(value)}
                              title={`Ordenar por ${label.toLowerCase()}`}
                              className={cn(
                                "inline-flex items-center gap-1 text-[length:var(--ts-2xs,11px)] font-bold uppercase tracking-wider transition-colors",
                                align === "right" && "flex-row-reverse",
                                active ? "text-primary" : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                              )}
                            >
                              {label}
                              <ArrowUpDown className={cn("h-3 w-3 shrink-0", active ? "opacity-100" : "opacity-40")} />
                            </button>
                          </th>
                        );
                      };
                      return (
                        <>
                          {sortTh("Nombre", "name")}
                          {colsVisibles.categoria && <th className="hidden sm:table-cell">Categoría</th>}
                          {colsVisibles.etiquetas && <th className="hidden lg:table-cell">Etiquetas</th>}
                          {colsVisibles.vencimiento && sortTh("Vencimiento", "expiry", { extraClass: "hidden lg:table-cell" })}
                          {colsVisibles.tamano && sortTh("Tamaño", "size", { align: "right", extraClass: "hidden md:table-cell" })}
                          {colsVisibles.subido && sortTh("Subido", "recent", { align: "right", extraClass: "hidden md:table-cell" })}
                        </>
                      );
                    })()}
                    <th className="text-center">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--rule-soft,#f1f5f9)]">
                  {/* Detalles = explorador: las carpetas de acá arriba de los archivos. */}
                  {explorandoVista && ex.contenido.carpetas.map((f) => (
                    <FilaCarpetaDetalles
                      key={f.id}
                      carpeta={f}
                      cols={colsVisibles}
                      onAbrir={() => abrirCarpetaExp(f.id)}
                      onMenu={(punto) => ex.abrirMenu({ tipo: "carpeta", carpeta: f }, punto)}
                      onSoltarDoc={(docId) => void dropDocOnFolder(docId, f.id)}
                    />
                  ))}
                  {(explorandoVista ? ex.contenido.docs : displayDocs).map((doc) => {
                    const { Icon, tint, bg } = getFileIcon(doc.mimeType, doc.name);
                    return (
                      <tr
                        key={doc.id}
                        onContextMenu={(e) => abrirMenuEn(e, doc.id)}
                        onDoubleClick={(e) => { if (!(e.target as HTMLElement).closest("button, input, a")) setPreview(doc); }}
                        className={cn("", selectedIds.has(doc.id) && "bg-primary/5")}
                      >
                        <td>
                          <input
                            type="checkbox"
                            aria-label={`Seleccionar ${doc.name}`}
                            checked={selectedIds.has(doc.id)}
                            onChange={() => toggleSelect(doc.id)}
                            className="h-4 w-4 rounded border border-[var(--rule-base)] accent-[var(--color-primary)]"
                          />
                        </td>
                        <td>
                          {renaming?.id === doc.id ? (
                            <input
                              type="text"
                              value={renaming.value}
                              onChange={(e) => setRenaming({ ...renaming, value: e.target.value })}
                              onKeyDown={(e) => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") setRenaming(null); }}
                              onBlur={commitRename}
                              ref={(el) => el?.focus()}
                              aria-label={`Renombrar ${doc.name}`}
                              className="w-full max-w-[320px] px-2 py-1 rounded-xl border-2 border-primary text-sm font-bold outline-none bg-[var(--surface-raised)] text-[var(--text-primary)]"
                            />
                          ) : (
                            <button onClick={() => setPreview(doc)} onDoubleClick={(e) => { e.preventDefault(); startRename(doc); }} className="flex items-center gap-3 text-left min-w-0 hover:text-primary transition-colors" title="Doble-click para renombrar">
                              <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg shrink-0", bg)}>
                                <Icon className={cn("h-4 w-4", tint)} />
                              </span>
                              <span className="font-bold text-[var(--text-primary)] truncate max-w-[280px]">{doc.name}</span>
                              {doc.favorite && <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400 shrink-0" />}
                              {doc.versionCount && doc.versionCount > 0 && (
                                <span className="text-[length:var(--ts-2xs)] px-1.5 py-0.5 rounded bg-[var(--data-info-500)]/15 text-[var(--data-info-700)] dark:text-[var(--data-info-500)] font-bold">v{doc.versionCount + 1}</span>
                              )}
                              <ExpiryBadge expiresAt={doc.expiresAt} />
                            </button>
                          )}
                          {/* Fuera del botón a propósito: un <p> adentro de un
                              <button> es HTML inválido y rompe el clic. */}
                          {renaming?.id !== doc.id && (
                            <PorQueAparecio doc={doc} terminos={terminosBusqueda} variante="list" />
                          )}
                        </td>
                        {colsVisibles.categoria && (
                        <td className="hidden sm:table-cell">
                          <div className="flex flex-col items-start gap-1">
                            <span className="text-xs text-[var(--text-secondary)] capitalize">{doc.category}</span>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <StatusControl status={doc.status} onChange={(s) => patch(doc.id, { status: s })} />
                              {filterMode !== "folder" && (
                                <FolderChip
                                  nombre={doc.folderId ? folderById.get(doc.folderId)?.name ?? null : null}
                                  onClick={() => { if (doc.folderId) { setFilterMode("folder"); setActiveFolderId(doc.folderId); } }}
                                />
                              )}
                            </div>
                          </div>
                        </td>
                        )}
                        {colsVisibles.etiquetas && (
                          <td className="hidden lg:table-cell">
                            {tagsVisibles(doc.tags).length > 0 ? (
                              <div className="flex flex-wrap items-center gap-1">
                                {tagsVisibles(doc.tags).slice(0, 3).map((t) => (
                                  <span key={t} className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[length:var(--ts-2xs,11px)] font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]">#{t}</span>
                                ))}
                                {tagsVisibles(doc.tags).length > 3 && (
                                  <span className="text-[length:var(--ts-2xs,11px)] text-[var(--text-tertiary)]">+{tagsVisibles(doc.tags).length - 3}</span>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-[var(--text-tertiary)]">—</span>
                            )}
                          </td>
                        )}
                        {colsVisibles.vencimiento && (
                          <td className="hidden lg:table-cell">
                            {doc.expiresAt ? <ExpiryBadge expiresAt={doc.expiresAt} /> : <span className="text-xs text-[var(--text-tertiary)]">—</span>}
                          </td>
                        )}
                        {colsVisibles.tamano && (
                          <td className="text-right hidden md:table-cell tabular-nums text-[var(--text-secondary)]">{formatBytes(doc.size)}</td>
                        )}
                        {colsVisibles.subido && (
                          <td className="text-right hidden md:table-cell tabular-nums text-[var(--text-tertiary)]">
                            {formatDateShort(doc.uploadedAt)}
                          </td>
                        )}
                        <td className="text-center">
                          {menuDe(doc)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </DataTable>
            </div>
    </>
  );
}