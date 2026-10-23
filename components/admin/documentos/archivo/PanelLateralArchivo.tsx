"use client";

import { cn } from "@/lib/utils";
import AccesoRapido from "../explorador/AccesoRapido";
import FolderBulkBar from "../FolderBulkBar";
import { Check, ChevronUp, ChevronDown, Tag } from "@buleje/design-system/icons";
import VistasDelPanel from "./VistasDelPanel";
import RaizDelArbol from "./RaizDelArbol";
import FilaCarpeta from "./FilaCarpeta";
import CarpetasInteligentes from "./CarpetasInteligentes";
import type { ModeloArchivo } from "./use-archivo";
import { precargarArchivo, DEL_PANEL } from "./perezosos";
export default function PanelLateralArchivo({ arch }: { arch: ModeloArchivo }) {
  const { sinPanel, enExplorador, ex, folderById, filterMode, activeFolderId, selectingFolders,
    selectedFolderIds, descendientesMarcados, documentosMarcados, folderTagSuggestions, folders,
    setSelectedFolderIds, bulkFolders, salirSeleccion, newFolderParent, newFolderName, setNewFolderName,
    handleCreateFolder, setNewFolderParent, visibleFolderRows, CARPETAS_A_LA_VISTA, setTodasLasCarpetas,
    todasLasCarpetas, filasDeCarpeta, setShowTags } = arch;
  return (
    <>
        {/* ─── Sidebar ─── */}
        <aside
          className={cn("bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl p-3 h-fit", sinPanel ? "hidden" : enExplorador && "hidden lg:block")}
          data-qa="panel-archivo"
          onPointerOver={() => precargarArchivo(...DEL_PANEL)}
          onFocusCapture={() => precargarArchivo(...DEL_PANEL)}
        >
          <p className="text-[length:var(--ts-2xs,11px)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] px-3 py-2">
            Vista
          </p>
          <VistasDelPanel arch={arch} />

          <AccesoRapido
            fijados={ex.acceso.fijados}
            carpetaPorId={folderById}
            docPorId={ex.docPorId}
            activaId={filterMode === "folder" ? activeFolderId : null}
            onAbrir={ex.abrirFijado}
            onMenu={ex.abrirMenuFijado}
            onReordenar={ex.acceso.reordenar}
          />

          <RaizDelArbol arch={arch} />

          {/* Barra de acciones en lote: aparece con la primera carpeta marcada. */}
          {selectingFolders && selectedFolderIds.size > 0 && (
            <FolderBulkBar
              ids={[...selectedFolderIds]}
              nombres={[...selectedFolderIds].map((id) => folderById.get(id)?.name ?? id)}
              descendientesIds={descendientesMarcados}
              documentosDirectos={documentosMarcados.directos}
              documentosEnSubcarpetas={documentosMarcados.enSubcarpetas}
              sugerencias={folderTagSuggestions}
              totalCarpetas={folders.length}
              onSeleccionarTodas={() => setSelectedFolderIds(new Set(folders.map((f) => f.id)))}
              onAccion={(accion, ids) => bulkFolders(ids ?? [...selectedFolderIds], accion)}
              onSalir={salirSeleccion}
            />
          )}
          {selectingFolders && selectedFolderIds.size === 0 && (
            <p className="mx-1 mb-2 rounded-lg border border-dashed border-[var(--rule-base)] px-3 py-2 text-[length:var(--ts-2xs,11px)] text-[var(--text-tertiary)]">
              Marca las carpetas que quieres cambiar de una: emoji, etiquetas, color o eliminar.
            </p>
          )}

          {newFolderParent === null && (
            <div className="flex items-stretch gap-1 px-2 mb-2">
              <input
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleCreateFolder(); if (e.key === "Escape") { setNewFolderParent(undefined); setNewFolderName(""); } }}
                ref={(el) => el?.focus()}
                placeholder="Nombre de la carpeta…"
                className="flex-1 px-2 py-1.5 rounded-xl border border-[var(--rule-base)] text-xs outline-none focus:border-primary"
              />
              <button aria-label="Confirmar" onClick={handleCreateFolder} className="px-2 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary-dark"><Check className="h-3 w-3" /></button>
            </div>
          )}

          <ul className="space-y-0.5">
            {folders.length === 0 && (
              <li className="px-3 py-2 text-xs text-[var(--text-tertiary)] italic">Sin carpetas. Crea la primera.</li>
            )}
            {filasDeCarpeta.map(({ folder: f, depth, hasChildren }) => <FilaCarpeta key={f.id} arch={arch} f={f} depth={depth} hasChildren={hasChildren} />)}
            {visibleFolderRows.length > CARPETAS_A_LA_VISTA && (
              <li>
                <button
                  type="button"
                  onClick={() => setTodasLasCarpetas((v) => !v)}
                  aria-expanded={todasLasCarpetas}
                  className="flex w-full items-center gap-1.5 rounded-lg px-3 py-1.5 text-left text-sm font-semibold text-[var(--text-tertiary)] transition-colors hover:text-primary"
                >
                  {todasLasCarpetas ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  {todasLasCarpetas ? "Ver menos" : `Ver ${visibleFolderRows.length - filasDeCarpeta.length} más`}
                </button>
              </li>
            )}
          </ul>

          <CarpetasInteligentes arch={arch} />

          <button
            onClick={() => setShowTags(true)}
            className="mt-3 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)]"
          >
            <Tag className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" /> Etiquetas
          </button>
        </aside>
    </>
  );
}