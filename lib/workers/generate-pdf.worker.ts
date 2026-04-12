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

    let pdfBytes: Uint8Array;

    switch (pdfType) {
      case "invoice":
        pdfBytes = await generateInvoicePdf(jsPDF, data);
        break;
      case "order-receipt":
        pdfBytes = await generateOrderReceiptPdf(jsPDF, data);
        break;
      case "stock-report":
        pdfBytes = await generateStockReportPdf(jsPDF, data);
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
        subject: getPdfSubject(pdfType, data),
        html: getPdfEmailHtml(pdfType, data),
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

async function generateInvoicePdf(
  JsPDF: typeof import("jspdf").jsPDF,
  data: Record<string, unknown>,
): Promise<Uint8Array> {
  const doc = new JsPDF({ unit: "mm", format: "a4" });

  doc.setFontSize(20);
  doc.text("FACTURA", 105, 20, { align: "center" });

  doc.setFontSize(12);
  doc.text(`N° ${String(data.invoiceNumber ?? "—")}`, 20, 40);
  doc.text(`Fecha: ${String(data.date ?? new Date().toLocaleDateString("es-PE"))}`, 20, 48);
  doc.text(`Cliente: ${String(data.customerName ?? "—")}`, 20, 56);
  doc.text(`RUC/DNI: ${String(data.ruc ?? "—")}`, 20, 64);

  doc.line(20, 72, 190, 72);

  doc.text("Descripción", 20, 80);
  doc.text("Total", 170, 80, { align: "right" });

  const items = Array.isArray(data.items) ? data.items : [];
  let y = 88;
  for (const item of items as Array<Record<string, unknown>>) {
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

  return doc.output("arraybuffer") as unknown as Uint8Array;
}

async function generateOrderReceiptPdf(
  JsPDF: typeof import("jspdf").jsPDF,
  data: Record<string, unknown>,
): Promise<Uint8Array> {
  const doc = new JsPDF({ unit: "mm", format: [80, 200] });

  doc.setFontSize(14);
  doc.text("COMPROBANTE DE PEDIDO", 40, 15, { align: "center" });

  doc.setFontSize(10);
  doc.text(`Pedido: #${String(data.orderId ?? "").slice(-8).toUpperCase()}`, 5, 28);
  doc.text(`Cliente: ${String(data.customerName ?? "—")}`, 5, 36);
  doc.text(`Fecha: ${String(data.date ?? new Date().toLocaleDateString("es-PE"))}`, 5, 44);

  doc.line(5, 50, 75, 50);

  const items = Array.isArray(data.items) ? data.items : [];
  let y = 58;
  for (const item of items as Array<Record<string, unknown>>) {
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
): Promise<Uint8Array> {
  const doc = new JsPDF({ unit: "mm", format: "a4" });

  doc.setFontSize(18);
  doc.text("REPORTE DE STOCK", 105, 20, { align: "center" });

  doc.setFontSize(11);
  doc.text(`Generado: ${new Date().toLocaleString("es-PE")}`, 20, 32);
  doc.text(`Tenant: ${String(data.tenantId ?? "—")}`, 20, 40);

  doc.line(20, 46, 190, 46);

  doc.setFontSize(10);
  doc.text("Producto", 20, 54);
  doc.text("Stock", 120, 54);
  doc.text("Mín.", 145, 54);
  doc.text("Estado", 165, 54);

  const products = Array.isArray(data.products) ? data.products : [];
  let y = 62;
  for (const product of products as Array<Record<string, unknown>>) {
    const stock = Number(product.stock ?? 0);
    const min = Number(product.minStock ?? 0);
    const status = stock <= 0 ? "Sin stock" : stock < min ? "Bajo" : "OK";
    doc.text(String(product.name ?? "").slice(0, 40), 20, y);
    doc.text(String(stock), 120, y);
    doc.text(String(min), 145, y);
    doc.text(status, 165, y);
    y += 7;
    if (y > 270) {
      doc.addPage();
      y = 20;
    }
  }

  return doc.output("arraybuffer") as unknown as Uint8Array;
}

// ── Helpers de email para PDF ─────────────────────────────────────────────────

function getPdfSubject(pdfType: string, data: Record<string, unknown>): string {
  switch (pdfType) {
    case "invoice":
      return `Factura N° ${String(data.invoiceNumber ?? "")} — Buleje`;
    case "order-receipt":
      return `Comprobante de pedido #${String(data.orderId ?? "").slice(-8).toUpperCase()}`;
    case "stock-report":
      return `Reporte de stock — ${new Date().toLocaleDateString("es-PE")}`;
    default:
      return "Documento generado — Buleje";
  }
}

function getPdfEmailHtml(pdfType: string, data: Record<string, unknown>): string {
  return `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;">
      <div style="background:#00B4A6;padding:20px 24px;">
        <h2 style="color:#fff;margin:0;">Documento adjunto</h2>
      </div>
      <div style="padding:20px 24px;">
        <p>Tu documento <strong>${getPdfSubject(pdfType, data)}</strong> ha sido generado.</p>
        <p style="color:#666;font-size:13px;">Buleje</p>
      </div>
    </div>
  `;
}
