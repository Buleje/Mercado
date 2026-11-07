import "server-only";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { fechaDelDocumento, type MembreteDocumento } from "@/lib/documentos/membrete-pdf";
import { crearMembrete, dibujarMembrete, dibujarPies, limiteInferior, margenPdfLib, type LogoServidor } from "@/lib/documentos/membrete-pdflib";

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
const M = margenPdfLib();

const num = (n: number) => n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** "YYYY-MM-DD" → "DD/MM/YYYY" sin construir Date (sin deriva de huso). */
const diaKey = (key: string) => `${key.slice(8, 10)}/${key.slice(5, 7)}/${key.slice(0, 4)}`;

export interface DatosPagoSemanal {
  membrete: MembreteDocumento;
  /** El logo en PNG (`MembreteDB.logoPng`); sin él, sale el monograma. */
  logo?: LogoServidor | null;
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
  /**
   * Adelantos de la cuenta vinculada, ya calculados; `null` = sin cuenta.
   * `planillaPen` se resta de lo ganado; `cuentaCorrientePen` va aparte
   * (decisión 7 de `lib/rrhh/ganado.ts`).
   */
  adelantos?: { planillaPen: number; cuentaCorrientePen: number; descontadoPen: number } | null;
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
  const mb = await crearMembrete(doc, d.membrete, d.logo, {
    tipo: "Comprobante de pago semanal",
    fecha: fechaDelDocumento(new Date().toISOString()),
    extra: `Semana del ${diaKey(d.desde)} al ${diaKey(d.hasta)}`,
  });
  doc.setTitle(`Pago semanal — ${d.nombre}`);
  doc.setCreator(mb.datos.titulo);
  const { font, bold, t } = mb;

  const page: PDFPage = doc.addPage(A4);
  let y = dibujarMembrete(mb, page);
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

  texto(d.nombre, M, 12, bold);
  if (d.puesto) {
    y -= 12;
    texto(d.puesto, M, 9, font, GRIS);
  }
  y -= 20;

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
      if (y < limiteInferior() + 80) break;
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
    texto("Adelantos por planilla abiertos (a hoy)", M, 9.5);
    derecha(`S/ ${num(d.adelantos.planillaPen)}`, A4[0] - M, 9.5);
    y -= 16;
    if (d.deuda != null && d.deuda > 0) {
      texto("Sigue debiendo tras descontar lo ganado", M, 10.5, bold);
      derecha(`S/ ${num(d.deuda)}`, A4[0] - M, 11, bold);
    } else if (d.aPagar != null) {
      texto("Queda por pagar", M, 10.5, bold);
      derecha(`S/ ${num(d.aPagar)}`, A4[0] - M, 11, bold);
    }
    if (d.adelantos.cuentaCorrientePen > 0) {
      y -= 16;
      texto("Cuenta corriente aparte (no se descuenta del sueldo)", M, 9.5, font, GRIS);
      derecha(`debe S/ ${num(d.adelantos.cuentaCorrientePen)}`, A4[0] - M, 9.5);
    }
    y -= 8;
    linea();
    y -= 16;
  }

  // Disclaimer obligatorio (referencia, no boleta), sobre el pie del membrete.
  y = Math.max(y, limiteInferior() + 20);
  texto(recorta(COPY_REFERENCIA, A4[0] - 2 * M, 7.5), M, 7.5, font, GRIS);
  dibujarPies(mb);
  return doc.save();
}
