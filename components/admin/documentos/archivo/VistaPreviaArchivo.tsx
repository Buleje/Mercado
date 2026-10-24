"use client";

import { DocumentPreviewModal } from "./perezosos";
import { sucesorTrasBorrar } from "./compartido";
import type { ModeloArchivo } from "./use-archivo";
import type { DbDocument } from "@/lib/types/documents";
export default function VistaPreviaArchivo({ arch, lista }: {
  arch: ModeloArchivo;
  /** Por qué papeles pasan las flechas. Sin esto, la lista que se ve en el Archivo;
   *  Esenciales pasa la de la carpeta abierta, para no saltar a papeles de otras carpetas (23-10). */
  lista?: DbDocument[];
}) {
  const { preview, displayDocs: listaDelArchivo, documents, folders, setPreview, refresh, setWhatsappDoc, zipAndDownload, bulk,
    patch, createFolder, updateFolder, deleteFolder, handleAnalyze, setStampTarget, handleRotate, handleSplit,
    setPageEditorDoc, setMovingDoc, setSignDoc, prompt, setTagDocId, confirm } = arch;
  const displayDocs = lista ?? listaDelArchivo;
  return (
    <>
      {/* Modals */}
      {preview && (() => {
        const idx = displayDocs.findIndex((d) => d.id === preview.id);
        return (
          <DocumentPreviewModal
            docId={preview.id}
            allDocs={documents}
            folders={folders}
            onClose={() => setPreview(null)}
            onRefresh={refresh}
            // Saltar a un "parecido" sin cerrar: es el gesto natural cuando
            // buscabas la factura y lo que querías era su comprobante de pago.
            onAbrirOtro={(d) => setPreview(d)}
            onPrev={idx > 0 ? () => setPreview(displayDocs[idx - 1]) : undefined}
            onNext={idx >= 0 && idx < displayDocs.length - 1 ? () => setPreview(displayDocs[idx + 1]) : undefined}
            // Vecinos: el visor los precarga para que pasar con las flechas no
            // arranque de cero cada vez.
            vecinos={[displayDocs[idx - 1], displayDocs[idx + 1]].filter(Boolean)}
            position={idx >= 0 ? { current: idx + 1, total: displayDocs.length } : undefined}
            // Carpetas: crear, renombrar y mover el documento sin salir del
            // visor. Todo pasa por el mismo hook que usa el drive, así la
            // barra de la izquierda se entera del cambio al instante.
            // Las mismas acciones en lote de la barra del drive, para los
            // archivos elegidos en la columna del medio del visor.
            lote={{
              onWhatsApp: (docs) => setWhatsappDoc(docs),
              onDescargarZip: async (docs) => {
                await zipAndDownload(docs, `documentos-${docs.length}.zip`);
              },
              onFavorito: async (ids) => { await bulk("favorite", ids, { favorite: true }); },
              onEliminar: async (ids) => {
                // Si el que estabas mirando se va con la tanda, el visor pasa
                // al SIGUIENTE que quede en pie en vez de cerrarse: cerrarlo te
                // sacaba de la carpeta y había que volver a entrar para seguir
                // borrando. El sucesor se resuelve ANTES de borrar, mientras la
                // lista todavía los tiene a todos.
                const sucesor = sucesorTrasBorrar(displayDocs, preview.id, ids);
                await bulk("delete", ids);
                if (sucesor !== undefined) setPreview(sucesor);
              },
            }}
            carpetas={{
              onMover: async (folderId) => { await patch(preview.id, { folderId }); },
              // Arrastrar CUALQUIER archivo de la columna del medio a una
              // carpeta del árbol, no sólo el que está abierto.
              onMoverDoc: async (docId, folderId) => { await patch(docId, { folderId }); },
              onCrear: async (nombre, parentId) => { await createFolder({ name: nombre, parentId }); },
              onRenombrar: async (id, nombre) => { await updateFolder(id, { name: nombre }); },
              onBorrar: async (id, opciones) => { await deleteFolder(id, opciones); },
            }}
            // Las mismas herramientas del menú de la lista, para no tener que
            // cerrar el documento y buscarlo de nuevo para sellarlo o rotarlo.
            herramientas={{
              onAnalyze: () => handleAnalyze(preview),
              onStamp: () => setStampTarget(preview),
              onRotate: () => handleRotate(preview),
              onSplit: () => handleSplit(preview),
              onEditPages: () => setPageEditorDoc(preview),
              onMove: () => setMovingDoc(preview),
              onSign: () => setSignDoc(preview),
              onSetStatus: (s: string) => patch(preview.id, { status: s }),
              onToggleFav: () => patch(preview.id, { favorite: !preview.favorite }),
              onPrint: () => window.open(`/api/admin/documents/${preview.id}/raw`, "_blank", "noopener"),
              onRename: async () => {
                const nuevo = await prompt({ title: "Nuevo nombre del archivo", label: "Nombre", defaultValue: preview.name, inputType: "text" });
                if (nuevo && nuevo.trim() && nuevo.trim() !== preview.name) {
                  patch(preview.id, { name: nuevo.trim() });
                }
              },
              onTag: () => setTagDocId(preview.id),
              onDelete: async () => {
                if (!(await confirm({
                  title: `¿Eliminar "${preview.name}"?`,
                  description: "Va a la papelera: se puede restaurar.",
                  intent: "danger",
                  confirmLabel: "Sí, eliminar",
                }))) return;
                // Igual que al borrar varios: se pasa al siguiente en vez de
                // cerrar. Cerrar te sacaba de la carpeta y había que volver a
                // entrar para seguir limpiando.
                const sucesor = sucesorTrasBorrar(displayDocs, preview.id, [preview.id]);
                bulk("delete", [preview.id]).then(() => {
                  if (sucesor !== undefined) setPreview(sucesor);
                });
              },
            }}
          />
        );
      })()}
    </>
  );
}