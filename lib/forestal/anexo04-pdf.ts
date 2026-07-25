/**
 * anexo04-pdf.ts — dibuja el ANEXO N° 04 ("Lista de productos transformados",
 * SERFOR) en PDF con jsPDF, celda por celda, usando la MISMA geometría que el
 * preview HTML (`geometriaHoja` en anexo04-serfor.ts). Client-only: jsPDF entra
 * por import dinámico para no engordar el bundle inicial.
 *
 * No usa autotable: el anexo son 4 tablas en paralelo con altos de fila fijos y
 * filas de relleno; dibujarlo a mano es lo único que garantiza que el papel
 * salga igual al oficial (y que el preview lo espeje).
 */
import type { jsPDF } from "jspdf";
import type { PiezaCubicada } from "./cubicacion";
import {
  construirAnexo04, geometriaHoja, fmtAnexo, fmtMedida, notaUnidad,
  BLOQUES_POR_HOJA, HEAD_COLS, PAGINA, TEXTO_LEGAL, ETIQUETAS_FIRMA,
  type Anexo04, type DatosAnexo04, type GeoHoja, type HojaAnexo04,
} from "./anexo04-serfor";

const VERDE: [number, number, number] = [226, 239, 217];
const LINEA = 0.4;

/** Texto centrado verticalmente en una celda de alto `h`. */
function celdaTexto(doc: jsPDF, s: string, x: number, y: number, w: number, h: number, size: number, align: "left" | "center" | "right" = "center", bold = false) {
  if (!s) return;
  doc.setFont("helvetica", bold ? "bold" : "normal");
  doc.setFontSize(size);
  const px = align === "center" ? x + w / 2 : align === "right" ? x + w - 2 : x + 2;
  doc.text(s, px, y + h / 2 + size * 0.35, { align });
}

/** Texto que se achica (hasta 4pt) y si aún no entra se corta con "…". */
function textoAjustado(doc: jsPDF, s: string, x: number, y: number, maxW: number, size: number, bold = false) {
  doc.setFont("helvetica", bold ? "bold" : "normal");
  let f = size;
  while (f > 4 && doc.getStringUnitWidth(s) * f > maxW) f -= 0.25;
  doc.setFontSize(f);
  let txt = s;
  while (txt.length > 1 && doc.getStringUnitWidth(txt) * f > maxW) txt = txt.slice(0, -2) + "…";
  doc.text(txt, x, y);
}

/**
 * Dibuja una imagen (logo, firma o sello) CENTRADA y encajada en su caja, sin
 * deformarla: manda la dimensión que primero toca el borde. Un dataURL inválido
 * no rompe la hoja — sale sin la imagen.
 */
function imagenEnCaja(doc: jsPDF, src: string | undefined, aspect: number | undefined, caja: { x: number; y: number; w: number; h: number }) {
  if (!src) return;
  const asp = aspect && aspect > 0 ? aspect : 1;
  const w = Math.min(caja.w, caja.h * asp);
  const h = w / asp;
  try {
    doc.addImage(src, formatoImagen(src), caja.x + (caja.w - w) / 2, caja.y + (caja.h - h) / 2, w, h);
  } catch { /* dataURL inválido → se omite la imagen, la hoja sigue siendo válida */ }
}

/** Formato que espera jsPDF.addImage, leído del propio dataURL. */
function formatoImagen(dataUrl: string): "PNG" | "JPEG" | "WEBP" {
  const mime = dataUrl.slice(5, dataUrl.indexOf(";"));
  return mime === "image/jpeg" ? "JPEG" : mime === "image/webp" ? "WEBP" : "PNG";
}

function lineaPunteada(doc: jsPDF, x1: number, y: number, x2: number) {
  doc.setLineDashPattern([1, 1], 0);
  doc.line(x1, y, x2, y);
  doc.setLineDashPattern([], 0);
}

/** Cabecera: banner del anexo, instrucciones y los datos (1)(2)(3). */
function dibujarCabecera(doc: jsPDF, g: GeoHoja, datos: DatosAnexo04, anexo: Anexo04) {
  const m = PAGINA.margen;
  doc.setDrawColor(0); doc.setLineWidth(LINEA);

  doc.setFillColor(...VERDE);
  doc.rect(m, g.yBanner, g.contentW, g.hBanner, "FD");
  celdaTexto(doc, "ANEXO N° 04", m, g.yBanner - 2, g.contentW, g.hBanner / 2, 8, "center", true);
  celdaTexto(doc, '"LISTA DE PRODUCTOS TRANSFORMADOS"', m, g.yBanner + g.hBanner / 2 - 2, g.contentW, g.hBanner / 2, 9, "center", true);

  doc.setFillColor(...VERDE);
  doc.rect(m, g.yInstr, g.contentW, g.hInstr, "FD");
  celdaTexto(doc, "Para el llenado del presente Anexo se utilizarán las instrucciones adjuntas.", m, g.yInstr, g.contentW, g.hInstr, 5.5, "left");

  // Logo (izquierda) + emisor + título (centro) + datos numerados (derecha).
  const conLogo = Boolean(datos.logo);
  imagenEnCaja(doc, datos.logo, datos.logoAspect, g.logoBox);
  if (datos.empresa) textoAjustado(doc, datos.empresa.toUpperCase(), g.xEmpresa(conLogo), g.yInfo + 20, g.wEmpresa(conLogo), 8.5, true);
  celdaTexto(doc, "LISTA DE PRODUCTOS TRANSFORMADOS", m + 150, g.yInfo, g.contentW - 340, 24, 8.5, "center", true);

  const xr = m + g.contentW - 200;
  const campo = (i: number, label: string, valor: string) => {
    const y = g.yInfo + 20 + i * 15;
    doc.setFont("helvetica", "bold"); doc.setFontSize(6.5); doc.setTextColor(0);
    doc.text(label, xr, y);
    const lw = doc.getStringUnitWidth(label) * 6.5;
    doc.setFont("helvetica", "normal");
    doc.text(valor || "…………………………", xr + lw + 4, y);
  };
  campo(0, "(1) N°:", datos.numero);
  campo(1, "(2) GTF N°:", datos.gtf);
  campo(2, "(3) VOLUMEN TOTAL:", `${fmtAnexo(anexo.totalM3)} m³`);
}

/** Un bloque: cabecera especie/tipo, grilla de 6 columnas y subtotal (11). */
function dibujarBloque(doc: jsPDF, g: GeoHoja, i: number, hoja: HojaAnexo04) {
  const b = hoja.bloques[i];
  const x0 = g.xBloque(i);

  // Los rótulos van SIEMPRE, aunque el bloque esté vacío: en el formato oficial
  // el bloque sin usar se imprime igual, para llenarlo a mano si hace falta.
  textoAjustado(doc, `(4) Especie:  ${b?.especie ?? ""}`, x0 + 2, g.yBloqueHead + 8, g.bloqueW - 4, 6, true);
  textoAjustado(doc, `(5) Tipo de producto: ${b ? `${b.tipo}${b.continuacion ? " (cont.)" : ""}` : ""}`, x0 + 2, g.yBloqueHead + 17, g.bloqueW - 4, 6, false);

  // Encabezado de columnas
  HEAD_COLS.forEach((h, j) => {
    const x = g.xCol(i, j), w = g.cols[j];
    doc.rect(x, g.yTblHead, w, g.hTblHead);
    celdaTexto(doc, h, x, g.yTblHead, w, g.hTblHead, 4.6, "center", true);
  });

  // Filas (las que no tienen pieza van vacías con V = 0,000, como el oficial)
  for (let f = 0; f < hoja.filasPorBloque; f++) {
    const y = g.yFilas + f * g.hFila;
    const fila = b?.filas[f];
    const celdas = [
      String(f + 1),
      fila ? String(fila.cantidad) : "",
      fila ? fmtMedida(fila.e) : "",
      fila ? fmtMedida(fila.a) : "",
      fila ? fmtMedida(fila.l) : "",
      fmtAnexo(fila ? fila.v : 0),
    ];
    celdas.forEach((c, j) => {
      const x = g.xCol(i, j), w = g.cols[j];
      doc.rect(x, y, w, g.hFila);
      celdaTexto(doc, c, x, y, w, g.hFila, 5.2, j === 5 ? "right" : "center", false);
    });
  }

  // (11) SUB TOTAL — etiqueta a la izquierda, valor en su propio recuadro.
  const yS = g.ySub;
  const wLabel = g.cols.slice(0, 5).reduce((a, c) => a + c, 0);
  celdaTexto(doc, "(11) SUB TOTAL", x0, yS, wLabel, g.hSub, 5.4, "right", true);
  const xV = g.xCol(i, 5);
  doc.setLineWidth(0.6);
  doc.rect(xV, yS, g.cols[5], g.hSub);
  doc.setLineWidth(LINEA);
  celdaTexto(doc, fmtAnexo(b?.subtotal ?? 0), xV, yS, g.cols[5], g.hSub, 5.6, "right", true);
}

/** Pie: (12) observaciones, firmas (13)-(16) y el texto legal de la GTF. */
function dibujarPie(doc: jsPDF, g: GeoHoja, datos: DatosAnexo04, anexo: Anexo04, hoja: number, hojas: number) {
  const m = PAGINA.margen;
  doc.rect(m, g.yObs, g.contentW, g.hObs);
  doc.setFont("helvetica", "bold"); doc.setFontSize(6); doc.setTextColor(0);
  doc.text("(12) OBSERVACIONES:", m + 4, g.yObs + 12);
  if (datos.observaciones) {
    doc.setFont("helvetica", "normal"); doc.setFontSize(6);
    doc.text(doc.splitTextToSize(datos.observaciones, g.contentW * 0.52).slice(0, 8), m + 4, g.yObs + 24);
  }

  const xF2 = m + g.contentW - 8;
  const xF1 = xF2 - 210;
  // Sello y firma escaneada van sobre la línea (13), antes de las etiquetas.
  imagenEnCaja(doc, datos.sello, datos.selloAspect, g.selloBox);
  imagenEnCaja(doc, datos.firma, datos.firmaAspect, g.firmaBox);

  const valores = ["", datos.firmante, datos.documento, datos.cargo];
  g.yFirmas.forEach((y, i) => {
    lineaPunteada(doc, xF1, y, xF2);
    if (valores[i]) {
      doc.setFont("helvetica", "normal"); doc.setFontSize(6.5);
      doc.text(valores[i], xF2, y - 3, { align: "right" });
    }
    doc.setFont("helvetica", "bold"); doc.setFontSize(5.6);
    doc.text(ETIQUETAS_FIRMA[i], xF2, y + 8, { align: "right" });
  });

  doc.setFont("helvetica", "normal"); doc.setFontSize(5.2); doc.setTextColor(60);
  doc.text(TEXTO_LEGAL[0], m, g.yLegal);
  doc.text(doc.splitTextToSize(TEXTO_LEGAL[1], g.contentW), m, g.yLegal + 8);
  doc.setTextColor(120);
  doc.text(notaUnidad(anexo.unidadV), m, g.yLegal + 24);
  doc.text(`Hoja ${hoja} de ${hojas}`, m + g.contentW, g.yLegal + 24, { align: "right" });
  doc.setTextColor(0);
}

function dibujarHoja(doc: jsPDF, hoja: HojaAnexo04, datos: DatosAnexo04, anexo: Anexo04, nro: number, total: number) {
  const g = geometriaHoja(hoja.filasPorBloque);
  doc.setDrawColor(0); doc.setLineWidth(LINEA); doc.setTextColor(0);
  dibujarCabecera(doc, g, datos, anexo);
  for (let i = 0; i < BLOQUES_POR_HOJA; i++) {
    // En modo compacto no se dibujan grillas vacías de relleno.
    if (!hoja.bloques[i] && datos.modo === "compacto") continue;
    dibujarBloque(doc, g, i, hoja);
  }
  dibujarPie(doc, g, datos, anexo, nro, total);
}

/** Nombre del archivo: identificable por GTF si la cargaron. */
const nombreArchivo = (datos: DatosAnexo04) =>
  `anexo04-productos-transformados${datos.gtf ? `-${datos.gtf.replace(/[^\w-]+/g, "")}` : ""}-${new Date().toISOString().slice(0, 10)}.pdf`;

/** Construye el documento (compartido por descarga y cualquier otra salida). */
async function construirDoc(rows: PiezaCubicada[], datos: DatosAnexo04, opts: { especieGlobal?: string } = {}) {
  const { jsPDF: JsPDF } = await import("jspdf");
  const doc = new JsPDF({ unit: "pt", format: "a4" });
  const anexo = construirAnexo04(rows, datos, opts);
  anexo.hojas.forEach((hoja, i) => {
    if (i > 0) doc.addPage();
    dibujarHoja(doc, hoja, datos, anexo, i + 1, anexo.hojas.length);
  });
  return doc;
}

/** Descarga el ANEXO N° 04 del lote cubicado. */
export async function exportarAnexo04PDF(rows: PiezaCubicada[], datos: DatosAnexo04, opts: { especieGlobal?: string } = {}): Promise<void> {
  const doc = await construirDoc(rows, datos, opts);
  doc.save(nombreArchivo(datos));
}

/** Abre el PDF en una pestaña nueva (para imprimir desde el visor del navegador). */
export async function abrirAnexo04PDF(rows: PiezaCubicada[], datos: DatosAnexo04, opts: { especieGlobal?: string } = {}): Promise<void> {
  const doc = await construirDoc(rows, datos, opts);
  const url = URL.createObjectURL(doc.output("blob"));
  window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
