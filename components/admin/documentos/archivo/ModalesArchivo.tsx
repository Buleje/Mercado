"use client";

import { Check, X, Clock, Loader2 } from "@buleje/design-system/icons";
import {
  TemplateGenerator, MoveToFolderModal, ImportarCarpetaModal, SendWhatsAppModal, OrdenarArchivoModal, ExpedienteModal,
  StampModal, EscanerModal, PageEditorModal, SmartFolderModal, IconoCarpetaModal, FolderShareModal, ConfirmarBorrarCarpetas,
  TagTaxonomyModal, BulkTagModal, TagEditModal, VinculosCarpetaModal,
} from "./perezosos";
import { descendantIds } from "@/lib/documentos/folder-tree";
import { tagsVisibles } from "./compartido";
import type { ModeloArchivo } from "./use-archivo";
export default function ModalesArchivo({ arch }: { arch: ModeloArchivo }) {
  const { estadoSubida, showTemplates, setShowTemplates, refresh, movingDoc, folders, bulk, setMovingDoc,
    importandoCarpeta, destinoImport, folderById, createFolderTree, existingNames, soltado, upload,
    setImportandoCarpeta, setSoltado, whatsappDoc, setWhatsappDoc, ordenando, sugDescartadas, setOrdenando,
    setOrdenVersion, expediente, setExpediente, clearSelection, setPreview, signDoc, setSignDoc, stampTarget,
    setStampTarget, showCameraScan, filterMode, activeFolderId, setShowCameraScan, pageEditorDoc,
    setPageEditorDoc, smartModal, smartFolders, persistSmart, setFilterMode, setActiveSmartId, setSmartModal,
    editingFolder, updateFolder, setEditingFolder, sharingFolder, setSharingFolder, borrandoCarpeta,
    childrenMap, setBorrandoCarpeta, confirmarBorrarCarpeta, showTags, reloadAllTags, setShowTags,
    bulkTagModalOpen, selectedIds, allTags, bulkTag, setBulkTagModalOpen, tagDocId, documents, patch,
    setTagDocId, vinculandoId, setVinculando, bulkFolders } = arch;
  const vinculando = vinculandoId ? folderById.get(vinculandoId) ?? null : null;
  return (
    <>
      {/* Panel de progreso por archivo (subida en curso) */}
      {estadoSubida && estadoSubida.size > 0 && (
        <div className="fixed bottom-24 right-4 z-50 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3 shadow-xl">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
            Subiendo {[...estadoSubida.values()].filter((v) => v.estado === "listo").length}/{estadoSubida.size}
            {[...estadoSubida.values()].some((v) => v.estado === "error") && (
              <span className="ml-2 text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
                · {[...estadoSubida.values()].filter((v) => v.estado === "error").length} sin subir
              </span>
            )}
          </p>
          <ul className="max-h-48 space-y-1.5 overflow-y-auto">
            {[...estadoSubida].map(([nombre, { estado, motivo }]) => (
              <li key={nombre} className="flex flex-wrap items-center gap-x-2 text-sm">
                {estado === "listo" ? (
                  <Check className="h-4 w-4 shrink-0 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" />
                ) : estado === "error" ? (
                  <X className="h-4 w-4 shrink-0 text-[var(--data-error-700)] dark:text-[var(--data-error-500)]" />
                ) : estado === "en-cola" ? (
                  <Clock className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" />
                ) : (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[var(--accent)]" />
                )}
                <span className="min-w-0 flex-1 truncate text-[var(--text-primary)]">{nombre}</span>
                <span className={`shrink-0 text-[length:var(--ts-2xs,11px)] font-bold ${estado === "error" ? "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]" : "text-[var(--text-tertiary)]"}`}>
                  {estado === "comprimiendo" ? "comprimiendo" : estado === "subiendo" ? "subiendo" : estado === "listo" ? "listo" : estado === "error" ? "falló" : "en cola"}
                </span>
                {motivo && (
                  // El motivo es lo unico accionable: "pesa 62 MB" se arregla, "fallo" no.
                  <span className="w-full pl-6 text-[length:var(--ts-2xs,11px)] text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
                    {motivo}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {showTemplates && (
        <TemplateGenerator
          onClose={() => setShowTemplates(false)}
          // Antes cerraba el modal apenas terminaba: el documento se generaba
          // PARA mandarlo, así que ahora queda abierto en el paso de envío y
          // sólo se refresca la lista de atrás.
          onGenerated={() => { refresh(); }}
        />
      )}

      {movingDoc && (
        <MoveToFolderModal
          doc={movingDoc}
          folders={folders}
          onMove={async (folderId) => { await bulk("move", [movingDoc.id], { folderId }); }}
          onClose={() => setMovingDoc(null)}
        />
      )}

      {importandoCarpeta && (
        <ImportarCarpetaModal
          // Sólo cuando estás PARADO en una carpeta cuelga de ahí; en cualquier
          // otra vista (recientes, favoritos, papelera) el destino es la raíz.
          destino={destinoImport}
          destinoNombre={destinoImport ? folderById.get(destinoImport)?.name : undefined}
          // Reimportar la misma carpeta fusiona con la que ya está, no duplica.
          existentes={folders}
          crearArbol={createFolderTree}
          yaSubidos={existingNames}
          soltado={soltado}
          subir={upload}
          onClose={() => { setImportandoCarpeta(false); setSoltado(null); }}
        />
      )}

      {whatsappDoc && (
        <SendWhatsAppModal docs={whatsappDoc} onClose={() => setWhatsappDoc(null)} />
      )}

      {ordenando && (
        <OrdenarArchivoModal
          descartadas={[...sugDescartadas]}
          onClose={() => setOrdenando(false)}
          onCambio={() => { void refresh({ silencioso: true }); setOrdenVersion((v) => v + 1); }}
        />
      )}

      {expediente && (
        <ExpedienteModal
          fuente={expediente}
          onClose={() => setExpediente(null)}
          onListo={() => { clearSelection(); void refresh({ silencioso: true }); }}
          onVer={(d) => { setExpediente(null); setPreview(d); }}
        />
      )}

      {signDoc && (
        <SendWhatsAppModal docs={[signDoc]} mode="sign" onClose={() => setSignDoc(null)} />
      )}

      {stampTarget && (
        <StampModal doc={stampTarget} onClose={() => setStampTarget(null)} onDone={refresh} />
      )}

      {showCameraScan && (
        <EscanerModal
          folderId={filterMode === "folder" ? activeFolderId : null}
          onClose={() => setShowCameraScan(false)}
          onDone={refresh}
        />
      )}

      {pageEditorDoc && (
        <PageEditorModal doc={pageEditorDoc} onClose={() => setPageEditorDoc(null)} onDone={refresh} />
      )}

      {smartModal && (
        <SmartFolderModal
          initial={smartModal === "new" ? undefined : smartModal}
          onSave={(sf) => {
            const exists = smartFolders.some((x) => x.id === sf.id);
            persistSmart(exists ? smartFolders.map((x) => (x.id === sf.id ? sf : x)) : [...smartFolders, sf]);
            setFilterMode("smart");
            setActiveSmartId(sf.id);
          }}
          onClose={() => setSmartModal(null)}
        />
      )}

      {editingFolder && (
        <IconoCarpetaModal
          folder={editingFolder}
          updateFolder={updateFolder}
          bulkFolders={bulkFolders}
          onClose={() => setEditingFolder(null)}
        />
      )}

      {sharingFolder && (
        <FolderShareModal folder={sharingFolder} onClose={() => setSharingFolder(null)} />
      )}

      {borrandoCarpeta && (() => {
        const marcadas = new Set(borrandoCarpeta.map((f) => f.id));
        // Las que cuelgan de las marcadas (sin contar las marcadas mismas).
        const debajo = new Set(borrandoCarpeta.flatMap((f) => [...descendantIds(childrenMap, f.id)]).filter((id) => !marcadas.has(id)));
        return (
          <ConfirmarBorrarCarpetas
            nombres={borrandoCarpeta.map((f) => f.name)}
            subcarpetas={debajo.size}
            documentosDirectos={borrandoCarpeta.reduce((n, f) => n + (f.documentCount ?? 0), 0)}
            documentosEnSubcarpetas={[...debajo].reduce((n, id) => n + (folderById.get(id)?.documentCount ?? 0), 0)}
            onCancelar={() => setBorrandoCarpeta(null)}
            onConfirmar={(opciones) => confirmarBorrarCarpeta(borrandoCarpeta, opciones)}
          />
        );
      })()}

      {showTags && (
        <TagTaxonomyModal onChanged={() => { refresh(); reloadAllTags(); }} onClose={() => setShowTags(false)} />
      )}

      {bulkTagModalOpen && (
        <BulkTagModal
          count={selectedIds.size}
          todasLasTags={allTags}
          onApply={bulkTag}
          onClose={() => setBulkTagModalOpen(false)}
        />
      )}

      {vinculando && (
        <VinculosCarpetaModal
          carpeta={vinculando}
          carpetas={folders}
          onClose={() => setVinculando(null)}
          onCambiar={(accion, clave) => bulkFolders([vinculando.id], { action: accion, tags: [clave] })}
        />
      )}

      {tagDocId && (() => {
        const doc = documents.find((d) => d.id === tagDocId);
        if (!doc) return null;
        return (
          <TagEditModal
            nombre={doc.name}
            tags={tagsVisibles(doc.tags)}
            todasLasTags={allTags}
            onAdd={async (tag) => {
              await patch(doc.id, { tags: [...(doc.tags ?? []), tag] });
              reloadAllTags();
            }}
            onRemove={async (tag) => {
              await patch(doc.id, { tags: (doc.tags ?? []).filter((t) => t !== tag) });
              reloadAllTags();
            }}
            onClose={() => setTagDocId(null)}
          />
        );
      })()}
    </>
  );
}