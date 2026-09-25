/**
 * El comprobante de una liquidación de cuenta (ADR-413 §9), en PDF.
 *
 * Es un ACTA, no un recálculo: dibuja `liquidacion.detalle` tal como quedó
 * congelado al confirmar — un movimiento posterior no cambia un papel ya
 * firmado. Mismo camino que `comprobante.ts` (jsPDF cargado en demanda,
 * `montoEnLetras`), A4 vertical porque la tabla de líneas no entra en el A5
 * apaisado del recibo de adelanto.
 *
 * IO (descarga un archivo), sin React/fetch/Prisma.
 */

import { formatCurrency } from "@/lib/currency";
import { leerNeto } from "@/lib/adelantos/cuenta-unificada";
import { montoEnLetras } from "@/lib/adelantos/comprobante";
import type { EntregaPlaneada } from "@/lib/cuentas/liquidacion";
import type { LiquidacionDTO } from "@/lib/db/liquidacion-cuenta.db";

export interface DatosLiquidacionPdf {
  negocio?: string | null;
  liquidacion: LiquidacionDTO;
}

const fechaUtc = (iso: string) =>
  new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" });

export async function descargarComprobanteLiquidacion(d: DatosLiquidacionPdf): Promise<void> {
  const { default: jsPDF } = await import("jspdf");
  const doc = new jsPDF(); // A4 vertical por defecto
  const W = doc.internal.pageSize.getWidth();
  const { liquidacion: liq } = d;
  const det = liq.detalle;

  doc.setFontSize(9);
  doc.text((d.negocio ?? "").toUpperCase(), 14, 14);
  doc.setFontSize(16);
  doc.text("LIQUIDACIÓN DE CUENTA", 14, 23);
  doc.setFontSize(15);
  doc.text(liq.codigo, W - 14, 23, { align: "right" });

  doc.setFontSize(11);
  let y = 33;
  doc.text(liq.persona.nombre, 14, y);
  if (liq.persona.documento) {
    y += 6;
    doc.setFontSize(9);
    doc.text(`Documento: ${liq.persona.documento}`, 14, y);
  }
  y += 6;
  doc.setFontSize(9);
  doc.text(`Fecha: ${fechaUtc(liq.fecha)}`, 14, y);

  // 3) Lo que se cruzó.
  if (det.compensado > 0) {
    y += 10;
    doc.setFontSize(11);
    doc.text("Lo que se cruzó", 14, y);
    doc.setFontSize(9);
    for (const e of det.entregas.filter((x: EntregaPlaneada) => x.paso === "cruce")) {
      y += 6;
      doc.text(`${e.codigo ?? e.adelantoId} — ${e.descripcion}: ${formatCurrency(e.valor)}`, 16, y);
    }
    y += 6;
    doc.text(`Contra la cuenta forestal: ${formatCurrency(det.compensado)}`, 16, y);
  }

  // 4) Lo que se pagó.
  if (det.pago) {
    y += 10;
    doc.setFontSize(11);
    doc.text("Lo que se pagó", 14, y);
    doc.setFontSize(9);
    y += 6;
    const quien = det.pago.direccion === "recibido" ? `${liq.persona.nombre} pagó` : `Se le pagó a ${liq.persona.nombre}`;
    doc.text(`${quien} — ${det.pago.metodo} — ${formatCurrency(det.pago.monto)}`, 16, y);
    y += 5;
    doc.text(`(${montoEnLetras(det.pago.monto)} soles)`, 16, y);
  }

  // 5) Antes → Después.
  y += 10;
  doc.setFontSize(11);
  doc.text("Antes → Después", 14, y);
  doc.setFontSize(9);
  y += 6;
  doc.text(`Adelantos: ${formatCurrency(det.antes.adelantosTeDebe)} → ${formatCurrency(det.despues.adelantosTeDebe)}`, 16, y);
  y += 5;
  doc.text(`Cuenta forestal: ${formatCurrency(det.antes.maderaSaldo)} → ${formatCurrency(det.despues.maderaSaldo)}`, 16, y);
  y += 5;
  doc.text(leerNeto(det.despues.neto, liq.persona.nombre), 16, y);

  // 6) Queda fuera.
  if (det.fuera.length > 0) {
    y += 9;
    doc.setFontSize(11);
    doc.text("Queda fuera", 14, y);
    doc.setFontSize(9);
    for (const f of det.fuera) {
      y += 6;
      doc.text(`${f.etiqueta} (${formatCurrency(f.monto)}${f.moneda !== "PEN" ? ` ${f.moneda}` : ""}) — ${f.motivo}`, 16, y);
    }
  }

  // 7) Declaración + firmas.
  y += 12;
  doc.setFontSize(9);
  doc.text(
    doc.splitTextToSize("Ambas partes están conformes con los saldos que figuran después de esta liquidación.", W - 28) as string[],
    14,
    y,
  );
  const yFirma = doc.internal.pageSize.getHeight() - 30;
  doc.line(20, yFirma, 90, yFirma);
  doc.line(W - 90, yFirma, W - 20, yFirma);
  doc.setFontSize(8);
  doc.text("Negocio", 55, yFirma + 5, { align: "center" });
  doc.text(liq.persona.nombre, W - 55, yFirma + 5, { align: "center" });

  // 8) Anulada.
  if (liq.anulada) {
    doc.setTextColor(180, 40, 40);
    doc.setFontSize(22);
    doc.text(`ANULADA — ${liq.anulada.motivo}`.slice(0, 90), W / 2, doc.internal.pageSize.getHeight() / 2, { align: "center", angle: 20 });
    doc.setTextColor(0, 0, 0);
  }

  doc.save(`${liq.codigo.toLowerCase()}.pdf`);
}
