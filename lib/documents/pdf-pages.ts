import "server-only";
import { PDFDocument, degrees } from "pdf-lib";

/** Rota TODAS las páginas del PDF el ángulo dado (90/180/270), acumulando sobre la rotación actual. */
export async function rotatePdfAllPages(bytes: Uint8Array, deg: number): Promise<Buffer> {
  const pdf = await PDFDocument.load(bytes);
  for (const page of pdf.getPages()) {
    const current = page.getRotation().angle;
    page.setRotation(degrees((current + deg) % 360));
  }
  return Buffer.from(await pdf.save());
}

/** Divide el PDF en un documento por página. Devuelve los bytes de cada página. */
export async function splitPdfPerPage(bytes: Uint8Array): Promise<{ pageNumber: number; bytes: Buffer }[]> {
  const src = await PDFDocument.load(bytes);
  const count = src.getPageCount();
  const out: { pageNumber: number; bytes: Buffer }[] = [];
  for (let i = 0; i < count; i++) {
    const doc = await PDFDocument.create();
    const [page] = await doc.copyPages(src, [i]);
    doc.addPage(page);
    out.push({ pageNumber: i + 1, bytes: Buffer.from(await doc.save()) });
  }
  return out;
}
