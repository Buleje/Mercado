"use client";

import { useEffect, useMemo } from "react";
import { DataTable } from "@buleje/design-system";
import { BarraFiltrosTabla, FiltroEnCabecera, SinCoincidenciasFila, useFiltrosTabla, type ColumnaFiltro } from "@/components/admin/forestal/filtros-tabla-forestal";
import { diaDeVigencia } from "@/lib/cotizaciones/vigencia";
import type { DbDocument } from "@/lib/types/documents";
import { cn } from "@/lib/utils";
import { ArrowUpDown, Star } from "@buleje/design-system/icons";
import FilaCarpetaDetalles from "../explorador/FilaCarpetaDetalles";
import { getFileIcon, formatBytes } from "../archivo-visual";
import { ExpiryBadge, FolderChip } from "./piezas-sueltas";
import PorQueAparecio from "../PorQueAparecio";
import { StatusControl } from "./estado-doc";
import { tagsVisibles } from "./compartido";
import { formatDateShort } from "@/lib/format";
import { CodigoChip } from "../CodigoDocumento";
import type { ModeloArchivo } from "./use-archivo";
export default function ListaDocs({ arch }: { arch: ModeloArchivo }) {
  const { selectedIds, setSelectedIds, displayDocs, clearSelection, sortBy, setSortBy, colsVisibles,
    explorandoVista, ex, abrirCarpetaExp, dropDocOnFolder, abrirMenuEn, setPreview, toggleSelect, renaming,
    setRenaming, commitRename, startRename, terminosBusqueda, patch, filterMode, folderById, setFilterMode,
    setActiveFolderId, menuDe } = arch;
  const base = explorandoVista ? ex.contenido.docs : displayDocs;
  // Filtros de columna sobre lo que ya dejaron la búsqueda y los filtros de arriba; el orden sigue siendo el de «Ordenar por».
  const columnas = useMemo<readonly ColumnaFiltro<DbDocument>[]>(() => [
    { id: "nombre", label: "Nombre", tipo: "texto", valor: (d) => d.name },
    { id: "categoria", label: "Categoría", tipo: "multi", valor: (d) => d.category || null, visible: colsVisibles.categoria, soloConVarios: true },
    { id: "etiquetas", label: "Etiquetas", tipo: "multi", valor: (d) => tagsVisibles(d.tags), visible: colsVisibles.etiquetas },
    { id: "vencimiento", label: "Vencimiento", tipo: "fecha", numero: (d) => diaDeVigencia(d.expiresAt), visible: colsVisibles.vencimiento },
    { id: "tamano", label: "Tamaño", tipo: "rango", numero: (d) => Math.round(((d.size ?? 0) / 1048576) * 100) / 100, unidad: "MB", paso: 0.1, visible: colsVisibles.tamano },
    { id: "subido", label: "Subido", tipo: "fecha", numero: (d) => diaDeVigencia(d.uploadedAt), visible: colsVisibles.subido },
  ], [colsVisibles]);
  const f = useFiltrosTabla(base, columnas);
  const filas = f.filtradas;
  const todosLocal = filas.length > 0 && filas.every((d) => selectedIds.has(d.id));
  // Elegir y después filtrar: lo que el filtro de columna esconde deja de estar elegido, así
  // mover, etiquetar o mandar a la papelera nunca toca un papel que no se ve.
  useEffect(() => {
    if (f.activos === 0) return;
    const visibles = new Set(filas.map((d) => d.id));
    const escondidos = base.filter((d) => selectedIds.has(d.id) && !visibles.has(d.id)).map((d) => d.id);
    if (escondidos.length === 0) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of escondidos) next.delete(id);
      return next;
    });
  }, [f.activos, filas, base, selectedIds, setSelectedIds]);
  return (
    <>
      <BarraFiltrosTabla f={f} plegableSiempre className="mb-2" />
            <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl overflow-hidden">
              <DataTable className="w-full">
                <thead>
                  <tr>
                    <th className="w-10">
                      <input
                        type="checkbox"
                        aria-label="Seleccionar todos"
                        checked={todosLocal}
                        onChange={(e) => (e.target.checked ? setSelectedIds(new Set(filas.map((d) => d.id))) : clearSelection())}
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
                        filtro: string,
                        opts: { align?: "left" | "right"; extraClass?: string } = {},
                      ) => {
                        const { align = "left", extraClass } = opts;
                        const active = sortBy === value;
                        return (
                          <th className={cn("", align === "right" ? "text-right" : "text-left", extraClass)}>
                            <span className={cn("inline-flex flex-col gap-1", align === "right" ? "items-end" : "items-start")}>
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
                            <FiltroEnCabecera id={filtro} f={f} compacto />
                            </span>
                          </th>
                        );
                      };
                      return (
                        <>
                          {sortTh("Nombre", "name", "nombre")}
                          {colsVisibles.categoria && <th className="hidden sm:table-cell">Categoría <FiltroEnCabecera id="categoria" f={f} compacto /></th>}
                          {colsVisibles.etiquetas && <th className="hidden lg:table-cell">Etiquetas <FiltroEnCabecera id="etiquetas" f={f} compacto /></th>}
                          {colsVisibles.vencimiento && sortTh("Vencimiento", "expiry", "vencimiento", { extraClass: "hidden lg:table-cell" })}
                          {colsVisibles.tamano && sortTh("Tamaño", "size", "tamano", { align: "right", extraClass: "hidden md:table-cell" })}
                          {colsVisibles.subido && sortTh("Subido", "recent", "subido", { align: "right", extraClass: "hidden md:table-cell" })}
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
                  {filas.length === 0 && f.activos > 0 && <SinCoincidenciasFila colSpan={8} />}
                  {filas.map((doc) => {
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
                            <div className="flex min-w-0 items-center gap-2">
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
                            {/* ADR-516 — fuera del botón del nombre: clic = copiar el código. */}
                            <CodigoChip doc={doc} />
                            </div>
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