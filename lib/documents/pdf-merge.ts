import "server-only";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";

/**
 * Combina varios archivos (PDFs + imágenes) en un solo PDF. Los PDFs aportan
 * sus páginas; cada imagen se normaliza (sharp → PNG) y se coloca centrada en
 * una página tamaño A4 conservando su proporción. Los tipos no soportados se
 * saltan (se reportan en `skipped`).
 */
export interface MergeItem {
  bytes: Uint8Array;
  mimeType: string;
  name: string;
}

const A4 = { width: 595.28, height: 841.89 };

export async function mergeToPdf(items: MergeItem[]): Promise<{ bytes: Buffer; pageCount: number; skipped: string[] }> {
  const out = await PDFDocument.create();
  const skipped: string[] = [];

  for (const item of items) {
    try {
      if (item.mimeType === "application/pdf") {
        const src = await PDFDocument.load(item.bytes);
        const pages = await out.copyPages(src, src.getPageIndices());
        pages.forEach((p) => out.addPage(p));
      } else if (item.mimeType.startsWith("image/")) {
        // Normalizamos a PNG con sharp (maneja jpeg/webp/heic/… y orientación EXIF).
        const png = await sharp(Buffer.from(item.bytes)).rotate().png().toBuffer();
        const img = await out.embedPng(png);
        const page = out.addPage([A4.width, A4.height]);
        const margin = 24;
        const maxW = A4.width - margin * 2;
        const maxH = A4.height - margin * 2;
        const scale = Math.min(maxW / img.width, maxH / img.height, 1);
        const w = img.width * scale;
        const h = img.height * scale;
        page.drawImage(img, { x: (A4.width - w) / 2, y: (A4.height - h) / 2, width: w, height: h });
      } else {
        skipped.push(item.name);
      }
    } catch {
      skipped.push(item.name);
    }
  }

  const bytes = await out.save();
  return { bytes: Buffer.from(bytes), pageCount: out.getPageCount(), skipped };
}
