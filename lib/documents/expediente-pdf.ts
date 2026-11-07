import "server-only";
import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { Membrete } from "@/lib/admin/membrete";
import { sanearParaFuente } from "@/lib/forestal/gtf-salida-pdf";
import { anexarAlPdf } from "@/lib/documents/pdf-merge";
import { fechaDeLima, FILAS_POR_HOJA_INDICE, numerarExpediente, type FilaDelIndice, type TipoPapel } from "@/lib/documents/expediente-indice";

export type { FilaDelIndice };

/**
 * El expediente como UN PDF (22-10): portada con el membrete del negocio,
 * índice (n.º, papel, carpeta, vence, página) y los papeles en orden, con el
 * pie «Expediente <título> · pág. X de N» en TODAS las hojas — también en las
 * de los papeles, para que el fiscalizador cuente las mismas páginas que el índice.
 *
 * Primero se agregan los papeles (así se sabe cuántas páginas trae cada uno),
 * después se insertan delante la portada y el índice, y al final el pie.
 * Fuentes estándar de pdf-lib (WinAnsi): `sanearParaFuente` cambia lo que no
 * dibujan por su letra base o «?», nunca un cuadradito.
 */

export interface PapelParaArmar {
  nombre: string;
  carpeta: string;
  /** «12/03/2027» o null. */
  vence: string | null;
  tipo: TipoPapel;
  mimeType: string;
  /** null = no se pudo bajar del almacenamiento. */
  bytes: Uint8Array | null;
}

export interface ExpedienteArmado {
  bytes: Uint8Array;
  paginas: number;
  hojasIndice: number;
  indice: FilaDelIndice[];
}

const NEGRO = rgb(0, 0, 0);
const GRIS = rgb(0.38, 0.38, 0.38);
const GRIS_CLARO = rgb(0.85, 0.85, 0.85);
const BLANCO = rgb(1, 1, 1);
const A4: [number, number] = [595.28, 841.89];
const M = 48;
const ALTO_FILA = 24;
const COL = { n: M, papel: M + 30, carpeta: M + 290, vence: M + 410, pagDer: A4[0] - M };

export async function armarPdfExpediente(input: {
  titulo: string;
  membrete: Membrete;
  fecha: Date;
  papeles: readonly PapelParaArmar[];
}): Promise<ExpedienteArmado> {
  const doc = await PDFDocument.create();
  doc.setTitle(input.titulo);
  doc.setCreator("Buleje");
  doc.setCreationDate(input.fecha);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const set = new Set(font.getCharacterSet());
  const t = (s: string) => sanearParaFuente(s, (cp) => set.has(cp));

  // 1) Los papeles, uno tras otro, contando lo que aporta cada uno.
  const paginasPorPapel: number[] = [];
  const motivos: FilaDelIndice["motivo"][] = [];
  for (const p of input.papeles) {
    if (p.tipo === "no-imprimible") {
      paginasPorPapel.push(0);
      motivos.push("no-imprimible");
      continue;
    }
    const sumadas = p.bytes ? await anexarAlPdf(doc, { bytes: p.bytes, mimeType: p.tipo === "pdf" ? "application/pdf" : p.mimeType, name: p.nombre }) : 0;
    paginasPorPapel.push(sumadas);
    motivos.push(sumadas > 0 ? null : "no-se-pudo-leer");
  }

  const num = numerarExpediente(paginasPorPapel);
  const indice: FilaDelIndice[] = input.papeles.map((p, i) => ({
    n: i + 1,
    nombre: p.nombre,
    carpeta: p.carpeta,
    vence: p.vence,
    pagina: num.inicio[i],
    paginas: paginasPorPapel[i],
    motivo: motivos[i],
  }));

  // 2) Portada (página 1) e índice (2..) delante de los papeles.
  const portada = doc.insertPage(0, A4);
  const hojas: PDFPage[] = [];
  for (let h = 0; h < num.hojasIndice; h++) hojas.push(doc.insertPage(1 + h, A4));

  const recorta = (s: string, max: number, size: number, f: PDFFont = font) => {
    let r = t(s);
    if (f.widthOfTextAtSize(r, size) <= max) return r;
    while (r.length > 1 && f.widthOfTextAtSize(`${r}…`, size) > max) r = r.slice(0, -1);
    return `${r.trimEnd()}…`;
  };
  const enLineas = (s: string, max: number, size: number, f: PDFFont, tope: number): string[] => {
    const palabras = t(s).split(/\s+/).filter(Boolean);
    const lineas: string[] = [];
    let actual = "";
    for (const w of palabras) {
      const prueba = actual ? `${actual} ${w}` : w;
      if (f.widthOfTextAtSize(prueba, size) <= max) actual = prueba;
      else {
        if (actual) lineas.push(actual);
        actual = w;
      }
    }
    if (actual) lineas.push(actual);
    if (lineas.length > tope) lineas.splice(tope - 1, lineas.length, recorta(lineas.slice(tope - 1).join(" "), max, size, f));
    return lineas.map((l) => (f.widthOfTextAtSize(l, size) > max ? recorta(l, max, size, f) : l));
  };

  dibujarPortada(portada, { ...input, total: num.total, papeles: indice, font, bold, t, enLineas });

  hojas.forEach((page, h) => {
    let y = A4[1] - M;
    page.drawText(t(h === 0 ? "Índice" : "Índice (continuación)"), { x: M, y, size: 16, font: bold, color: NEGRO });
    y -= 16;
    page.drawText(recorta(input.titulo, A4[0] - 2 * M, 9), { x: M, y, size: 9, font, color: GRIS });
    y -= 26;
    const cab = (s: string, x: number) => page.drawText(t(s), { x, y, size: 8.5, font: bold, color: NEGRO });
    cab("N.º", COL.n);
    cab("Papel", COL.papel);
    cab("Carpeta", COL.carpeta);
    cab("Vence", COL.vence);
    page.drawText(t("Pág."), { x: COL.pagDer - bold.widthOfTextAtSize(t("Pág."), 8.5), y, size: 8.5, font: bold, color: NEGRO });
    y -= 6;
    page.drawLine({ start: { x: M, y }, end: { x: A4[0] - M, y }, thickness: 0.8, color: NEGRO });
    y -= 14;
    for (const fila of indice.slice(h * FILAS_POR_HOJA_INDICE, (h + 1) * FILAS_POR_HOJA_INDICE)) {
      page.drawText(String(fila.n), { x: COL.n, y, size: 9, font, color: NEGRO });
      const anchoPapel = COL.carpeta - COL.papel - 10;
      const nota = fila.motivo === "no-imprimible" ? "No imprimible: pedir el original" : fila.motivo === "no-se-pudo-leer" ? "No se pudo leer: pedir el original" : null;
      const lineas = nota ? [recorta(fila.nombre, anchoPapel, 9, bold)] : enLineas(fila.nombre, anchoPapel, 9, bold, 2);
      page.drawText(lineas[0] ?? "", { x: COL.papel, y, size: 9, font: bold, color: NEGRO });
      if (nota) page.drawText(t(nota), { x: COL.papel, y: y - 10, size: 7.5, font, color: GRIS });
      else if (lineas[1]) page.drawText(lineas[1], { x: COL.papel, y: y - 10, size: 9, font: bold, color: NEGRO });
      const carpeta = enLineas(fila.carpeta, COL.vence - COL.carpeta - 8, 8, font, 2);
      carpeta.forEach((l, i) => page.drawText(l, { x: COL.carpeta, y: y - i * 9, size: 8, font, color: GRIS }));
      if (fila.vence) page.drawText(t(fila.vence), { x: COL.vence, y, size: 8.5, font, color: NEGRO });
      const pag = fila.pagina === null ? "-" : String(fila.pagina);
      page.drawText(pag, { x: COL.pagDer - bold.widthOfTextAtSize(pag, 9), y, size: 9, font: bold, color: NEGRO });
      y -= ALTO_FILA;
      page.drawLine({ start: { x: M, y: y + 9 }, end: { x: A4[0] - M, y: y + 9 }, thickness: 0.4, color: GRIS_CLARO });
    }
  });

  // 3) El pie en todas las hojas, derecho aunque la hoja venga girada.
  const total = doc.getPageCount();
  doc.getPages().forEach((page, i) => ponerPie(page, recortaPie(t, font, input.titulo, i + 1, total), font));

  return { bytes: await doc.save(), paginas: total, hojasIndice: num.hojasIndice, indice };
}

function dibujarPortada(
  page: PDFPage,
  x: {
    titulo: string;
    membrete: Membrete;
    fecha: Date;
    total: number;
    papeles: FilaDelIndice[];
    font: PDFFont;
    bold: PDFFont;
    t: (s: string) => string;
    enLineas: (s: string, max: number, size: number, f: PDFFont, tope: number) => string[];
  },
) {
  const { font, bold, t, membrete } = x;
  const ancho = A4[0] - 2 * M;
  let y = A4[1] - M - 8;
  const negocio = membrete.razonSocial || membrete.nombre || "";
  if (negocio) {
    for (const l of x.enLineas(negocio, ancho, 15, bold, 2)) {
      page.drawText(l, { x: M, y, size: 15, font: bold, color: NEGRO });
      y -= 18;
    }
  }
  for (const l of [membrete.ruc ? `RUC ${membrete.ruc}` : "", membrete.direccion ?? "", membrete.telefono ? `Tel. ${membrete.telefono}` : ""].filter(Boolean)) {
    page.drawText(t(l), { x: M, y, size: 9, font, color: GRIS });
    y -= 12;
  }
  y -= 10;
  page.drawLine({ start: { x: M, y }, end: { x: A4[0] - M, y }, thickness: 1, color: NEGRO });

  y = A4[1] * 0.62;
  page.drawText(t("EXPEDIENTE"), { x: M, y, size: 11, font: bold, color: GRIS });
  y -= 30;
  const tituloSinPalabra = x.titulo.replace(/^expediente\s+/i, "") || x.titulo;
  for (const l of x.enLineas(tituloSinPalabra, ancho, 24, bold, 3)) {
    page.drawText(l, { x: M, y, size: 24, font: bold, color: NEGRO });
    y -= 30;
  }
  y -= 10;
  const fueraDelPdf = x.papeles.filter((p) => p.pagina === null).length;
  const n = x.papeles.length;
  const lineas = [
    `Armado el ${fechaDeLima(x.fecha)}`,
    `${n} ${n === 1 ? "papel" : "papeles"} · ${x.total} páginas en total (con esta portada y el índice)`,
    ...(fueraDelPdf > 0 ? [`${fueraDelPdf === 1 ? "1 papel no entra en el PDF: figura" : `${fueraDelPdf} papeles no entran en el PDF: figuran`} en el índice para pedir el original`] : []),
  ];
  for (const l of lineas) {
    for (const s of x.enLineas(l, ancho, 11, font, 2)) {
      page.drawText(s, { x: M, y, size: 11, font, color: NEGRO });
      y -= 15;
    }
  }
  if (membrete.pie) {
    for (const [i, s] of x.enLineas(membrete.pie, ancho, 8, font, 2).entries()) {
      page.drawText(s, { x: M, y: M + 26 - i * 10, size: 8, font, color: GRIS });
    }
  }
}

/** «Expediente X · pág. 3 de 42», con el título recortado para que el pie quepa en una línea. */
function recortaPie(t: (s: string) => string, font: PDFFont, titulo: string, pag: number, total: number): string {
  const cola = ` · pág. ${pag} de ${total}`;
  let tit = t(titulo);
  const max = 420;
  while (tit.length > 4 && font.widthOfTextAtSize(`${tit}…${cola}`, 8) > max) tit = tit.slice(0, -1);
  return font.widthOfTextAtSize(`${t(titulo)}${cola}`, 8) <= max ? `${t(titulo)}${cola}` : `${tit.trimEnd()}…${cola}`;
}

/**
 * El pie centrado abajo de lo que SE VE: una hoja escaneada con /Rotate 90 se
 * muestra girada, así que el «abajo» visual es otro borde del espacio de la
 * página. Lleva un fondo blanco: un escaneo que llega al borde no lo tapa.
 */
function ponerPie(page: PDFPage, texto: string, font: PDFFont) {
  const size = 8;
  const tw = font.widthOfTextAtSize(texto, size);
  const caja = page.getCropBox();
  const giro = ((page.getRotation().angle % 360) + 360) % 360;
  const d = 16;
  let o: { x: number; y: number };
  if (giro === 90) o = { x: caja.x + caja.width - d, y: caja.y + caja.height / 2 - tw / 2 };
  else if (giro === 180) o = { x: caja.x + caja.width / 2 + tw / 2, y: caja.y + caja.height - d };
  else if (giro === 270) o = { x: caja.x + d, y: caja.y + caja.height / 2 + tw / 2 };
  else o = { x: caja.x + caja.width / 2 - tw / 2, y: caja.y + d };
  const ang = giro === 90 || giro === 180 || giro === 270 ? giro : 0;
  const rad = (ang * Math.PI) / 180;
  // Esquina del fondo en coordenadas del texto (−6, −3) llevada al espacio de la página.
  const lx = -6;
  const ly = -3;
  page.drawRectangle({
    x: o.x + lx * Math.cos(rad) - ly * Math.sin(rad),
    y: o.y + lx * Math.sin(rad) + ly * Math.cos(rad),
    width: tw + 12,
    height: size + 5,
    rotate: degrees(ang),
    color: BLANCO,
    opacity: 0.85,
  });
  page.drawText(texto, { x: o.x, y: o.y, size, font, color: GRIS, rotate: degrees(ang) });
}
