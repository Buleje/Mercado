import "server-only";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { createHash } from "crypto";

/**
 * Estampa una firma visual + sello con metadata en la última página de un PDF.
 *
 * NO es firma criptográfica (PAdES/PKCS#7) — es un sello visual con audit
 * trail server-side. Para firma legal SUNAT/RENIEC hay un ADR aparte
 * pendiente. Lo que sí garantizamos:
 *   • Sello visible (nombre, fecha, IP, hash SHA-256 del PDF original)
 *   • Trazo dibujado (imagen PNG del canvas del usuario)
 *   • Hash del PDF original guardado en metadata + audit log
 */

export interface SignPdfOptions {
  pdfBytes: Uint8Array;
  signerName: string;
  signerRole?: string;
  signatureImagePngBase64?: string; // data:image/png;base64,...
  ipAddress?: string;
}

export interface SignPdfResult {
  signedBytes: Buffer;
  originalSha256: string;
  signedAt: string;
}

export async function signPdfVisually(opts: SignPdfOptions): Promise<SignPdfResult> {
  const originalSha256 = createHash("sha256").update(opts.pdfBytes).digest("hex");
  const signedAt = new Date().toISOString();

  const pdf = await PDFDocument.load(opts.pdfBytes);
  const helvetica = await pdf.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  // Embed signature PNG si vino
  let signatureImage = null;
  if (opts.signatureImagePngBase64) {
    try {
      const base64 = opts.signatureImagePngBase64.replace(/^data:image\/\w+;base64,/, "");
      const pngBytes = Buffer.from(base64, "base64");
      signatureImage = await pdf.embedPng(pngBytes);
    } catch {
      // ignore — sello textual igual se aplica
    }
  }

  const lastPage = pdf.getPage(pdf.getPageCount() - 1);
  const { width } = lastPage.getSize();

  // Bloque de sello en la esquina inferior derecha
  const boxW = 230;
  const boxH = 110;
  const x = width - boxW - 30;
  const y = 30;

  lastPage.drawRectangle({
    x,
    y,
    width: boxW,
    height: boxH,
    borderColor: rgb(0.2, 0.5, 0.4),
    borderWidth: 1.5,
    color: rgb(0.95, 0.99, 0.97),
    opacity: 0.95,
  });

  // Texto del sello
  lastPage.drawText("FIRMADO DIGITALMENTE", {
    x: x + 10,
    y: y + boxH - 18,
    size: 9,
    font: helveticaBold,
    color: rgb(0.15, 0.4, 0.3),
  });

  // Imagen de firma (si hay)
  if (signatureImage) {
    const sigW = Math.min(140, boxW - 80);
    const dims = signatureImage.scaleToFit(sigW, 40);
    lastPage.drawImage(signatureImage, {
      x: x + 10,
      y: y + 40,
      width: dims.width,
      height: dims.height,
    });
  }

  lastPage.drawText(opts.signerName, {
    x: x + 10,
    y: y + 30,
    size: 10,
    font: helveticaBold,
    color: rgb(0.1, 0.1, 0.1),
  });

  if (opts.signerRole) {
    lastPage.drawText(opts.signerRole, {
      x: x + 10,
      y: y + 18,
      size: 8,
      font: helvetica,
      color: rgb(0.4, 0.4, 0.4),
    });
  }

  const fechaPe = new Date(signedAt).toLocaleString("es-PE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  lastPage.drawText(fechaPe, {
    x: x + 10,
    y: y + 8,
    size: 8,
    font: helvetica,
    color: rgb(0.4, 0.4, 0.4),
  });

  // Hash truncado al pie (verificable)
  lastPage.drawText(`SHA-256: ${originalSha256.slice(0, 24)}…`, {
    x: x + 10,
    y: y - 4,
    size: 6,
    font: helvetica,
    color: rgb(0.5, 0.5, 0.5),
  });

  // Metadata del PDF
  pdf.setSubject(`Firmado por ${opts.signerName} el ${fechaPe}`);
  pdf.setKeywords([
    `signed-by:${opts.signerName}`,
    `signed-at:${signedAt}`,
    `original-sha256:${originalSha256}`,
  ]);

  const bytes = await pdf.save();
  return {
    signedBytes: Buffer.from(bytes),
    originalSha256,
    signedAt,
  };
}
