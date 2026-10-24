/**
 * PDF de etiquetas de precio con jsPDF (ya lo usan fotocheck y los reportes).
 *
 * Tres formatos (`precio.ts`): A4 3×8, A4 3×10 y rollo térmico 50×25 mm.
 * Todo en negro puro: la térmica no imprime gris y la pistola no lee barras
 * grises. Las líneas de corte (gris claro, punteadas) sólo van en A4 y se
 * pueden apagar si la hoja ya viene troquelada.
 *
 * Disposición de cada etiqueta:
 *   ┌────────────────────────────────┐
 *   │ NOMBRE DEL PRODUCTO (2 líneas) │
 *   │ S/ 14.00 (tachado)  ║│║║│║║│║║ │
 *   │ S/ 12.50            ║│║║│║║│║║ │
 *   │ el kg            7 751234 567890│
 *   └────────────────────────────────┘
 * En el rollo, un Code 128 que no entra al costado con barras de puntos
 * enteros va abajo, a todo el ancho, y el precio queda en una fila arriba.
 *
 * jsPDF se importa dinámico: no entra al bundle del panel hasta que se descarga.
 */
import type { jsPDF } from "jspdf";
import { esGuardaEan13, tramosDeBarras, type CodigoDeBarras } from "./codigo-barras";
import {
  diaLima,
  etiquetasPorHoja,
  infoFormatoPrecio,
  medidaDeBarras,
  posicionEnHoja,
  type EtiquetaPrecio,
  type FormatoEtiquetaPrecio,
  type FormatoEtiquetaPrecioInfo,
} from "./precio";

/** 1 punto tipográfico en mm. */
const PT_MM = 25.4 / 72;
/** Alto de las mayúsculas de Helvetica respecto del cuerpo. */
const ALTO_CAP = 0.72;

export interface OpcionesPdfEtiquetas {
  /** Líneas punteadas de corte (sólo A4). Por defecto, sí. */
  guias?: boolean;
}

/** Las líneas del nombre que entran; la última se corta con «…» si sobra texto. */
function lineasDeNombre(doc: jsPDF, nombre: string, ancho: number, maximo: number): string[] {
  const todas = doc.splitTextToSize(nombre, ancho) as string[];
  if (todas.length <= maximo) return todas;
  const lineas = todas.slice(0, maximo);
  let ultima = `${lineas[maximo - 1]!.trimEnd()}…`;
  while (ultima.length > 2 && doc.getTextWidth(ultima) > ancho) ultima = `${ultima.slice(0, -2).trimEnd()}…`;
  lineas[maximo - 1] = ultima;
  return lineas;
}

/**
 * Las barras desde la esquina superior izquierda de su caja (zonas mudas incluidas).
 * En EAN-13 las guardas bajan hasta la mitad de los dígitos y los dígitos van
 * en 3 grupos (el primero, afuera a la izquierda), como en el envase.
 */
export function dibujarBarras(doc: jsPDF, codigo: CodigoDeBarras, x: number, y: number, modulo: number, alto: number, digitosPt: number): void {
  const altoDig = digitosPt * PT_MM * ALTO_CAP;
  const x0 = x + codigo.zonaMudaIzq * modulo;
  const xDe = (m: number) => x0 + m * modulo;
  doc.setFillColor(0, 0, 0);
  const ean = codigo.tipo === "ean13";
  for (const [inicio, ancho] of tramosDeBarras(codigo.modulos)) {
    const largo = ean && esGuardaEan13(inicio) ? alto + altoDig * 0.6 : alto;
    doc.rect(xDe(inicio), y, ancho * modulo, largo, "F");
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(digitosPt);
  doc.setTextColor(0, 0, 0);
  const base = y + alto + altoDig + 0.4;
  if (ean) {
    doc.text(codigo.valor[0]!, xDe(-1.5), base, { align: "right" });
    doc.text(codigo.valor.slice(1, 7), xDe(24), base, { align: "center" });
    doc.text(codigo.valor.slice(7), xDe(71), base, { align: "center" });
  } else {
    doc.text(codigo.valor, xDe(codigo.modulos.length / 2), base, { align: "center" });
  }
}

/** Mínimo de alto que se le deja a la fila del precio cuando las barras van abajo. */
const PRECIO_FILA_MIN_MM = 4;

/** En la térmica, la caja de las barras arranca en un punto entero (si no, cada barra cae entre dos puntos). */
const alinear = (x: number, punto: number | null): number => (punto ? Math.round(x / punto) * punto : x);

/** Achica el monto hasta que entre en `ancho` × `altoMax` (mm). */
function ajustarPrecio(doc: jsPDF, e: EtiquetaPrecio, f: FormatoEtiquetaPrecioInfo, ancho: number, altoMax: number) {
  let precioPt = f.precioPt;
  let monedaPt = f.monedaPt;
  const medir = () => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(monedaPt);
    const wMoneda = doc.getTextWidth(e.moneda);
    doc.setFontSize(precioPt);
    return wMoneda + 0.8 + doc.getTextWidth(e.precioTexto);
  };
  while (precioPt > 9 && (medir() > ancho || precioPt * PT_MM * ALTO_CAP > altoMax)) {
    precioPt -= 0.5;
    monedaPt = Math.min(f.monedaPt, precioPt * 0.45);
  }
  return { precioPt, monedaPt, anchoMm: medir() };
}

function escribirPrecio(doc: jsPDF, e: EtiquetaPrecio, x: number, base: number, precioPt: number, monedaPt: number): void {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(monedaPt);
  doc.text(e.moneda, x, base);
  const wMoneda = doc.getTextWidth(e.moneda);
  doc.setFontSize(precioPt);
  doc.text(e.precioTexto, x + wMoneda + 0.8, base);
}

function escribirAnterior(doc: jsPDF, texto: string, x: number, base: number, pt: number): void {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(pt);
  doc.text(texto, x, base);
  const w = doc.getTextWidth(texto);
  doc.setLineWidth(0.25);
  const yRaya = base - pt * PT_MM * ALTO_CAP * 0.45;
  doc.line(x - 0.3, yRaya, x + w + 0.3, yRaya);
}

/** Una etiqueta con su esquina superior izquierda en (x0, y0). */
export function dibujarEtiqueta(doc: jsPDF, e: EtiquetaPrecio, x0: number, y0: number, f: FormatoEtiquetaPrecioInfo, guias: boolean): void {
  const { anchoMm: ancho, altoMm: alto, padMm: pad } = f;
  if (guias) {
    doc.setDrawColor(190, 190, 190);
    doc.setLineWidth(0.1);
    doc.setLineDashPattern([1, 1], 0);
    doc.rect(x0, y0, ancho, alto, "S");
    doc.setLineDashPattern([], 0);
  }
  doc.setTextColor(0, 0, 0);
  doc.setDrawColor(0, 0, 0);
  const util = ancho - 2 * pad;

  // Nombre: arriba, en negrita, hasta N líneas.
  doc.setFont("helvetica", "bold");
  doc.setFontSize(f.nombrePt);
  const lineas = lineasDeNombre(doc, e.nombre, util, f.nombreLineas);
  const interlinea = f.nombrePt * PT_MM * 1.12;
  lineas.forEach((l, i) => doc.text(l, x0 + pad, y0 + pad + f.nombrePt * PT_MM * ALTO_CAP + i * interlinea));
  const zonaArriba = y0 + pad + f.nombrePt * PT_MM * ALTO_CAP + (Math.max(lineas.length, 1) - 1) * interlinea + 1.6;
  const zonaAbajo = y0 + alto - pad;
  const zonaAlto = zonaAbajo - zonaArriba;

  const m = e.codigo ? medidaDeBarras(e.codigo, f.id) : null;
  const altoDig = f.digitosPt * PT_MM * ALTO_CAP + 0.4;
  const altoUnidad = f.unidadPt * PT_MM * ALTO_CAP;

  if (e.codigo && m?.abajo) {
    // Código largo en el rollo: el precio en una fila y las barras abajo, a todo el ancho.
    const altoBarras = Math.max(Math.min(f.barrasAltoMm, zonaAlto - altoDig - PRECIO_FILA_MIN_MM - 1), 4);
    const yBarras = zonaAbajo - altoDig - altoBarras;
    dibujarBarras(doc, e.codigo, alinear(x0 + (ancho - m.anchoMm) / 2, f.puntoMm), yBarras, m.moduloMm, altoBarras, f.digitosPt);
    const base = yBarras - 1.2;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(f.unidadPt);
    let lateral = doc.getTextWidth(e.unidadTexto);
    if (e.precioAnteriorTexto) {
      doc.setFontSize(f.anteriorPt);
      lateral = Math.max(lateral, doc.getTextWidth(e.precioAnteriorTexto));
    }
    const p = ajustarPrecio(doc, e, f, util - lateral - 1.5, base - zonaArriba);
    escribirPrecio(doc, e, x0 + pad, base, p.precioPt, p.monedaPt);
    const xLateral = x0 + pad + p.anchoMm + 1.5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(f.unidadPt);
    doc.text(e.unidadTexto, xLateral, base);
    if (e.precioAnteriorTexto) escribirAnterior(doc, e.precioAnteriorTexto, xLateral, base - altoUnidad - 1.2, f.anteriorPt);
    return;
  }

  // Lo de siempre: barras a la derecha y precio a la izquierda, los dos centrados en la zona.
  let anchoBarras = 0;
  if (e.codigo && m) {
    anchoBarras = m.anchoMm;
    const altoBarras = Math.max(Math.min(f.barrasAltoMm, zonaAlto - altoDig), 4);
    const yBarras = zonaArriba + (zonaAlto - altoBarras - altoDig) / 2;
    dibujarBarras(doc, e.codigo, alinear(x0 + ancho - pad - m.anchoMm, f.puntoMm), yBarras, m.moduloMm, altoBarras, f.digitosPt);
  }
  const altoAnterior = e.precioAnteriorTexto ? f.anteriorPt * PT_MM * ALTO_CAP + 2.2 : 0;
  const p = ajustarPrecio(doc, e, f, util - (anchoBarras > 0 ? anchoBarras + 1.5 : 0), zonaAlto - altoAnterior - 1.4 - altoUnidad);
  const altoBloque = altoAnterior + p.precioPt * PT_MM * ALTO_CAP + 1.4 + altoUnidad;
  const yBloque = zonaArriba + (zonaAlto - altoBloque) / 2;
  if (e.precioAnteriorTexto) escribirAnterior(doc, e.precioAnteriorTexto, x0 + pad, yBloque + f.anteriorPt * PT_MM * ALTO_CAP, f.anteriorPt);
  const basePrecio = yBloque + altoAnterior + p.precioPt * PT_MM * ALTO_CAP;
  escribirPrecio(doc, e, x0 + pad, basePrecio, p.precioPt, p.monedaPt);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(f.unidadPt);
  doc.text(e.unidadTexto, x0 + pad, basePrecio + 1.4 + altoUnidad);
}

/** El PDF completo: una página por hoja A4 (o por etiqueta del rollo). */
export async function pdfDeEtiquetas(
  etiquetas: readonly EtiquetaPrecio[],
  formato: FormatoEtiquetaPrecio,
  opciones: OpcionesPdfEtiquetas = {},
): Promise<jsPDF> {
  const { jsPDF: JsPDF } = await import("jspdf");
  const f = infoFormatoPrecio(formato);
  const orientacion = f.hojaAnchoMm > f.hojaAltoMm ? "landscape" : "portrait";
  const doc = new JsPDF({ unit: "mm", format: [f.hojaAnchoMm, f.hojaAltoMm], orientation: orientacion, compress: true });
  doc.setProperties({ title: "Etiquetas de precio", creator: "Buleje" });
  const porHoja = etiquetasPorHoja(formato);
  const guias = (opciones.guias ?? true) && !f.rollo;
  etiquetas.forEach((e, i) => {
    if (i > 0 && i % porHoja === 0) doc.addPage([f.hojaAnchoMm, f.hojaAltoMm], orientacion);
    const { x, y } = posicionEnHoja(i, formato);
    dibujarEtiqueta(doc, e, x, y, f, guias);
  });
  return doc;
}

export function nombreArchivoEtiquetas(formato: FormatoEtiquetaPrecio, ahora: Date): string {
  return `etiquetas-precio-${diaLima(ahora)}-${formato}.pdf`;
}

/** Arma el PDF y lo descarga (navegador). */
export async function descargarEtiquetasPdf(
  etiquetas: readonly EtiquetaPrecio[],
  formato: FormatoEtiquetaPrecio,
  opciones: OpcionesPdfEtiquetas = {},
): Promise<void> {
  const doc = await pdfDeEtiquetas(etiquetas, formato, opciones);
  doc.save(nombreArchivoEtiquetas(formato, new Date()));
}
