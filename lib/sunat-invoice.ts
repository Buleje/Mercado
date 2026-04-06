/**
 * lib/sunat-invoice.ts
 * Capa de orquestación para comprobantes electrónicos SUNAT.
 *
 * - Reutiliza generateXML, calculateIGV y generateCorrelativo de lib/sunat.ts
 *   (no duplica lógica).
 * - Agrega generación de PDF en base64 con jsPDF (dynamic import para evitar
 *   importar el paquete en SSR cuando no se necesita).
 * - Expone buildInvoiceFromOrder() para construir el documento a partir de una
 *   orden de Prisma sin lógica en el route handler.
 */

import { logger } from "@/lib/logger";
import {
  generateXML,
  calculateIGV,
  generateCorrelativo,
  type SunatDocument,
} from "@/lib/sunat";

// ── Tipos públicos ────────────────────────────────────────────────────────────

export interface InvoiceOrderItem {
  name: string;
  quantity: number;
  price: number; // precio con IGV
  unit: string;
}

export interface InvoiceOrder {
  id: string;
  customerName: string;
  customerRuc?: string;
  customerDni?: string;
  total: number;
  items: InvoiceOrderItem[];
}

export interface GeneratedInvoice {
  xml: string;
  pdfBase64: string;
  serie: string;
  correlativo: number;
  numeroCompleto: string; // ej: "B001-00000042"
}

// ── Builder principal ─────────────────────────────────────────────────────────

/**
 * Construye el objeto SunatDocument desde una orden normalizada.
 * Calcula IGV por ítem y totales a partir de los precios con IGV incluido.
 */
export function buildSunatDocument(
  order: InvoiceOrder,
  tipo: "boleta" | "factura",
  serie: string,
  correlativo: number,
): SunatDocument {
  const fechaEmision = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  const items: SunatDocument["items"] = order.items.map((item) => {
    const subtotalItem = item.price * item.quantity;
    const igvItem = calculateIGV(subtotalItem).igv;
    return {
      descripcion: item.name,
      cantidad: item.quantity,
      precioUnit: item.price,
      igv: igvItem,
    };
  });

  const igvCalc = calculateIGV(order.total);

  const cliente: SunatDocument["cliente"] = {
    nombre: order.customerName,
    ...(order.customerRuc && { ruc: order.customerRuc }),
    ...(order.customerDni && { dni: order.customerDni }),
  };

  return {
    tipo,
    serie,
    numero: correlativo,
    fecha: fechaEmision,
    cliente,
    items,
    totalGravado: igvCalc.gravado,
    totalIgv: igvCalc.igv,
    totalVenta: igvCalc.total,
    moneda: "PEN",
  };
}

// ── Generación de PDF ─────────────────────────────────────────────────────────

/**
 * Genera un PDF simple del comprobante y lo retorna como base64.
 * Usa dynamic import de jsPDF para no cargar el módulo en builds que no lo necesiten.
 */
export async function generateInvoicePdf(
  doc: SunatDocument,
  businessName: string,
  ruc: string,
): Promise<string> {
  // Dynamic import — solo se carga cuando se invoca la función
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "mm", format: "a4" });

  const numeroDoc = `${doc.serie}-${String(doc.numero).padStart(8, "0")}`;
  const tipoLabel = doc.tipo === "boleta" ? "BOLETA DE VENTA ELECTRÓNICA" : "FACTURA ELECTRÓNICA";

  // Cabecera
  pdf.setFontSize(14);
  pdf.setFont("helvetica", "bold");
  pdf.text(businessName.toUpperCase(), 105, 20, { align: "center" });

  pdf.setFontSize(10);
  pdf.setFont("helvetica", "normal");
  pdf.text(`RUC: ${ruc}`, 105, 26, { align: "center" });

  pdf.setFontSize(12);
  pdf.setFont("helvetica", "bold");
  pdf.text(tipoLabel, 105, 34, { align: "center" });
  pdf.text(numeroDoc, 105, 40, { align: "center" });

  // Datos del cliente
  pdf.setFontSize(9);
  pdf.setFont("helvetica", "normal");
  pdf.text(`Fecha: ${doc.fecha}`, 15, 50);
  pdf.text(`Cliente: ${doc.cliente.nombre}`, 15, 56);
  if (doc.cliente.ruc) pdf.text(`RUC: ${doc.cliente.ruc}`, 15, 62);
  if (doc.cliente.dni) pdf.text(`DNI: ${doc.cliente.dni}`, 15, 62);

  // Línea separadora
  pdf.setLineWidth(0.3);
  pdf.line(15, 66, 195, 66);

  // Encabezado de tabla
  pdf.setFont("helvetica", "bold");
  pdf.text("Descripción", 15, 72);
  pdf.text("Cant.", 120, 72, { align: "right" });
  pdf.text("P.Unit", 150, 72, { align: "right" });
  pdf.text("Subtotal", 190, 72, { align: "right" });
  pdf.line(15, 74, 195, 74);

  // Ítems
  pdf.setFont("helvetica", "normal");
  let y = 80;
  for (const item of doc.items) {
    if (y > 250) { pdf.addPage(); y = 20; }
    const subtotal = item.precioUnit * item.cantidad;
    pdf.text(item.descripcion.slice(0, 55), 15, y);
    pdf.text(String(item.cantidad), 120, y, { align: "right" });
    pdf.text(`S/${item.precioUnit.toFixed(2)}`, 150, y, { align: "right" });
    pdf.text(`S/${subtotal.toFixed(2)}`, 190, y, { align: "right" });
    y += 6;
  }

  // Totales
  pdf.line(15, y + 2, 195, y + 2);
  y += 8;
  pdf.text(`Op. Gravada:`, 130, y);
  pdf.text(`S/${doc.totalGravado.toFixed(2)}`, 190, y, { align: "right" });
  y += 6;
  pdf.text(`IGV (18%):`, 130, y);
  pdf.text(`S/${doc.totalIgv.toFixed(2)}`, 190, y, { align: "right" });
  y += 6;
  pdf.setFont("helvetica", "bold");
  pdf.text(`TOTAL:`, 130, y);
  pdf.text(`S/${doc.totalVenta.toFixed(2)}`, 190, y, { align: "right" });

  // Pie
  y += 14;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.text("Representación impresa de comprobante electrónico", 105, y, { align: "center" });
  pdf.text("Consulte su comprobante en: www.sunat.gob.pe", 105, y + 5, { align: "center" });

  return pdf.output("datauristring").split(",")[1]; // solo la parte base64
}

// ── Orquestador ───────────────────────────────────────────────────────────────

/**
 * Genera el XML UBL 2.1 y el PDF base64 para una orden dada.
 * Obtiene el correlativo atómico desde la BD.
 *
 * @param order       Orden normalizada con sus ítems
 * @param tipoDoc     "01" = factura, "03" = boleta
 * @param tenantId    Para aislar correlativos por tenant
 * @param businessName Razón social del emisor (desde Settings)
 * @param ruc         RUC del emisor (desde Settings)
 */
export async function generateInvoice(
  order: InvoiceOrder,
  tipoDoc: "01" | "03",
  tenantId: string,
  businessName: string,
  ruc: string,
): Promise<GeneratedInvoice> {
  const tipo = tipoDoc === "01" ? "factura" : "boleta";

  logger.info("[SunatInvoice] Generando comprobante", {
    orderId: order.id,
    tenantId,
    tipo,
  });

  const correlatStr = await generateCorrelativo(tenantId, tipo);
  const correlativo = parseInt(correlatStr, 10);
  const serie = tipoDoc === "01" ? "F001" : "B001";

  const sunatDoc = buildSunatDocument(order, tipo, serie, correlativo);
  const xml = generateXML(sunatDoc);

  let pdfBase64 = "";
  try {
    pdfBase64 = await generateInvoicePdf(sunatDoc, businessName, ruc);
  } catch (pdfErr) {
    // El PDF es opcional — no bloquear si jsPDF falla
    logger.warn("[SunatInvoice] Error generando PDF, continuando sin él", {
      orderId: order.id,
      error: pdfErr instanceof Error ? pdfErr.message : String(pdfErr),
    });
  }

  const numeroCompleto = `${serie}-${String(correlativo).padStart(8, "0")}`;

  logger.info("[SunatInvoice] Comprobante generado", {
    orderId: order.id,
    numeroCompleto,
  });

  return { xml, pdfBase64, serie, correlativo, numeroCompleto };
}

// Re-exporta utilidades de sunat.ts para que los consumers solo importen desde aquí
export { calculateIGV, generateCorrelativo };
