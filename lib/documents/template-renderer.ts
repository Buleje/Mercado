import "server-only";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

/**
 * Renderiza una plantilla Markdown-ligera con placeholders {{key}} a un PDF.
 *
 * No es Markdown completo — soporta:
 *   • # Título (h1, 22pt bold)
 *   • ## Subtítulo (h2, 16pt bold)
 *   • Texto normal (12pt)
 *   • Línea vacía = párrafo nuevo
 *   • {{placeholder}} se reemplaza por values[placeholder] (string).
 *
 * Genera A4 portrait, márgenes 50pt, Helvetica embedded.
 */

export interface RenderTemplateOptions {
  body: string;
  values: Record<string, string | number>;
  title?: string;
}

export async function renderTemplateToPdf(
  opts: RenderTemplateOptions
): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const helvetica = await pdf.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  // Reemplazar placeholders {{key}}
  let body = opts.body;
  for (const [k, v] of Object.entries(opts.values)) {
    const re = new RegExp(`\\{\\{\\s*${escapeRegex(k)}\\s*\\}\\}`, "g");
    body = body.replace(re, String(v));
  }

  // Marcar placeholders no resueltos con [—] para que no queden visibles raros
  body = body.replace(/\{\{\s*[\w-]+\s*\}\}/g, "[—]");

  const pageWidth = 595;
  const pageHeight = 842;
  const margin = 50;
  const maxWidth = pageWidth - margin * 2;
  const lineHeight12 = 16;
  const lineHeight16 = 22;
  const lineHeight22 = 30;

  let page = pdf.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  function nextPageIfNeeded(lineH: number) {
    if (y - lineH < margin) {
      page = pdf.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
    }
  }

  for (const rawLine of body.split("\n")) {
    const line = rawLine.replace(/\r$/, "");

    if (line.trim() === "") {
      y -= 10;
      continue;
    }

    if (line.startsWith("# ")) {
      const txt = line.slice(2);
      nextPageIfNeeded(lineHeight22);
      page.drawText(txt, {
        x: margin,
        y: y - 22,
        size: 22,
        font: helveticaBold,
        color: rgb(0.1, 0.15, 0.2),
      });
      y -= lineHeight22;
      continue;
    }

    if (line.startsWith("## ")) {
      const txt = line.slice(3);
      nextPageIfNeeded(lineHeight16);
      page.drawText(txt, {
        x: margin,
        y: y - 16,
        size: 16,
        font: helveticaBold,
        color: rgb(0.15, 0.2, 0.3),
      });
      y -= lineHeight16;
      continue;
    }

    const wrapped = wrapText(line, maxWidth, helvetica, 12);
    for (const chunk of wrapped) {
      nextPageIfNeeded(lineHeight12);
      page.drawText(chunk, {
        x: margin,
        y: y - 12,
        size: 12,
        font: helvetica,
        color: rgb(0.15, 0.15, 0.15),
      });
      y -= lineHeight12;
    }
  }

  // Footer
  const footerY = margin / 2;
  const footerTxt = opts.title
    ? `${opts.title} · Generado por Buleje · ${new Date().toLocaleDateString("es-PE")}`
    : `Generado por Buleje · ${new Date().toLocaleDateString("es-PE")}`;
  page.drawText(footerTxt, {
    x: margin,
    y: footerY,
    size: 9,
    font: helvetica,
    color: rgb(0.55, 0.55, 0.55),
  });

  const bytes = await pdf.save();
  return Buffer.from(bytes);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function wrapText(
  text: string,
  maxWidth: number,
  font: import("pdf-lib").PDFFont,
  size: number
): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const w of words) {
    const candidate = current ? `${current} ${w}` : w;
    const width = font.widthOfTextAtSize(candidate, size);
    if (width <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = w;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}
