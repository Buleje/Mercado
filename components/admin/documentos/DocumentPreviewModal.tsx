"use client";

import { TiradorDeVentana } from "@/components/admin/shared/modal-controles-ventana";
import { patchDocument, getDocumentDetail, fetchAudit } from "@/hooks/use-documents";
import PanelCarpetasDoc from "./PanelCarpetasDoc";
import ExploradorDoc from "./ExploradorDoc";
import BarraHerramientasDoc from "./BarraHerramientasDoc";
import { SendWhatsAppModal } from "./SendWhatsAppModal";
import CabeceraVistaPrevia from "./vista-previa/CabeceraVistaPrevia";
import { ContenidoVista } from "./vista-previa/ContenidoVista";
import { useVistaPrevia, TECLAS_DEL_VISOR } from "./vista-previa/use-vista-previa";
import { tiposDeDoc, type Props } from "./vista-previa/tipos";

export function DocumentPreviewModal(props: Props) {
  const { docId, onClose, onRefresh, allDocs, folders, onPrev, onNext, position, herramientas, carpetas, lote, onAbrirOtro } = props;
  const e = useVistaPrevia(props);
  const { tab, setTab, doc, setDoc, setAudit, loading, enviando, setEnviando, panelRef, titleId, ventana, elegidoRef, revisionCarpeta, setRevisionCarpeta, carpetaMirada, setCarpetaMirada, rawUrl } = e;

  if (!doc) {
    return (
      <div
        className="fixed inset-0 z-modal flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
      >
        <div role="dialog" aria-modal="true" aria-label={loading ? "Cargando" : "No disponible"} className="bg-[var(--surface-raised)] rounded-3xl p-8 text-sm text-[var(--text-tertiary)]">{loading ? "Cargando…" : "No disponible"}</div>
      </div>
    );
  }

  const tipos = tiposDeDoc(doc);
  const { isPdf, isImage, isVideo } = tipos;

  return (
    <div
      className="fixed inset-0 z-modal flex items-center justify-center p-2 sm:p-6 bg-black/60 backdrop-blur-sm"
      onClick={() => { if (!ventana.fijado) onClose(); }}
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
    >
      {/* Casi toda la pantalla: un contrato o una planilla se leen mejor
          grandes, y la barra de herramientas de la derecha necesita su lugar
          sin comerle ancho al documento. El alto deja 24 px arriba y abajo:
          con 96vh quedaba a 12 de arriba y 24 de abajo, porque la ventana
          movible sube todo modal cuyo borde inferior pase de 24 px del fondo.
          `overflow-clip` y no `-hidden`: un panel `hidden` igual se desplaza
          por programa (foco, scrollIntoView) y escondía la cabecera arriba. */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        /* Escape tiene que llegar al listener global: antes lo tragaba este stopPropagation
           y no cerraba con el foco adentro (medido 08-10). */
        /* …y las flechas también: con el foco adentro (lo normal al abrir) ← → no pasaban
           de documento (medido 23-10). El atajo de abajo ya ignora campos, árboles y listas. */
        onKeyDown={(e) => { if (!TECLAS_DEL_VISOR.has(e.key)) e.stopPropagation(); }}
        className="@container relative flex h-[calc(100dvh-1rem)] w-full max-w-[1800px] flex-col overflow-clip rounded-2xl bg-[var(--surface-raised)] shadow-[var(--shadow-xl)] sm:h-[calc(100dvh-3rem)]"
      >
        <CabeceraVistaPrevia
          doc={doc}
          titleId={titleId}
          folders={folders ?? []}
          onMover={async (destino) => {
            await patchDocument(docId, { folderId: destino });
            const r = await getDocumentDetail(docId);
            setDoc(r.document);
            onRefresh?.();
          }}
          tab={tab}
          onTab={setTab}
          onPrev={onPrev}
          onNext={onNext}
          position={position}
          rawUrl={rawUrl}
          isPdf={isPdf}
          abrible={isPdf || isImage || isVideo}
          ventana={ventana}
          onEnviar={() => setEnviando(true)}
          onClose={onClose}
        />

        {/* Body — el documento a la izquierda, las herramientas siempre a la
            vista a la derecha (en pantallas chicas la barra se oculta y quedan
            las acciones del encabezado). */}
        <div className="flex min-h-0 flex-1">
        {/* Carpetas a la izquierda: se ve dónde está guardado, se navega entre
            ellas y se acomoda el archivo sin cerrar el documento. */}
        {carpetas && (
          <PanelCarpetasDoc
            folders={folders ?? []}
            folderId={doc.folderId}
            carpetaActiva={carpetaMirada}
            acciones={{
              ...carpetas,
              onNavegar: setCarpetaMirada,
              onMoverDoc: carpetas.onMoverDoc
                ? async (id, folderId) => {
                    await carpetas.onMoverDoc?.(id, folderId);
                    // El archivo ya no está donde estaba: la columna del medio
                    // tiene que volver a mirar.
                    setRevisionCarpeta((n) => n + 1);
                  }
                : undefined,
            }}
          />
        )}
        {/* Y en el medio, qué hay en esa carpeta: se salta de un documento a
            otro sin cerrar el visor. Se oculta en pantallas chicas, donde no
            entran tres columnas. */}
        {carpetas && allDocs && allDocs.length > 0 && (
          <div className="hidden lg:flex">
            <ExploradorDoc
              docs={allDocs}
              folders={folders ?? []}
              carpetaActiva={carpetaMirada}
              onNavegar={setCarpetaMirada}
              docActivoId={docId}
              revision={revisionCarpeta}
              // Tras borrar o mover, la columna del medio tiene que volver a
              // mirar: si no, sigue mostrando tarjetas de archivos que ya no
              // están.
              lote={lote && {
                ...lote,
                onEliminar: async (ids) => {
                  await lote.onEliminar(ids);
                  setRevisionCarpeta((n) => n + 1);
                },
                onFavorito: async (ids) => {
                  await lote.onFavorito(ids);
                  setRevisionCarpeta((n) => n + 1);
                },
              }}
              onAbrirDoc={(d) => { elegidoRef.current = d; onAbrirOtro?.(d); }}
            />
          </div>
        )}
        <ContenidoVista e={e} doc={doc} tipos={tipos} allDocs={allDocs} folders={folders} onRefresh={onRefresh} onAbrirOtro={onAbrirOtro} />


        {herramientas && (
          <BarraHerramientasDoc
            acciones={{
              ...herramientas,
              onWhatsApp: () => setEnviando(true),
              onShare: () => setTab("share"),
              onDownload: () => { window.location.href = `${rawUrl}?download=1`; },
            }}
            esPdf={isPdf}
            favorito={!!doc.favorite}
            estado={doc.status ?? "none"}
          />
        )}
        </div>
        <TiradorDeVentana ventana={ventana} />
      </div>

      {/* El envío se monta sobre la ficha; al cerrarlo se vuelve al documento. */}
      {enviando && (
        <SendWhatsAppModal docs={[doc]} onClose={() => { setEnviando(false); fetchAudit(docId).then(setAudit); }} />
      )}
    </div>
  );
}
