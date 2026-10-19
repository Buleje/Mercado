import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { Membrete } from "@/lib/admin/membrete";
import type { LineaEstadoCuenta } from "@/lib/adelantos/estado-cuenta-unificado";
import { sanearParaFuente } from "@/lib/forestal/gtf-salida-pdf";

/**
 * El estado de cuenta de una persona como PDF A4. NO calcula saldos: dibuja las
 * `LineaEstadoCuenta` de `estadoCuentaUnificado` (Adelantos + cuenta forestal,
 * la misma fuente que `/api/adelantos/cuentas/estado`); el saldo final es el
 * último `acumulado` de cada moneda.
 */
const NEGRO = rgb(0, 0, 0);
const GRIS = rgb(0.4, 0.4, 0.4);
const A4: [number, number] = [595.28, 841.89];
const M = 40;
const COL = { fecha: M, concepto: M + 70, cargo: 360, abono: 430, saldo: 500 }; // derecha: x del borde derecho
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
  membrete: Membrete,
  nombre: string,
  movimientos: readonly LineaEstadoCuenta[],
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Estado de cuenta — ${nombre}`);
  doc.setCreator("Buleje");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const set = new Set(font.getCharacterSet());
  const t = (s: string) => sanearParaFuente(s, (cp) => set.has(cp));

  let page: PDFPage = doc.addPage(A4);
  let y = A4[1] - M;
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

  texto(membrete.razonSocial || membrete.nombre || "Estado de cuenta", M, 14, bold);
  y -= 14;
  for (const l of [membrete.ruc ? `RUC ${membrete.ruc}` : "", membrete.direccion ?? "", membrete.telefono ?? ""].filter(Boolean)) {
    texto(l, M, 8.5, font, GRIS);
    y -= 11;
  }
  y -= 8;
  texto("ESTADO DE CUENTA", M, 12, bold);
  y -= 15;
  texto(nombre, M, 11, bold);
  y -= 12;
  texto(`Emitido el ${dia(new Date().toISOString())}`, M, 8.5, font, GRIS);
  y -= 22;

  const cabecera = () => {
    texto("Fecha", COL.fecha, 8.5, bold);
    texto("Concepto", COL.concepto, 8.5, bold);
    derecha("Cargo", COL.cargo, 8.5, bold);
    derecha("Abono", COL.abono, 8.5, bold);
    derecha("Saldo", COL.saldo + 55, 8.5, bold);
    y -= 4;
    page.drawLine({ start: { x: M, y }, end: { x: A4[0] - M, y }, thickness: 0.6, color: NEGRO });
    y -= 12;
  };
  cabecera();

  for (const m of movimientos) {
    if (y < M + 60) {
      page = doc.addPage(A4);
      y = A4[1] - M;
      cabecera();
    }
    const s = simbolo(m.moneda);
    texto(dia(m.fecha), COL.fecha);
    const concepto = m.referencia ? `${m.concepto} ${m.referencia}` : m.concepto;
    page.drawText(recorta(concepto, COL.cargo - COL.concepto - 70, 9), { x: COL.concepto, y, size: 9, font, color: NEGRO });
    if (m.monto >= 0) derecha(`${s} ${num(m.monto)}`, COL.cargo);
    else derecha(`${s} ${num(-m.monto)}`, COL.abono);
    derecha(`${s} ${num(m.acumulado)}`, COL.saldo + 55);
    y -= 13;
  }
  if (movimientos.length === 0) {
    texto("Sin movimientos.", COL.fecha, 9, font, GRIS);
    y -= 13;
  }

  if (y < M + 50) {
    page = doc.addPage(A4);
    y = A4[1] - M;
  }
  y -= 4;
  page.drawLine({ start: { x: M, y }, end: { x: A4[0] - M, y }, thickness: 0.6, color: NEGRO });
  y -= 16;
  for (const [mon, v] of Object.entries(saldoFinal(movimientos))) {
    texto(`Saldo pendiente (${mon})`, COL.concepto, 10, bold);
    derecha(`${simbolo(mon)} ${num(v)}`, COL.saldo + 55, 10, bold);
    y -= 15;
  }
  if (membrete.pie) {
    y -= 10;
    texto(recorta(membrete.pie, A4[0] - 2 * M, 8), M, 8, font, GRIS);
  }
  return doc.save();
}
