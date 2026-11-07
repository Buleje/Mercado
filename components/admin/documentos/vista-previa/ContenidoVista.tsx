"use client";

import ComentariosDoc from "../ComentariosDoc";
import BuscarEnDocumento from "../BuscarEnDocumento";
import dynamic from "next/dynamic";
import { FileText } from "@buleje/design-system/icons";
import { VisorImagen, VisorPdf } from "../VisorArchivo";
import { fetchVersions, fetchAudit, fetchShares } from "@/hooks/use-documents";
import type { DbDocument, DbDocumentFolder } from "@/lib/types/documents";
import type { TiposDoc } from "./tipos";
import { VersionsTab } from "./VersionsTab";
import { DetailsTab } from "./DetailsTab";
import { ShareTab } from "./ShareTab";
import { SignTab } from "./SignTab";
import { AuditTab } from "./AuditTab";
import type { EstadoVistaPrevia } from "./use-vista-previa";

/** El visor arrastra exceljs: entra sólo cuando se abre una planilla. */
const HojaPreview = dynamic(() => import("../HojaPreview"), {
  ssr: false,
  loading: () => <p className="py-16 text-center text-sm text-[var(--text-tertiary)]">Abriendo la planilla…</p>,
});

/** Las presentaciones también: jszip sólo cuando se abre una. */
const PresentacionPreview = dynamic(() => import("../PresentacionPreview"), {
  ssr: false, loading: () => <p className="py-16 text-center text-sm text-[var(--text-tertiary)]">Abriendo la presentación…</p>, });

/** Ídem para los documentos de texto (jszip para leer el .docx). */
const TextoPreview = dynamic(() => import("../TextoPreview"), {
  ssr: false,
  loading: () => <p className="py-16 text-center text-sm text-[var(--text-tertiary)]">Abriendo el documento…</p>,
});

export function ContenidoVista({ e, doc, tipos, allDocs, folders, onRefresh, onAbrirOtro }: {
  e: EstadoVistaPrevia; doc: DbDocument; tipos: TiposDoc; allDocs?: DbDocument[]; folders?: DbDocumentFolder[];
  onRefresh?: () => void; onAbrirOtro?: (doc: DbDocument) => void;
}) {
  const { tab, docId, setDoc, versions, setVersions, shares, setShares, audit, setAudit, setEnviando, rawUrl, miniaturaUrl } = e;
  const { isPdf, isImage, imagenConvertible, esPresenta, isVideo, esHoja, esTexto } = tipos;
  return (
        <div className="flex-1 overflow-auto bg-[var(--surface-sunken)] min-h-0">
          {tab === "preview" && (
            <div className="h-full flex items-center justify-center p-4">
              {isImage ? (
                <VisorImagen url={rawUrl} nombre={doc.name} />
              ) : imagenConvertible ? (
                // Convertida en el servidor: una foto HEIC del celular o un
                // escaneo TIFF se ven acá en vez de un ícono gris.
                <VisorImagen url={`/api/admin/documents/${doc.id}/preview-image`} nombre={doc.name} />
              ) : esPresenta ? (
                <div className="max-h-[78vh] w-full">
                  <PresentacionPreview url={rawUrl} nombre={doc.name} />
                </div>
              ) : isPdf ? (
                // Por blob y no `src={rawUrl}`: así un 429 sale como aviso y no
                // dibujado como texto adentro del visor.
                <VisorPdf url={rawUrl} nombre={doc.name} tamano={doc.size} docId={docId} />
              ) : isVideo ? (
                <video src={rawUrl} controls className="max-w-full max-h-full rounded-lg" />
              ) : esHoja ? (
                // Las planillas se leen acá mismo: antes había que bajarlas para
                // saber si era la lista correcta. Alto FIJO (no `max-h`): la
                // tabla scrollea por dentro y la barra de estado queda a la
                // vista en vez de empujarse fuera del modal.
                <div className="h-[70vh] w-full self-stretch">
                  <HojaPreview url={rawUrl} mimeType={doc.mimeType} nombre={doc.name} onEnviar={() => setEnviando(true)} miniaturaUrl={miniaturaUrl} />
                </div>
              ) : esTexto ? (
                <div className="h-[70vh] w-full self-stretch">
                  <TextoPreview url={rawUrl} mimeType={doc.mimeType} nombre={doc.name} miniaturaUrl={miniaturaUrl} />
                </div>
              ) : (
                <div className="text-center py-10">
                  <FileText className="h-16 w-16 mx-auto text-[var(--text-tertiary)] mb-3" />
                  <p className="text-base font-bold text-[var(--text-secondary)]">{doc.name}</p>
                  <p className="text-sm text-[var(--text-tertiary)] mt-1">Sin vista previa. Descarga para verlo en tu equipo.</p>
                </div>
              )}
            </div>
          )}

          {tab === "texto" && (
            <div className="h-[74vh]">
              <BuscarEnDocumento
                docId={docId}
                ocrText={doc.ocrText}
                origen={(doc.ocrMetadata as { analyzedVia?: string } | null)?.analyzedVia}
                escaneo={!!(doc.ocrMetadata as { leidoComoEscaneo?: boolean } | null)?.leidoComoEscaneo}
              />
            </div>
          )}

          {tab === "details" && (
            <DetailsTab doc={doc} allDocs={allDocs ?? []} folders={folders ?? []} onPatched={(d) => { setDoc(d); onRefresh?.(); }} onAbrirOtro={onAbrirOtro} />
          )}

          {tab === "versions" && (
            <VersionsTab doc={doc} docId={docId} versions={versions} reload={() => fetchVersions(docId).then(setVersions)} onRefresh={onRefresh} />
          )}

          {tab === "share" && (
            <ShareTab docId={docId} shares={shares} reload={() => fetchShares(docId).then(setShares)} />
          )}

          {tab === "sign" && (
            <SignTab docId={docId} onSigned={() => { fetchVersions(docId).then(setVersions); fetchAudit(docId).then(setAudit); onRefresh?.(); }} />
          )}

          {tab === "comentarios" && (
            <ComentariosDoc docId={docId} />
          )}

          {tab === "audit" && (
            <AuditTab logs={audit} />
          )}
        </div>
  );
}
