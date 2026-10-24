"use client";

import { Star, MoreHorizontal, FileArchive, MessageCircle, Combine, FolderArchive, Hash, Tag, Trash2, Undo2 } from "@buleje/design-system/icons";
import { type EstadoDoc, ORDEN_ESTADOS, META_ESTADO } from "@/lib/documents/estados-doc";
import { button } from "@/components/ui-system/button-variants";
import type { ModeloArchivo } from "./use-archivo";

/** ADR-516 — los botones del código en el físico, del DS (la barra es turquesa). */
const BOTON_DE_LA_BARRA = button({ variant: "ghost", size: "xs", className: "gap-1 rounded-lg bg-white/20 px-2.5 text-xs text-white hover:bg-white/30" });
const OPCION_DEL_MENU = button({ variant: "ghost", size: "md", className: "w-full justify-start gap-2 rounded-none px-3 font-medium" });

export default function BarraDeSeleccion({ arch }: { arch: ModeloArchivo }) {
  const { selectedIds, todosElegidos, setSelectedIds, selectAll, hayFiltroPuesto, displayDocs, bulkFavorite,
    bulkStatus, bulkMoreBtnRef, bulkMoreOpen, setBulkMoreOpen, setBulkMorePos, bulkMorePos, bulkMove,
    allFolderRows, bulkDownloadZip, zipping, documents, setWhatsappDoc, handleMerge, merging, setExpediente,
    setBulkTagModalOpen, bulkDelete, clearSelection, bulkCodigoFisico, filterMode } = arch;
  const enPapelera = filterMode === "trash";
  return (
    <>
          {/* Bulk bar — `flex-wrap` porque con las acciones de estado ya no
              entra en una línea y los textos se montaban unos sobre otros
              ("EliminarCancelar"). Que baje de renglón es preferible. */}
          {selectedIds.size > 0 && (
            <div className="sticky top-2 z-30 flex flex-wrap items-center gap-x-2 gap-y-1.5 px-4 py-2.5 rounded-2xl bg-primary text-white shadow-lg">
              <span className="text-sm font-bold tabular-nums">{selectedIds.size} seleccionado(s)</span>
              <button
                onClick={() => (todosElegidos ? setSelectedIds(new Set()) : selectAll())}
                className="text-xs px-2.5 py-1 rounded-lg bg-white/20 hover:bg-white/30 font-bold"
                title={
                  hayFiltroPuesto
                    ? "Elige todo lo que quedó tras filtrar, no todo el drive"
                    : "Elige todos los que están a la vista"
                }
              >
                {todosElegidos
                  ? "Ninguno"
                  : hayFiltroPuesto
                    ? `Elegir los ${displayDocs.length} filtrados`
                    : `Elegir los ${displayDocs.length}`}
              </button>
              <button onClick={() => bulkFavorite(true)} className="text-xs px-2.5 py-1 rounded-lg bg-white/20 hover:bg-white/30 font-bold inline-flex items-center gap-1">
                <Star className="h-3 w-3" /> Favorito
              </button>
              {/* ADR-516 — ya le escribí el código a cada papel físico de la pila. */}
              {!enPapelera && (
                <button
                  type="button"
                  onClick={() => bulkCodigoFisico(true)}
                  className={BOTON_DE_LA_BARRA}
                  title="Ya escribiste su código en cada papel físico"
                  data-qa="bulk-codigo-fisico"
                >
                  <Hash className="h-3 w-3" /> Código puesto
                </button>
              )}

              {/* Los dos veredictos de todos los días, a un clic. El resto de
                  estados vive en el menú de al lado. */}
              <span className="ml-1 h-5 w-px bg-white/30" aria-hidden />
              <button
                onClick={() => bulkStatus("approved")}
                className="text-xs px-2.5 py-1 rounded-lg bg-white/20 hover:bg-white/30 font-bold inline-flex items-center gap-1.5"
                title="Marcar como aprobado: está bien, se puede usar"
              >
                <span className="h-2.5 w-2.5 rounded-full bg-[var(--data-success-500)] ring-1 ring-white/70" aria-hidden />
                Está bien
              </button>
              <button
                onClick={() => bulkStatus("observado")}
                className="text-xs px-2.5 py-1 rounded-lg bg-white/20 hover:bg-white/30 font-bold inline-flex items-center gap-1.5"
                title="Marcar para corregir: tiene algo mal"
              >
                <span className="h-2.5 w-2.5 rounded-full bg-[var(--data-error-500)] ring-1 ring-white/70" aria-hidden />
                Hay que corregir
              </button>
              <select
                onChange={(e) => { const v = e.target.value; if (v) bulkStatus(v as EstadoDoc); e.currentTarget.selectedIndex = 0; }}
                defaultValue=""
                className="text-xs px-2 py-1 rounded-xl bg-white/20 hover:bg-white/30 text-white font-bold outline-none cursor-pointer [&>option]:text-[var(--text-primary)]"
                title="Marcar con otro estado"
                aria-label="Marcar con otro estado"
              >
                <option value="" disabled>Otro estado…</option>
                {ORDEN_ESTADOS.map((e) => (
                  <option key={e} value={e}>{META_ESTADO[e].label}</option>
                ))}
                <option value="none">Quitar el estado</option>
              </select>
              {/* Acciones menos frecuentes (mover, ZIP, WhatsApp, combinar) agrupadas
                  acá — la fila crecía sin límite cada vez que se sumaba una acción
                  bulk nueva y terminaba ilegible en pantallas angostas. */}
              <button
                ref={bulkMoreBtnRef}
                onClick={(e) => {
                  e.stopPropagation();
                  if (bulkMoreOpen) { setBulkMoreOpen(false); return; }
                  const r = bulkMoreBtnRef.current?.getBoundingClientRect();
                  if (r) setBulkMorePos({ top: r.bottom + 4, right: window.innerWidth - r.right });
                  setBulkMoreOpen(true);
                }}
                className="text-xs px-2.5 py-1 rounded-lg bg-white/20 hover:bg-white/30 font-bold inline-flex items-center gap-1"
                aria-label="Más acciones para la selección"
              >
                <MoreHorizontal className="h-3 w-3" /> Más
              </button>
              {bulkMoreOpen && bulkMorePos && (
                <div
                  className="fixed z-50 min-w-[200px] overflow-hidden rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] py-1 shadow-xl"
                  style={{ top: bulkMorePos.top, right: bulkMorePos.right }}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <select
                    onChange={(e) => { const v = e.target.value; if (v) { bulkMove(v === "__none__" ? null : v); } setBulkMoreOpen(false); }}
                    defaultValue=""
                    className="w-full px-3 h-10 text-sm font-medium text-[var(--text-secondary)] bg-transparent outline-none cursor-pointer hover:bg-[var(--surface-sunken)]"
                    aria-label="Mover a carpeta"
                  >
                  <option value="" disabled>Mover a…</option>
                  {allFolderRows.map(({ folder: f, depth }) => (
                    <option key={f.id} value={f.id}>{`${"   ".repeat(depth)}${depth > 0 ? "└ " : ""}${f.name}`}</option>
                  ))}
                  <option value="__none__">Sin carpeta</option>
                  </select>
                  <button
                    onClick={() => { setBulkMoreOpen(false); bulkDownloadZip(); }}
                    disabled={zipping}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)] disabled:opacity-60"
                  >
                    <FileArchive className="h-4 w-4 shrink-0" /> {zipping ? "Comprimiendo…" : "Descargar ZIP"}
                  </button>
                  {!enPapelera && (
                    <button
                      type="button"
                      onClick={() => { setBulkMoreOpen(false); bulkCodigoFisico(false); }}
                      className={OPCION_DEL_MENU}
                    >
                      <Undo2 className="h-4 w-4 shrink-0" /> Volver a «código por poner»
                    </button>
                  )}
                  {/* Mandar la selección entera por WhatsApp: un enlace por
                      documento en un solo mensaje. Antes había que abrir la ficha
                      de cada uno y repetir el envío. */}
                  <button
                    onClick={() => {
                      setBulkMoreOpen(false);
                      // Tope de 10: el endpoint de compartir corre con preset STRICT
                      // (10 cada 15 min). Mandar 20 dejaría al usuario sin poder
                      // compartir nada por un cuarto de hora.
                      const elegidos = documents.filter((d) => selectedIds.has(d.id)).slice(0, 10);
                      if (elegidos.length > 0) setWhatsappDoc(elegidos);
                    }}
                    title={selectedIds.size > 10 ? "Se enviarán los primeros 10 (límite del servidor: 10 enlaces cada 15 min)" : undefined}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)]"
                  >
                    <MessageCircle className="h-4 w-4 shrink-0" /> Enviar por WhatsApp
                  </button>
                  {selectedIds.size >= 2 && (
                    <button
                      onClick={() => { setBulkMoreOpen(false); handleMerge(); }}
                      disabled={merging}
                      className="flex w-full items-center gap-2 px-3 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)] disabled:opacity-60"
                    >
                      <Combine className="h-4 w-4 shrink-0" /> {merging ? "Combinando…" : "Combinar en un PDF"}
                    </button>
                  )}
                  {selectedIds.size >= 2 && (
                    <button
                      onClick={() => { setBulkMoreOpen(false); setExpediente({ tipo: "ids", ids: Array.from(selectedIds) }); }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)]"
                    >
                      <FolderArchive className="h-4 w-4 shrink-0" /> Armar expediente
                    </button>
                  )}
                </div>
              )}
              <button
                onClick={() => setBulkTagModalOpen(true)}
                className="text-xs px-2.5 py-1 rounded-lg bg-white/20 hover:bg-white/30 font-bold inline-flex items-center gap-1"
              >
                <Tag className="h-3 w-3" /> Etiquetar…
              </button>
              <button onClick={bulkDelete} className="text-xs px-2.5 py-1 rounded-lg bg-[var(--data-error-500)] hover:brightness-110 font-bold inline-flex items-center gap-1">
                <Trash2 className="h-3 w-3" /> Eliminar
              </button>
              <button onClick={clearSelection} className="ml-auto text-xs px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 font-bold">Cancelar</button>
            </div>
          )}
    </>
  );
}