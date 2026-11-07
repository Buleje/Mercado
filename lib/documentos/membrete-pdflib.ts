import "server-only";
import { rgb, StandardFonts, type PDFDocument, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { sanearParaFuente } from "@/lib/forestal/gtf-salida-pdf";
import {
  datosDelMembrete,
  emitidoEnLima,
  PALETA,
  textoPagina,
  type DatosMembrete,
  type DocumentoMembrete,
  type MembreteDocumento,
  type OpcionesMembrete,
  type Rgb,
} from "@/lib/documentos/membrete-pdf";

/**
 * lib/documentos/membrete-pdflib.ts — el MISMO membrete de `membrete-pdf.ts`
 * (jsPDF, navegador) para los PDF que se arman en el servidor con pdf-lib
 * (Brandon 23-10: «cualquier documento de la empresa en cualquier pestaña saldrá
 * con el logo y nombre en el título»).
 *
 * Mismo diseño: logo PNG (de `MembreteDB.logoPng`) o monograma con la inicial;
 * nombre como título; RUC · dirección · contacto; a la derecha tipo + código +
 * fecha; pie en cada página con «Emitido el … (hora de Lima)» y «Página X de Y».
 * Las medidas están en mm (como en jsPDF) y se convierten a puntos acá.
 *
 * Uso: `const mb = await crearMembrete(doc, membrete, logo, { tipo, codigo, fecha })`
 * (embebe las fuentes y el logo UNA vez) → `let y = dibujarMembrete(mb, page)`
 * (devuelve el `y` de pdf-lib, origen abajo, donde empieza el cuerpo) → hojas
 * siguientes con `dibujarMembreteBreve` → al final `dibujarPies(mb)`.
 * El cuerpo no debe bajar de `limiteInferior()` puntos.
 */

const PT = 72 / 25.4;
const MM_POR_PT = 0.3528;

/** Lo mínimo del logo del servidor (`MembreteDB.logoPng`). */
export interface LogoServidor {
  bytes: Uint8Array;
  ancho: number;
  alto: number;
}

export interface MembretePdfLib {
  doc: PDFDocument;
  datos: DatosMembrete;
  font: PDFFont;
  bold: PDFFont;
  /** El logo ya embebido (una sola vez por documento) y su proporción. */
  imagen: { img: PDFImage; ancho: number; alto: number } | null;
  /** Deja el texto dibujable con Helvetica (sin tildes sueltas ni caracteres que la fuente no tiene). */
  t: (s: string) => string;
}

const MEDIDAS = {
  normal: { margen: 16, arriba: 13, logo: 18, logoMaxAncho: 44, titulo: 15, datos: 8, tipo: 8.5, codigo: 13, fecha: 8.5 },
  compacto: { margen: 12, arriba: 9, logo: 13, logoMaxAncho: 32, titulo: 12.5, datos: 7.5, tipo: 7.5, codigo: 11, fecha: 8 },
} as const;
const medidas = (o: OpcionesMembrete) => MEDIDAS[o.compacto ? "compacto" : "normal"];

const color = ([r, g, b]: Rgb) => rgb(r / 255, g / 255, b / 255);

/** El margen lateral (puntos) para alinear el cuerpo con el membrete. */
export const margenPdfLib = (o: OpcionesMembrete = {}): number => medidas(o).margen * PT;

/** Hasta dónde puede bajar el cuerpo (puntos desde el borde de abajo) sin pisar el pie. */
export const limiteInferior = (o: OpcionesMembrete = {}): number => (o.compacto ? 12 : 18) * PT;

/**
 * Prepara el membrete de un documento: junta los datos, embebe Helvetica y el
 * logo (si hay). Si el PNG está dañado, sale con el monograma en vez de fallar.
 */
export async function crearMembrete(
  doc: PDFDocument,
  membrete: MembreteDocumento | null | undefined,
  logo: LogoServidor | null | undefined,
  documento: DocumentoMembrete,
): Promise<MembretePdfLib> {
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const tiene = new Set(font.getCharacterSet());
  const t = (s: string) => sanearParaFuente(s, (cp) => tiene.has(cp));
  let imagen: MembretePdfLib["imagen"] = null;
  if (logo && logo.bytes.length > 0 && logo.ancho > 0 && logo.alto > 0) {
    try {
      imagen = { img: await doc.embedPng(logo.bytes), ancho: logo.ancho, alto: logo.alto };
    } catch {
      imagen = null; // PNG ilegible: el papel sale con el monograma.
    }
  }
  return { doc, datos: datosDelMembrete({ ...membrete, logo: null }, documento), font, bold, imagen, t };
}

function recortar(mb: MembretePdfLib, texto: string, ancho: number, f: PDFFont, tam: number): string {
  const s = mb.t(texto);
  if (f.widthOfTextAtSize(s, tam) <= ancho) return s;
  let r = s;
  while (r.length > 1 && f.widthOfTextAtSize(`${r}…`, tam) > ancho) r = r.slice(0, -1);
  return `${r.trimEnd()}…`;
}

/** Parte `texto` en líneas de hasta `ancho` puntos (por palabras); una palabra más larga se corta. */
function partir(mb: MembretePdfLib, texto: string, ancho: number, f: PDFFont, tam: number): string[] {
  const lineas: string[] = [];
  let actual = "";
  for (const palabra of mb.t(texto).split(/\s+/).filter(Boolean)) {
    const prueba = actual ? `${actual} ${palabra}` : palabra;
    if (f.widthOfTextAtSize(prueba, tam) <= ancho) {
      actual = prueba;
      continue;
    }
    if (actual) lineas.push(actual);
    actual = palabra;
  }
  if (actual) lineas.push(actual);
  return lineas;
}

/** Texto alineado a la derecha en `xDer`. */
function derecha(page: PDFPage, s: string, xDer: number, y: number, f: PDFFont, size: number, c: Rgb) {
  page.drawText(s, { x: xDer - f.widthOfTextAtSize(s, size), y, size, font: f, color: color(c) });
}

/**
 * Dibuja la cabecera completa en `page` y devuelve el `y` (pdf-lib: puntos desde
 * ABAJO) donde empieza el cuerpo.
 */
export function dibujarMembrete(mb: MembretePdfLib, page: PDFPage, o: OpcionesMembrete = {}): number {
  const k = medidas(o);
  const m = mb.datos;
  const { width: W, height: H } = page.getSize();
  const Y = (mm: number) => H - mm * PT; // mm desde arriba → y de pdf-lib
  const margen = k.margen * PT;
  const top = k.arriba;

  // Logo o monograma, a la izquierda.
  let anchoMarca: number = k.logo;
  if (mb.imagen) {
    const r = mb.imagen.ancho / mb.imagen.alto;
    anchoMarca = Math.min(k.logoMaxAncho, k.logo * r);
    const altoMarca = anchoMarca / r;
    page.drawImage(mb.imagen.img, { x: margen, y: Y(top + (k.logo - altoMarca) / 2 + altoMarca), width: anchoMarca * PT, height: altoMarca * PT });
  } else {
    const l = k.logo * PT;
    const rad = l * 0.18;
    const trazo = `M ${rad} 0 H ${l - rad} Q ${l} 0 ${l} ${rad} V ${l - rad} Q ${l} ${l} ${l - rad} ${l} H ${rad} Q 0 ${l} 0 ${l - rad} V ${rad} Q 0 0 ${rad} 0 Z`;
    page.drawSvgPath(trazo, { x: margen, y: Y(top), color: color(m.acento), borderWidth: 0 });
    const tam = k.logo * 1.25;
    const letra = mb.t(m.monograma);
    page.drawText(letra, {
      x: margen + l / 2 - mb.bold.widthOfTextAtSize(letra, tam) / 2,
      y: Y(top + k.logo / 2 + tam * MM_POR_PT * 0.36),
      size: tam,
      font: mb.bold,
      color: rgb(1, 1, 1),
    });
  }

  // Bloque del documento, a la derecha: se mide primero para saber cuánto deja al nombre.
  const filas: { texto: string; f: PDFFont; tam: number; c: Rgb }[] = [
    { texto: mb.t(m.tipo.toLocaleUpperCase("es-PE")), f: mb.bold, tam: k.tipo, c: m.acento },
    ...(m.codigo ? [{ texto: mb.t(m.codigo), f: mb.bold, tam: k.codigo, c: PALETA.tinta }] : []),
    ...(m.fecha ? [{ texto: mb.t(m.fecha), f: mb.font, tam: k.fecha, c: PALETA.secundario }] : []),
    ...(m.extra ? [{ texto: mb.t(m.extra), f: mb.font, tam: k.datos, c: PALETA.terciario }] : []),
  ];
  let anchoDerecha = 0;
  for (const l of filas) anchoDerecha = Math.max(anchoDerecha, l.f.widthOfTextAtSize(l.texto, l.tam));
  anchoDerecha = Math.min(anchoDerecha, (W - 2 * margen) * 0.42);

  const xTexto = margen + (anchoMarca + (o.compacto ? 3.5 : 4.5)) * PT;
  const anchoTexto = W - margen - anchoDerecha - 6 * PT - xTexto;

  // Nombre (hasta 2 líneas), razón social y datos (hasta 2 líneas), centrados con la marca si caben.
  const titulo = partir(mb, m.titulo, anchoTexto, mb.bold, k.titulo).slice(0, 2);
  const datos = m.datos.length ? partir(mb, m.datos.join("  ·  "), anchoTexto, mb.font, k.datos).slice(0, 2) : [];
  const altoTitulo = k.titulo * MM_POR_PT * 1.18;
  const altoDato = k.datos * MM_POR_PT * 1.45;
  const alto = titulo.length * altoTitulo + (m.razonSocial ? altoDato : 0) + datos.length * altoDato + (datos.length || m.razonSocial ? 1 : 0);
  let y = top + Math.max(0, (k.logo - alto) / 2) + k.titulo * MM_POR_PT * 0.78;
  for (const l of titulo) {
    page.drawText(l, { x: xTexto, y: Y(y), size: k.titulo, font: mb.bold, color: color(PALETA.tinta) });
    y += altoTitulo;
  }
  y += 1 - altoTitulo + altoDato;
  if (m.razonSocial) {
    page.drawText(recortar(mb, m.razonSocial, anchoTexto, mb.font, k.datos), { x: xTexto, y: Y(y), size: k.datos, font: mb.font, color: color(PALETA.secundario) });
    y += altoDato;
  }
  for (const l of datos) {
    page.drawText(l, { x: xTexto, y: Y(y), size: k.datos, font: mb.font, color: color(PALETA.terciario) });
    y += altoDato;
  }
  const finIzquierda = Math.max(top + k.logo, y - altoDato + 1.5);

  let yd = top + k.tipo * MM_POR_PT * 0.78;
  for (const [i, l] of filas.entries()) {
    if (i > 0) yd += l.tam * MM_POR_PT * 1.3;
    derecha(page, recortar(mb, l.texto, anchoDerecha, l.f, l.tam), W - margen, Y(yd), l.f, l.tam, l.c);
  }

  const yLinea = Math.max(finIzquierda, yd + 1.5) + (o.compacto ? 2.5 : 3.5);
  page.drawLine({ start: { x: margen, y: Y(yLinea) }, end: { x: W - margen, y: Y(yLinea) }, thickness: 0.5 * PT, color: color(m.acento) });
  return Y(yLinea + (o.compacto ? 5 : 7));
}

/** La cabecera breve de las hojas que siguen: negocio + título de la hoja, y el código a la derecha. Devuelve el `y` del cuerpo. */
export function dibujarMembreteBreve(mb: MembretePdfLib, page: PDFPage, tituloDePagina: string, o: OpcionesMembrete = {}): number {
  const k = medidas(o);
  const m = mb.datos;
  const { width: W, height: H } = page.getSize();
  const margen = k.margen * PT;
  const y = H - (k.arriba + 3) * PT;
  page.drawText(recortar(mb, m.titulo, (W - 2 * margen) * 0.6, mb.bold, 9), { x: margen, y, size: 9, font: mb.bold, color: color(PALETA.tinta) });
  if (m.codigo) derecha(page, mb.t(m.codigo), W - margen, y, mb.bold, 9, m.acento);
  page.drawText(recortar(mb, tituloDePagina, W - 2 * margen, mb.font, 8), { x: margen, y: y - 4.5 * PT, size: 8, font: mb.font, color: color(PALETA.secundario) });
  page.drawLine({ start: { x: margen, y: y - 7.5 * PT }, end: { x: W - margen, y: y - 7.5 * PT }, thickness: 0.85, color: color(PALETA.regla) });
  return y - 13 * PT;
}

/** El pie en TODAS las páginas del documento (se llama al final, cuando ya se sabe cuántas son). */
export function dibujarPies(mb: MembretePdfLib, o: OpcionesMembrete & { emitido?: Date } = {}): void {
  const paginas = mb.doc.getPages();
  const emitido = `Emitido el ${emitidoEnLima(o.emitido ?? new Date())} (hora de Lima)`;
  for (const [i, page] of paginas.entries()) {
    const { width: W } = page.getSize();
    const margen = W < 160 * PT ? 10 * PT : margenPdfLib(o);
    const yLinea = (o.compacto ? 12 : 18) * PT - 3 * PT; // = H − (H − alto + 3 mm) en jsPDF
    page.drawLine({ start: { x: margen, y: yLinea }, end: { x: W - margen, y: yLinea }, thickness: 0.57, color: color(PALETA.regla) });
    const yTexto = yLinea - 4.2 * PT;
    const pag = textoPagina(i + 1, paginas.length);
    page.drawText(emitido, { x: margen, y: yTexto, size: 7, font: mb.font, color: color(PALETA.terciario) });
    derecha(page, pag, W - margen, yTexto, mb.font, 7, PALETA.terciario);
    if (mb.datos.pie) {
      const wEmitido = mb.font.widthOfTextAtSize(emitido, 7);
      const wPag = mb.font.widthOfTextAtSize(pag, 7);
      const libre = o.compacto ? W - 2 * margen - wEmitido - wPag - 10 * PT : W - 2 * margen;
      if (libre > 20 * PT) {
        const texto = recortar(mb, mb.datos.pie, libre, mb.font, 7);
        const centro = W / 2 + (o.compacto ? (wEmitido - wPag) / 2 : 0);
        page.drawText(texto, {
          x: centro - mb.font.widthOfTextAtSize(texto, 7) / 2,
          y: o.compacto ? yTexto : yTexto - 3.6 * PT,
          size: 7,
          font: mb.font,
          color: color(PALETA.secundario),
        });
      }
    }
  }
}
