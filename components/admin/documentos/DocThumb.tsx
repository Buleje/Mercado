"use client";

/**
 * Miniatura de un documento: la imagen real para fotos, la 1.ª página para
 * PDF y las primeras filas o líneas para Excel y Word (endpoint `/thumbnail`).
 * Si el render falla (PDF corrupto, storage caído) cae al ícono del tipo; el
 * estado es por miniatura para no reintentar en bucle.
 *
 * La usan la tarjeta del Archivo y los íconos grandes y medianos del
 * explorador (por eso vive aparte de `DocumentosModule`).
 */

import { useState } from "react";
import type { LucideIcon } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { DbDocument } from "@/lib/types/documents";
import { urlMiniatura } from "@/lib/documents/miniatura-version";
import { familiaDe, esImagenRenderizable, esImagenConvertible } from "@/lib/documents/tipos-archivo";

export default function DocThumb({
  doc, Icon, tint, bg, iconClassName = "h-12 w-12",
}: { doc: DbDocument; Icon: LucideIcon; tint: string; bg: string; iconClassName?: string }) {
  // HEIC, TIFF o PSD son imágenes que el navegador NO dibuja: pedirlas en un
  // <img> daba un roto y recién ahí caía al ícono. Se filtra antes.
  const isImage = esImagenRenderizable(doc.name, doc.mimeType);
  // HEIC, TIFF y SVG los convierte el servidor a PNG: antes eran un ícono gris
  // y había que bajar el archivo para saber qué foto era.
  const convertible = !isImage && esImagenConvertible(doc.name, doc.mimeType);
  const isPdf = doc.mimeType === "application/pdf";
  // Excel y Word también tienen carita: el servidor dibuja las primeras filas
  // de la planilla o las primeras líneas del documento. Antes eran todos el
  // mismo ícono y había que abrirlos de a uno para saber cuál era cuál.
  const familia = familiaDe(doc.name, doc.mimeType);
  const dibujable = familia === "planilla" || familia === "texto";
  const [failed, setFailed] = useState(false);

  if ((isImage || convertible || isPdf || dibujable) && !failed) {
    // Las fotos también van por la miniatura: pedir `/raw` bajaba el archivo
    // ORIGINAL (un logo de 657 KB) para dibujar un cuadradito de 200 px.
    const src = isImage
      ? urlMiniatura(doc.id)
      : convertible
        ? `/api/admin/documents/${doc.id}/preview-image?max=420`
        : urlMiniatura(doc.id);
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={doc.name}
        loading="lazy"
        onError={() => setFailed(true)}
        className={cn("w-full h-full object-cover", (isPdf || dibujable) && "object-top bg-[var(--surface-raised)]")}
      />
    );
  }
  return (
    <div className={cn("w-full h-full flex items-center justify-center", bg)}>
      <Icon className={cn(iconClassName, tint)} />
    </div>
  );
}
