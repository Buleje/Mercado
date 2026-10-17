/**
 * gtf-salida-pdf — la guía como PDF EXACTO del talonario (16-10): la página
 * mide lo que mide el talonario, sin márgenes, y cada valor cae en su mm con
 * el perfil de la impresora ya aplicado. Es lo que se manda al monte cuando
 * allá no hay impresión directa: se imprime «a tamaño real» (sin ajustar).
 *
 * Fuera de lo que va al papel no hay NADA (ni encabezados ni pie): sólo los
 * metadatos del PDF dicen qué es («GTF <n°> — imprimir a tamaño real») y
 * `/PrintScaling /None` le pide al visor que no lo agrande ni lo achique.
 *
 * Letra: Courier negrita de las 14 estándar (0,6 em por carácter, la misma
 * medida que la pantalla). Lo que la fuente no tiene se escribe sin tilde y,
 * si tampoco, como «?»: un carácter por carácter, así la X calculada no se corre.
 * PURO del lado del servidor: sin DOM.
 */

import { PDFDocument, PrintScaling, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { DisposicionHoja } from "./gtf-matricial-disposicion";
import { CRUZ_MM, mmPorCaracter } from "./gtf-matricial-disposicion";
import { aplicarX, aplicarY, escalaPct, type Transformacion } from "./gtf-matricial-perfiles";
import { xInicio, type RenglonSalida } from "./gtf-salida-geometria";

export const PT_POR_MM = 72 / 25.4;
const NEGRO = rgb(0, 0, 0);

type Hoja = Pick<DisposicionHoja, "anchoMm" | "altoMm">;

/** Lo que la fuente no sabe dibujar: sin tilde, o «?». Siempre UN carácter por carácter. */
export function sanearParaFuente(texto: string, tiene: (cp: number) => boolean): string {
  let out = "";
  /* NFC primero: una tilde suelta (U+0301) no es un carácter que la fuente dibuje: saldría «?». */
  for (const ch of texto.normalize("NFC")) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp < 0x20 || (cp >= 0x7f && cp <= 0x9f)) {
      out += " ";
      continue;
    }
    if (tiene(cp)) {
      out += ch;
      continue;
    }
    const base = ch.normalize("NFD").replace(/[̀-ͯ]/g, "");
    const b = base.codePointAt(0) ?? 0;
    out += base.length === 1 && tiene(b) ? base : "?";
  }
  return out;
}

async function nuevoDocumento(titulo: string): Promise<{ doc: PDFDocument; font: PDFFont; tiene: (cp: number) => boolean }> {
  const doc = await PDFDocument.create({ updateMetadata: false });
  doc.setTitle(titulo, { showInWindowTitleBar: true });
  doc.setSubject("Imprimir a tamaño real (100 %, sin ajustar a la página) en el talonario de la matricial.");
  doc.setCreator("Buleje · Libro TH");
  doc.setProducer("Buleje");
  doc.setCreationDate(new Date());
  doc.catalog.getOrCreateViewerPreferences().setPrintScaling(PrintScaling.None);
  const font = await doc.embedFont(StandardFonts.CourierBold);
  const set = new Set(font.getCharacterSet());
  return { doc, font, tiene: (cp) => set.has(cp) };
}

const nuevaPagina = (doc: PDFDocument, hoja: Hoja): PDFPage => doc.addPage([hoja.anchoMm * PT_POR_MM, hoja.altoMm * PT_POR_MM]);

function dibujarRenglones(page: PDFPage, hoja: Hoja, renglones: RenglonSalida[], font: PDFFont, tiene: (cp: number) => boolean): void {
  for (const r of renglones) {
    const texto = sanearParaFuente(r.texto, tiene);
    if (!texto.trim()) continue;
    const xMm = xInicio(r, mmPorCaracter(r.letraPt));
    page.drawText(texto, { x: xMm * PT_POR_MM, y: (hoja.altoMm - r.baseMm) * PT_POR_MM, size: r.letraPt, font, color: NEGRO });
  }
}

/** El PDF de la guía (o de su lista): una página del talonario por hoja. */
export async function pdfTalonario(hoja: Hoja, paginas: RenglonSalida[][], titulo: string): Promise<Uint8Array> {
  const { doc, font, tiene } = await nuevoDocumento(titulo);
  for (const renglones of paginas.length ? paginas : [[]]) dibujarRenglones(nuevaPagina(doc, hoja), hoja, renglones, font, tiene);
  return doc.save({ useObjectStreams: false });
}

const f = (v: number): string => String(Math.round(v * 100) / 100).replace(".", ",");

/**
 * La hoja de PRUEBA en PDF, igual a la del navegador (`htmlPruebaTalonario`):
 * cuadrícula de 10 mm (más gruesa cada 50), una cruz a 10 mm de cada esquina y
 * en el centro, y el perfil usado; todo con el perfil aplicado. Con
 * `renglones`, encima van los valores de la guía.
 */
export async function pdfPrueba(hoja: Hoja, t: Transformacion, titulo: string, renglones: RenglonSalida[] = []): Promise<Uint8Array> {
  const { doc, font, tiene } = await nuevoDocumento(titulo);
  const page = nuevaPagina(doc, hoja);
  const W = hoja.anchoMm;
  const H = hoja.altoMm;
  const k = PT_POR_MM;
  const punto = (x: number, y: number) => ({ x: aplicarX(t, x) * k, y: (H - aplicarY(t, y)) * k });
  const linea = (x1: number, y1: number, x2: number, y2: number, mm: number) =>
    page.drawLine({ start: punto(x1, y1), end: punto(x2, y2), thickness: mm * k, color: NEGRO });
  const rotulo = (s: string, x: number, y: number, pt: number) => page.drawText(sanearParaFuente(s, tiene), { ...punto(x, y), size: pt, font, color: NEGRO });
  for (let x = 10; x < W; x += 10) {
    linea(x, 0, x, H, x % 50 === 0 ? 0.3 : 0.12);
    rotulo(String(x), x + 0.6, 3.2, 6);
  }
  for (let y = 10; y < H; y += 10) {
    linea(0, y, W, y, y % 50 === 0 ? 0.3 : 0.12);
    rotulo(String(y), 0.6, y - 0.6, 6);
  }
  const cruz = (cx: number, cy: number) => {
    linea(cx - 6, cy, cx + 6, cy, 0.35);
    linea(cx, cy - 6, cx, cy + 6, 0.35);
    const c = punto(cx, cy);
    page.drawCircle({ ...c, size: 1.5 * k, borderWidth: 0.35 * k, borderColor: NEGRO });
  };
  for (const [cx, cy] of [[CRUZ_MM, CRUZ_MM], [W - CRUZ_MM, CRUZ_MM], [CRUZ_MM, H - CRUZ_MM], [W - CRUZ_MM, H - CRUZ_MM], [W / 2, H / 2]]) cruz(cx, cy);
  const centrado = (s: string, y: number, pt: number) => {
    const ancho = font.widthOfTextAtSize(sanearParaFuente(s, tiene), pt) / k;
    rotulo(s, W / 2 - ancho / 2, y, pt);
  };
  centrado(`PRUEBA DE ALINEACIÓN · ${f(W)} × ${f(H)} mm`, H / 2 - 9, 9.5);
  centrado(`Del borde del papel al centro de cada cruz debe dar ${CRUZ_MM} mm.`, H / 2 + 12, 8);
  centrado(`Impresora: ${t.perfil.nombre} · corrimiento X ${f(t.dx)} mm · Y ${f(t.dy)} mm · escala X ${escalaPct(t.sx)} · Y ${escalaPct(t.sy)}`, H / 2 + 16, 8);
  dibujarRenglones(page, hoja, renglones, font, tiene);
  return doc.save({ useObjectStreams: false });
}
