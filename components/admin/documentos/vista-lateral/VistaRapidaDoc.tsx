"use client";

/**
 * El archivo dibujado dentro del panel de vista previa: la foto, el PDF, la
 * planilla, el Word, la presentación o el video, con los MISMOS visores de la
 * ventana grande (así lo que ves acá es lo que vas a ver al abrirlo).
 *
 * Las fotos van directo en un `<img>` con la miniatura de fondo: la miniatura
 * ya está en caché y sale al instante, y la foto completa la tapa cuando llega.
 * Si la foto falla (429, borrada del storage), queda la miniatura.
 */

import { useState } from "react";
import dynamic from "next/dynamic";
import { FileText, Loader2 } from "@buleje/design-system/icons";
import type { DbDocument } from "@/lib/types/documents";
import { urlMiniatura } from "@/lib/documents/miniatura-version";
import { VisorPdf } from "../VisorArchivo";
import { tiposDeDoc } from "../vista-previa/tipos";

const Cargando = ({ texto }: { texto: string }) => (
  <p className="py-16 text-center text-sm text-[var(--text-tertiary)]">{texto}</p>
);
const HojaPreview = dynamic(() => import("../HojaPreview"), { ssr: false, loading: () => <Cargando texto="Abriendo la planilla…" /> });
const TextoPreview = dynamic(() => import("../TextoPreview"), { ssr: false, loading: () => <Cargando texto="Abriendo el documento…" /> });
const PresentacionPreview = dynamic(() => import("../PresentacionPreview"), { ssr: false, loading: () => <Cargando texto="Abriendo la presentación…" /> });

/** Alto de la caja: lo bastante para leer una hoja A4 sin tapar los datos de abajo. */
const CAJA = "h-[52vh] min-h-[320px]";

function FotoRapida({ doc, src }: { doc: DbDocument; src: string }) {
  const [fallo, setFallo] = useState(false);
  const mini = urlMiniatura(doc.id);
  return (
    <div className={`relative flex w-full items-center justify-center overflow-hidden rounded-xl bg-[var(--surface-sunken)] ${CAJA}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- miniatura del drive, ya optimizada */}
      <img src={mini} alt="" aria-hidden className="absolute inset-0 m-auto max-h-full max-w-full object-contain" />
      {!fallo && (
        // eslint-disable-next-line @next/next/no-img-element -- archivo privado del drive, no pasa por el optimizador
        <img
          key={src}
          src={src}
          alt={doc.name}
          onError={() => setFallo(true)}
          className="relative max-h-full max-w-full object-contain"
        />
      )}
    </div>
  );
}

export default function VistaRapidaDoc({ doc, onEnviar }: { doc: DbDocument; onEnviar: () => void }) {
  const t = tiposDeDoc(doc);
  const raw = `/api/admin/documents/${doc.id}/raw`;
  const mini = urlMiniatura(doc.id);

  if (t.isImage) return <FotoRapida key={doc.id} doc={doc} src={raw} />;
  // HEIC del celular, TIFF de un escáner: el servidor la pasa a PNG.
  if (t.imagenConvertible) return <FotoRapida key={doc.id} doc={doc} src={`/api/admin/documents/${doc.id}/preview-image`} />;
  if (t.isPdf) {
    // Mientras baja el PDF entero, su 1.ª página (la miniatura, ya en caché).
    const primeraPagina = (
      <div className={`relative flex w-full items-center justify-center overflow-hidden rounded-xl bg-[var(--surface-sunken)] ${CAJA}`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- miniatura del drive, ya optimizada */}
        <img src={mini} alt="" aria-hidden className="max-h-full max-w-full object-contain opacity-80" />
        <span className="absolute bottom-3 inline-flex items-center gap-2 rounded-lg bg-[var(--surface-raised)]/95 px-3 py-1.5 text-xs font-semibold text-[var(--text-secondary)] shadow-[var(--shadow-sm)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Abriendo el PDF…
        </span>
      </div>
    );
    return <VisorPdf key={doc.id} url={raw} nombre={doc.name} tamano={doc.size} docId={doc.id} alto={CAJA} cargando={primeraPagina} />;
  }
  if (t.isVideo) {
    return (
      <div className={`flex w-full items-center justify-center rounded-xl bg-[var(--surface-sunken)] ${CAJA}`}>
        <video key={doc.id} src={raw} controls preload="metadata" className="max-h-full max-w-full rounded-lg" />
      </div>
    );
  }
  if (t.esHoja) {
    return (
      <div className={`w-full ${CAJA}`}>
        <HojaPreview key={doc.id} url={raw} mimeType={doc.mimeType} nombre={doc.name} onEnviar={onEnviar} miniaturaUrl={mini} />
      </div>
    );
  }
  if (t.esTexto) {
    return (
      <div className={`w-full ${CAJA}`}>
        <TextoPreview key={doc.id} url={raw} mimeType={doc.mimeType} nombre={doc.name} miniaturaUrl={mini} />
      </div>
    );
  }
  if (t.esPresenta) {
    return (
      <div className={`w-full overflow-auto ${CAJA}`}>
        <PresentacionPreview key={doc.id} url={raw} nombre={doc.name} />
      </div>
    );
  }
  return (
    <div className="rounded-xl bg-[var(--surface-sunken)] py-12 text-center">
      <FileText className="mx-auto mb-2 h-12 w-12 text-[var(--text-tertiary)]" />
      <p className="text-sm text-[var(--text-secondary)]">Este tipo de archivo no tiene vista previa.</p>
    </div>
  );
}
