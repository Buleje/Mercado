import "server-only";
import { PDFDocument, StandardFonts, rgb, degrees } from "pdf-lib";

/**
 * Estampa una marca de agua diagonal ("PAGADO", "COPIA", "ANULADO"…) en TODAS
 * las páginas de un PDF. Visual, semi-transparente, no cripto. Reusa el patrón
 * de `pdf-signer.ts`. El sello se elige de una lista de presets con su color.
 */

export type StampPreset = "pagado" | "copia" | "anulado" | "confidencial" | "borrador" | "urgente" | "aprobado" | "recibido";

interface StampStyle {
  label: string;
  rgb: [number, number, number];
}

export const STAMP_PRESETS: Record<StampPreset, StampStyle> = {
  pagado: { label: "PAGADO", rgb: [0.13, 0.55, 0.33] },
  aprobado: { label: "APROBADO", rgb: [0.1, 0.5, 0.45] },
  recibido: { label: "RECIBIDO", rgb: [0.15, 0.4, 0.7] },
  copia: { label: "COPIA", rgb: [0.45, 0.45, 0.45] },
  confidencial: { label: "CONFIDENCIAL", rgb: [0.2, 0.35, 0.7] },
  borrador: { label: "BORRADOR", rgb: [0.8, 0.55, 0.1] },
  urgente: { label: "URGENTE", rgb: [0.8, 0.2, 0.15] },
  anulado: { label: "ANULADO", rgb: [0.8, 0.15, 0.15] },
};

export interface StampPdfOptions {
  pdfBytes: Uint8Array;
  preset: StampPreset;
  /** Texto libre opcional; si no, usa el label del preset. */
  customText?: string;
}

export async function stampPdf(opts: StampPdfOptions): Promise<Buffer> {
  const style = STAMP_PRESETS[opts.preset] ?? STAMP_PRESETS.copia;
  const text = (opts.customText?.trim() || style.label).slice(0, 24).toUpperCase();
  const color = rgb(style.rgb[0], style.rgb[1], style.rgb[2]);

  const pdf = await PDFDocument.load(opts.pdfBytes);
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);

  for (const page of pdf.getPages()) {
    const { width, height } = page.getSize();
    // Tamaño de fuente proporcional al ancho para que el texto cruce la página.
    const size = Math.max(28, Math.min(120, (width * 1.1) / Math.max(text.length, 6)));
    const textWidth = font.widthOfTextAtSize(text, size);
    // Centro geométrico de la diagonal a 45°: desplazamos medio ancho de texto.
    const x = width / 2 - (textWidth / 2) * Math.cos(Math.PI / 4);
    const y = height / 2 - (textWidth / 2) * Math.sin(Math.PI / 4);
    page.drawText(text, {
      x,
      y,
      size,
      font,
      color,
      rotate: degrees(45),
      opacity: 0.22,
    });
  }

  const bytes = await pdf.save();
  return Buffer.from(bytes);
}
