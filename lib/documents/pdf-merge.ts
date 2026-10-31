import "server-only";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";

/**
 * Combina varios archivos (PDFs + imágenes) en un solo PDF. Los PDFs aportan
 * sus páginas; cada imagen se normaliza (sharp → JPEG de hasta 2480×3508, A4
 * a 300 ppp) y se coloca centrada en una página tamaño A4 conservando su
 * proporción. Los tipos no soportados se saltan (se reportan en `skipped`).
 */
export interface MergeItem {
  bytes: Uint8Array;
  mimeType: string;
  name: string;
}

const A4 = { width: 595.28, height: 841.89 };

/**
 * Agrega UN archivo al final de `out` y devuelve cuántas páginas sumó (0 = no
 * se pudo: tipo no soportado o archivo dañado). Lo usan el combinar y el
 * expediente, que necesita saber dónde empieza cada papel.
 */
export async function anexarAlPdf(out: PDFDocument, item: MergeItem): Promise<number> {
  try {
    if (item.mimeType === "application/pdf") {
      const src = await PDFDocument.load(item.bytes);
      const pages = await out.copyPages(src, src.getPageIndices());
      pages.forEach((p) => out.addPage(p));
      return pages.length;
    }
    if (item.mimeType.startsWith("image/")) {
      // sharp maneja jpeg/webp/heic/… y la orientación EXIF. JPEG achicado a A4
      // a 300 ppp: en PNG una foto de 12 MP (2 MB) pesaba 19 MB dentro del PDF.
      // `flatten` pinta de blanco lo transparente (JPEG no tiene alfa).
      const jpg = await sharp(Buffer.from(item.bytes))
        .rotate()
        .resize({ width: 2480, height: 3508, fit: "inside", withoutEnlargement: true })
        .flatten({ background: { r: 255, g: 255, b: 255 } })
        .jpeg({ quality: 85 })
        .toBuffer();
      const img = await out.embedJpg(jpg);
      const page = out.addPage([A4.width, A4.height]);
      const margin = 24;
      const maxW = A4.width - margin * 2;
      const maxH = A4.height - margin * 2;
      const scale = Math.min(maxW / img.width, maxH / img.height, 1);
      const w = img.width * scale;
      const h = img.height * scale;
      page.drawImage(img, { x: (A4.width - w) / 2, y: (A4.height - h) / 2, width: w, height: h });
      return 1;
    }
    return 0;
  } catch {
    return 0;
  }
}

export async function mergeToPdf(items: MergeItem[]): Promise<{ bytes: Buffer; pageCount: number; skipped: string[] }> {
  const out = await PDFDocument.create();
  const skipped: string[] = [];

  for (const item of items) {
    if ((await anexarAlPdf(out, item)) === 0) skipped.push(item.name);
  }

  const bytes = await out.save();
  return { bytes: Buffer.from(bytes), pageCount: out.getPageCount(), skipped };
}
