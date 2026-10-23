import "server-only";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { fechaDelDocumento, type MembreteDocumento } from "@/lib/documentos/membrete-pdf";
import { crearMembrete, dibujarMembrete, dibujarMembreteBreve, dibujarPies, limiteInferior, margenPdfLib, type LogoServidor } from "@/lib/documentos/membrete-pdflib";
import type { LineaEstadoCuenta } from "@/lib/adelantos/estado-cuenta-unificado";

/**
 * El estado de cuenta de una persona como PDF A4. NO calcula saldos: dibuja las
 * `LineaEstadoCuenta` de `estadoCuentaUnificado` (Adelantos + cuenta forestal,
 * la misma fuente que `/api/adelantos/cuentas/estado`); el saldo final es el
 * último `acumulado` de cada moneda. Cabecera y pie: el membrete común
 * (`lib/documentos/membrete-pdflib.ts`, ADR-514).
 */
const NEGRO = rgb(0, 0, 0);
const GRIS = rgb(0.4, 0.4, 0.4);
const A4: [number, number] = [595.28, 841.89];
const M = margenPdfLib();
const COL = { fecha: M, concepto: M + 70, cargo: 360, abono: 430, saldo: A4[0] - M }; // derecha: x del borde derecho
const simbolo = (mon: string) => (mon === "USD" ? "$" : "S/");
const num = (n: number) => n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dia = (iso: string) => new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Lima" });

/** El último saldo corrido de cada moneda (vienen en orden cronológico). */
function saldoFinal(lineas: readonly LineaEstadoCuenta[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const l of lineas) out[l.moneda] = l.acumulado;
  return out;
}

export async function pdfEstadoDeCuenta(
  membrete: MembreteDocumento,
  nombre: string,
  movimientos: readonly LineaEstadoCuenta[],
  logo: LogoServidor | null = null,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const mb = await crearMembrete(doc, membrete, logo, { tipo: "Estado de cuenta", fecha: fechaDelDocumento(new Date().toISOString()) });
  doc.setTitle(`Estado de cuenta — ${nombre}`);
  doc.setCreator(mb.datos.titulo);
  const { font, bold, t } = mb;
  const piso = limiteInferior() + 24;

  let page: PDFPage = doc.addPage(A4);
  let y = dibujarMembrete(mb, page);
  const texto = (s: string, x: number, size = 9, f: PDFFont = font, color = NEGRO) => page.drawText(t(s), { x, y, size, font: f, color });
  const derecha = (s: string, xDer: number, size = 9, f: PDFFont = font) => {
    const txt = t(s);
    page.drawText(txt, { x: xDer - f.widthOfTextAtSize(txt, size), y, size, font: f, color: NEGRO });
  };
  const recorta = (s: string, max: number, size: number) => {
    let r = t(s);
    while (r.length > 1 && font.widthOfTextAtSize(r, size) > max) r = r.slice(0, -1);
    return r;
  };

  texto(nombre, M, 12, bold);
  y -= 20;

  const cabecera = () => {
    texto("Fecha", COL.fecha, 8.5, bold);
    texto("Concepto", COL.concepto, 8.5, bold);
    derecha("Cargo", COL.cargo, 8.5, bold);
    derecha("Abono", COL.abono, 8.5, bold);
    derecha("Saldo", COL.saldo, 8.5, bold);
    y -= 4;
    page.drawLine({ start: { x: M, y }, end: { x: A4[0] - M, y }, thickness: 0.6, color: NEGRO });
    y -= 12;
  };
  cabecera();

  for (const m of movimientos) {
    if (y < piso + 20) {
      page = doc.addPage(A4);
      y = dibujarMembreteBreve(mb, page, `Estado de cuenta — ${nombre}`);
      cabecera();
    }
    const s = simbolo(m.moneda);
    texto(dia(m.fecha), COL.fecha);
    const concepto = m.referencia ? `${m.concepto} ${m.referencia}` : m.concepto;
    page.drawText(recorta(concepto, COL.cargo - COL.concepto - 70, 9), { x: COL.concepto, y, size: 9, font, color: NEGRO });
    if (m.monto >= 0) derecha(`${s} ${num(m.monto)}`, COL.cargo);
    else derecha(`${s} ${num(-m.monto)}`, COL.abono);
    derecha(`${s} ${num(m.acumulado)}`, COL.saldo);
    y -= 13;
  }
  if (movimientos.length === 0) {
    texto("Sin movimientos.", COL.fecha, 9, font, GRIS);
    y -= 13;
  }

  if (y < piso + 10) {
    page = doc.addPage(A4);
    y = dibujarMembreteBreve(mb, page, `Estado de cuenta — ${nombre}`);
  }
  y -= 4;
  page.drawLine({ start: { x: M, y }, end: { x: A4[0] - M, y }, thickness: 0.6, color: NEGRO });
  y -= 16;
  for (const [mon, v] of Object.entries(saldoFinal(movimientos))) {
    texto(`Saldo pendiente (${mon})`, COL.concepto, 10, bold);
    derecha(`${simbolo(mon)} ${num(v)}`, COL.saldo, 10, bold);
    y -= 15;
  }
  dibujarPies(mb);
  return doc.save();
}
