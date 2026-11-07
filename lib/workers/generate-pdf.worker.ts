/**
 * Worker: generate-pdf
 *
 * Genera PDFs con jsPDF y opcionalmente los envía por email.
 * Soporta subtipos: "invoice", "order-receipt", "stock-report".
 *
 * Nota: jsPDF corre en Node.js sin DOM — usar solo APIs disponibles en Node.
 * Para subtipos desconocidos loggea un error sin reintentar.
 */

import { logger } from "@/lib/logger";
import { queue, PdfPayloadSchema, type JobEnvelope } from "@/lib/queue";
import { membreteParaPdf } from "@/lib/documentos/membrete-servidor";
import {
  altoDelPie,
  datosDelMembrete,
  dibujarMembrete,
  dibujarMembreteBreve,
  dibujarPies,
  formatoDeImagen,
  type DatosMembrete,
  type MembreteDocumento,
} from "@/lib/documentos/membrete-pdf";

type JsPdf = InstanceType<typeof import("jspdf").jsPDF>;

/** El negocio del PDF (nombre, RUC, dirección, logo). Sin él (o si el logo falla) sale el monograma: nunca rompe el trabajo. */
async function negocioDelPdf(tenantId: string): Promise<MembreteDocumento | null> {
  try {
    const { membrete, logo } = await membreteParaPdf(tenantId);
    return { ...membrete, logo: logo ? { dataUrl: `data:image/png;base64,${Buffer.from(logo.bytes).toString("base64")}`, ancho: logo.ancho, alto: logo.alto } : null };
  } catch (err) {
    logger.warn("[worker:generate-pdf] sin membrete del negocio", { tenantId, error: String(err) });
    return null;
  }
}

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function handleGeneratePdf(envelope: JobEnvelope): Promise<void> {
  const parsed = PdfPayloadSchema.safeParse(envelope.payload);
  if (!parsed.success) {
    logger.error("[worker:generate-pdf] Invalid payload — skipping retry", {
      jobId: envelope.jobId,
      issues: parsed.error.issues,
    });
    return;
  }

  const { tenantId, pdfType, data, sendTo } = parsed.data;

  try {
    // Importación dinámica para evitar que jsPDF se bundle en el cliente
    const { jsPDF } = await import("jspdf");
    const negocio = await negocioDelPdf(tenantId);

    let pdfBytes: Uint8Array;

    switch (pdfType) {
      case "invoice":
        pdfBytes = await generateInvoicePdf(jsPDF, data, negocio);
        break;
      case "order-receipt":
        pdfBytes = await generateOrderReceiptPdf(jsPDF, data, negocio);
        break;
      case "stock-report":
        pdfBytes = await generateStockReportPdf(jsPDF, data, negocio);
        break;
      default:
        logger.warn("[worker:generate-pdf] Unknown PDF type — skipping", {
          jobId: envelope.jobId,
          tenantId,
          pdfType,
        });
        return;
    }

    logger.info("[worker:generate-pdf] PDF generated", {
      jobId: envelope.jobId,
      tenantId,
      pdfType,
      bytes: pdfBytes.length,
      attempt: envelope.attempt,
    });

    // Si hay destinatario, encolar envío de email con el PDF adjunto
    if (sendTo) {
      const { queue: q } = await import("@/lib/queue");
      await q.enqueue("send-email", {
        tenantId,
        to: sendTo,
        subject: getPdfSubject(pdfType, data, negocio?.nombre),
        html: getPdfEmailHtml(pdfType, data, negocio?.nombre),
      });

      logger.info("[worker:generate-pdf] Email job enqueued for PDF", {
        jobId: envelope.jobId,
        tenantId,
        sendTo,
      });
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);

    logger.error("[worker:generate-pdf] Failed to generate PDF", {
      jobId: envelope.jobId,
      tenantId,
      pdfType,
      attempt: envelope.attempt,
      error: errorMessage,
    });

    await queue.retry(envelope);
  }
}

// ── Generadores de PDF por subtipo ────────────────────────────────────────────
// Todos salen con el membrete común del negocio (ADR-514): logo + nombre, tipo/código/fecha
// y pie paginado; el ticket de 80 mm lleva sólo el logo chico y el nombre.

const aTexto = (v: unknown, defecto = "—") => (v == null || v === "" ? defecto : String(v));

function pieYMembrete(doc: JsPdf, mbr: DatosMembrete): void {
  dibujarPies(doc, mbr);
}

async function generateInvoicePdf(
  JsPDF: typeof import("jspdf").jsPDF,
  data: Record<string, unknown>,
  negocio: MembreteDocumento | null,
): Promise<Uint8Array> {
  const doc = new JsPDF({ unit: "mm", format: "a4" });
  const mbr = datosDelMembrete(negocio, {
    tipo: "Factura",
    codigo: aTexto(data.invoiceNumber, "") || null,
    fecha: aTexto(data.date, new Date().toLocaleDateString("es-PE")),
  });
  let y = dibujarMembrete(doc, mbr) + 4;
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.text(`Cliente: ${aTexto(data.customerName)}`, 20, y);
  doc.text(`RUC/DNI: ${aTexto(data.ruc)}`, 20, (y += 8));

  doc.line(20, (y += 8), 190, y);

  doc.text("Descripción", 20, (y += 8));
  doc.text("Total", 170, y, { align: "right" });

  const items = Array.isArray(data.items) ? data.items : [];
  y += 8;
  for (const item of items as Array<Record<string, unknown>>) {
    if (y > 297 - altoDelPie() - 24) {
      doc.addPage();
      y = dibujarMembreteBreve(doc, mbr, "Factura");
      doc.setTextColor(0, 0, 0);
    }
    doc.setFontSize(10);
    doc.text(String(item.name ?? ""), 20, y);
    doc.text(`S/${Number(item.total ?? 0).toFixed(2)}`, 170, y, { align: "right" });
    y += 8;
  }

  doc.line(20, y, 190, y);
  y += 8;
  doc.setFontSize(12);
  doc.text("TOTAL:", 140, y);
  doc.text(`S/${Number(data.total ?? 0).toFixed(2)}`, 170, y, { align: "right" });

  pieYMembrete(doc, mbr);
  return doc.output("arraybuffer") as unknown as Uint8Array;
}

async function generateOrderReceiptPdf(
  JsPDF: typeof import("jspdf").jsPDF,
  data: Record<string, unknown>,
  negocio: MembreteDocumento | null,
): Promise<Uint8Array> {
  const items = Array.isArray(data.items) ? (data.items as Array<Record<string, unknown>>) : [];
  const mbr = datosDelMembrete(negocio, { tipo: "Comprobante de pedido" });
  // Ticket de 80 mm: la altura crece con los ítems (antes quedaban cortados a los ~17).
  const doc = new JsPDF({ unit: "mm", format: [80, Math.max(200, 92 + items.length * 7)] });

  // Sólo logo chico + nombre, centrados; sin pie paginado.
  let y = 6;
  if (mbr.logo) {
    const r = mbr.logo.ancho / mbr.logo.alto;
    const ancho = Math.min(40, 12 * r);
    doc.addImage(mbr.logo.dataUrl, formatoDeImagen(mbr.logo.dataUrl), 40 - ancho / 2, y, ancho, ancho / r, undefined, "FAST");
    y += ancho / r + 3;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);
  const nombre = doc.splitTextToSize(mbr.titulo, 70) as string[];
  doc.text(nombre, 40, y + 3, { align: "center" });
  y += 3 + nombre.length * 4.5 + 4;

  doc.setFontSize(14);
  doc.text("COMPROBANTE DE PEDIDO", 40, y, { align: "center", maxWidth: 70 });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Pedido: #${String(data.orderId ?? "").slice(-8).toUpperCase()}`, 5, (y += 13));
  doc.text(`Cliente: ${aTexto(data.customerName)}`, 5, (y += 8));
  doc.text(`Fecha: ${aTexto(data.date, new Date().toLocaleDateString("es-PE"))}`, 5, (y += 8));

  doc.line(5, (y += 6), 75, y);
  y += 8;
  for (const item of items) {
    doc.text(`${Number(item.quantity ?? 1)}x ${String(item.name ?? "")}`, 5, y);
    doc.text(`S/${Number(item.price ?? 0).toFixed(2)}`, 75, y, { align: "right" });
    y += 7;
  }

  doc.line(5, y, 75, y);
  y += 7;
  doc.setFontSize(12);
  doc.text("TOTAL:", 40, y);
  doc.text(`S/${Number(data.total ?? 0).toFixed(2)}`, 75, y, { align: "right" });

  return doc.output("arraybuffer") as unknown as Uint8Array;
}

async function generateStockReportPdf(
  JsPDF: typeof import("jspdf").jsPDF,
  data: Record<string, unknown>,
  negocio: MembreteDocumento | null,
): Promise<Uint8Array> {
  const doc = new JsPDF({ unit: "mm", format: "a4" });
  const mbr = datosDelMembrete(negocio, { tipo: "Reporte de stock", fecha: new Date().toLocaleDateString("es-PE") });
  let y = dibujarMembrete(doc, mbr) + 4;
  doc.setTextColor(0, 0, 0);

  const cabecera = (yy: number) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Producto", 20, yy);
    doc.text("Stock", 120, yy);
    doc.text("Mín.", 145, yy);
    doc.text("Estado", 165, yy);
    doc.setFont("helvetica", "normal");
    doc.line(20, yy + 2, 190, yy + 2);
    return yy + 8;
  };
  y = cabecera(y);

  const products = Array.isArray(data.products) ? data.products : [];
  for (const product of products as Array<Record<string, unknown>>) {
    const stock = Number(product.stock ?? 0);
    const min = Number(product.minStock ?? 0);
    const status = stock <= 0 ? "Sin stock" : stock < min ? "Bajo" : "OK";
    doc.text(String(product.name ?? "").slice(0, 40), 20, y);
    doc.text(String(stock), 120, y);
    doc.text(String(min), 145, y);
    doc.text(status, 165, y);
    y += 7;
    if (y > 297 - altoDelPie() - 6) {
      doc.addPage();
      y = cabecera(dibujarMembreteBreve(doc, mbr, "Reporte de stock") + 2);
      doc.setTextColor(0, 0, 0);
    }
  }

  pieYMembrete(doc, mbr);
  return doc.output("arraybuffer") as unknown as Uint8Array;
}

// ── Helpers de email para PDF ─────────────────────────────────────────────────

function getPdfSubject(pdfType: string, data: Record<string, unknown>, negocio?: string | null): string {
  const firma = negocio?.trim() ? ` — ${negocio.trim()}` : "";
  switch (pdfType) {
    case "invoice":
      return `Factura N° ${String(data.invoiceNumber ?? "")}${firma}`;
    case "order-receipt":
      return `Comprobante de pedido #${String(data.orderId ?? "").slice(-8).toUpperCase()}`;
    case "stock-report":
      return `Reporte de stock — ${new Date().toLocaleDateString("es-PE")}`;
    default:
      return `Documento generado${firma}`;
  }
}

function getPdfEmailHtml(pdfType: string, data: Record<string, unknown>, negocio?: string | null): string {
  return `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;">
      <div style="background:#00A0A0;padding:20px 24px;">
        <h2 style="color:#fff;margin:0;">Documento adjunto</h2>
      </div>
      <div style="padding:20px 24px;">
        <p>Tu documento <strong>${esc(getPdfSubject(pdfType, data, negocio))}</strong> ha sido generado.</p>
        ${negocio?.trim() ? `<p style="color:#666;font-size:13px;">${esc(negocio.trim())}</p>` : ""}
      </div>
    </div>
  `;
}
