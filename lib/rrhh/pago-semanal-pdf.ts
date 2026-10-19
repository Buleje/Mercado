import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { Membrete } from "@/lib/admin/membrete";
import { sanearParaFuente } from "@/lib/forestal/gtf-salida-pdf";

/**
 * El pago semanal de UN colaborador como PDF A4 (ADR-502, Archivo como hub). NO
 * calcula nada: dibuja los números que ya salieron de `GanadoDB.periodo` +
 * `calcularGanado`/`calcularQuedaPorPagar` (la MISMA fuente que
 * `/api/rrhh/ganado` y la hoja semanal). `comoSale` son las líneas de
 * `explicarGanado`; `total`, `aPagar` y `deuda` llegan ya redondeados.
 *
 * **Es un comprobante de REFERENCIA, no planilla electrónica ni boleta** — el
 * mismo tono que obliga `lib/rrhh/ganado.ts`: el pie lo dice tal cual para que
 * el papel no se confunda con una boleta de pago.
 *
 * Fechas date-only: las `FechaKey` ("YYYY-MM-DD") se reformatean cortando el
 * string, nunca `new Date(key)` (que las correría un día según el huso).
 */
const NEGRO = rgb(0, 0, 0);
const GRIS = rgb(0.4, 0.4, 0.4);
const A4: [number, number] = [595.28, 841.89];
const M = 40;

const num = (n: number) => n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** "YYYY-MM-DD" → "DD/MM/YYYY" sin construir Date (sin deriva de huso). */
const diaKey = (key: string) => `${key.slice(8, 10)}/${key.slice(5, 7)}/${key.slice(0, 4)}`;

export interface DatosPagoSemanal {
  membrete: Membrete;
  nombre: string;
  puesto: string | null;
  /** Lunes de la semana (date-only "YYYY-MM-DD"). */
  desde: string;
  /** Domingo de la semana (date-only "YYYY-MM-DD"). */
  hasta: string;
  /** Lo ganado del período, ya calculado (S/). */
  total: number;
  /** Líneas de `explicarGanado(persona)`: «22 días × S/ 60.00 = S/ 1,320.00». */
  comoSale: readonly string[];
  /** Días por estado (`GanadoPersona.conteo`); se muestran los que tienen > 0. */
  conteo?: Readonly<Record<string, number>> | null;
  /** Adelantos de la cuenta vinculada, ya calculados; `null` = sin cuenta. */
  adelantos?: { abiertosPen: number; descontadoPen: number } | null;
  /** `calcularQuedaPorPagar(...).aPagar`; `null` = sin cuenta vinculada. */
  aPagar?: number | null;
  /** `calcularQuedaPorPagar(...).deuda`; sigue debiendo tras descontar lo ganado. */
  deuda?: number | null;
}

const COPY_REFERENCIA =
  "Referencia: no es planilla electronica ni boleta. No calcula CTS, gratificaciones, EsSalud, ONP/AFP ni horas extra.";

const ETIQUETA_ESTADO: Record<string, string> = {
  PRESENTE: "Presente",
  TARDANZA: "Tardanza",
  MEDIO_DIA: "Medio dia",
  FALTA: "Falta",
  PERMISO: "Permiso",
  DESCANSO: "Descanso",
  VACACIONES: "Vacaciones",
};

export async function pdfPagoSemanal(d: DatosPagoSemanal): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Pago semanal — ${d.nombre}`);
  doc.setCreator("Buleje");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const set = new Set(font.getCharacterSet());
  const t = (s: string) => sanearParaFuente(s, (cp) => set.has(cp));

  const page: PDFPage = doc.addPage(A4);
  let y = A4[1] - M;
  const texto = (s: string, x: number, size = 9, f: PDFFont = font, color = NEGRO) => page.drawText(t(s), { x, y, size, font: f, color });
  const derecha = (s: string, xDer: number, size = 9, f: PDFFont = font, color = NEGRO) => {
    const txt = t(s);
    page.drawText(txt, { x: xDer - f.widthOfTextAtSize(txt, size), y, size, font: f, color });
  };
  const recorta = (s: string, max: number, size: number) => {
    let r = t(s);
    while (r.length > 1 && font.widthOfTextAtSize(r, size) > max) r = r.slice(0, -1);
    return r;
  };
  const linea = () => {
    page.drawLine({ start: { x: M, y }, end: { x: A4[0] - M, y }, thickness: 0.6, color: NEGRO });
  };

  const m = d.membrete;
  texto(m.razonSocial || m.nombre || "Pago semanal", M, 14, bold);
  y -= 14;
  for (const l of [m.ruc ? `RUC ${m.ruc}` : "", m.direccion ?? "", m.telefono ?? ""].filter(Boolean)) {
    texto(l, M, 8.5, font, GRIS);
    y -= 11;
  }
  y -= 8;
  texto("COMPROBANTE DE PAGO SEMANAL", M, 12, bold);
  y -= 15;
  texto(d.nombre, M, 11, bold);
  if (d.puesto) {
    y -= 12;
    texto(d.puesto, M, 9, font, GRIS);
  }
  y -= 12;
  texto(`Semana del ${diaKey(d.desde)} al ${diaKey(d.hasta)}`, M, 9, font, GRIS);
  y -= 22;

  // Total ganado del período — el número grande del comprobante.
  linea();
  y -= 16;
  texto("Total ganado (referencia)", M, 11, bold);
  derecha(`S/ ${num(d.total)}`, A4[0] - M, 13, bold);
  y -= 8;
  linea();
  y -= 18;

  // Cómo se compone (explicarGanado): una línea por tramo.
  if (d.comoSale.length > 0) {
    texto("Como sale", M, 9.5, bold);
    y -= 14;
    for (const l of d.comoSale) {
      if (y < M + 120) break;
      texto(recorta(l, A4[0] - 2 * M, 9), M + 10, 9);
      y -= 13;
    }
    y -= 6;
  }

  // Días por estado, sólo los que tienen conteo.
  if (d.conteo) {
    const partes = Object.entries(d.conteo)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => `${ETIQUETA_ESTADO[k] ?? k}: ${v}`);
    if (partes.length > 0) {
      texto("Asistencia", M, 9.5, bold);
      y -= 13;
      texto(recorta(partes.join("   ·   "), A4[0] - 2 * M, 9), M + 10, 9, font, GRIS);
      y -= 18;
    }
  }

  // Adelantos y lo que queda por pagar (sólo si tiene cuenta vinculada).
  if (d.adelantos) {
    linea();
    y -= 16;
    if (d.adelantos.descontadoPen > 0) {
      texto("Ya descontado por planilla en esta semana", M, 9.5);
      derecha(`S/ ${num(d.adelantos.descontadoPen)}`, A4[0] - M, 9.5);
      y -= 14;
    }
    texto("Adelantos abiertos (a hoy)", M, 9.5);
    derecha(`S/ ${num(d.adelantos.abiertosPen)}`, A4[0] - M, 9.5);
    y -= 16;
    if (d.deuda != null && d.deuda > 0) {
      texto("Sigue debiendo tras descontar lo ganado", M, 10.5, bold);
      derecha(`S/ ${num(d.deuda)}`, A4[0] - M, 11, bold);
    } else if (d.aPagar != null) {
      texto("Queda por pagar", M, 10.5, bold);
      derecha(`S/ ${num(d.aPagar)}`, A4[0] - M, 11, bold);
    }
    y -= 8;
    linea();
    y -= 16;
  }

  // Emitido + disclaimer obligatorio (referencia, no boleta).
  if (y < M + 40) y = M + 40;
  y = M + 30;
  texto(`Emitido el ${diaKey(new Date().toISOString().slice(0, 10))}`, M, 8, font, GRIS);
  y -= 12;
  texto(recorta(COPY_REFERENCIA, A4[0] - 2 * M, 7.5), M, 7.5, font, GRIS);
  if (m.pie) {
    y -= 11;
    texto(recorta(m.pie, A4[0] - 2 * M, 7.5), M, 7.5, font, GRIS);
  }
  return doc.save();
}
