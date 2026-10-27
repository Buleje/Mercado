/**
 * gtf-formato-completo-pdf — «Con formato» como ARCHIVO PDF (27-10, Brandon:
 * «bajar en PDF»): las mismas hojas que `htmlFormatoCompleto`, para mandar
 * por WhatsApp o correo sin pasar por el diálogo de imprimir.
 *
 * El formato se dibuja con pdf-lib trazo por trazo (la misma plantilla y el
 * mismo estilo que el SVG de `gtf-talonario-plantilla-svg`): rótulos en
 * Helvetica (la Arial de los PDF), estirados a su medida del papel como el
 * `textLength` del SVG; los valores, con `renglonesDeLaPagina` y la Courier
 * negrita del PDF del talonario. Página A4 de la plantilla, sin márgenes.
 *
 * Sin DOM: corre en el navegador (se importa con `import()` al bajarlo).
 */

import { LineCapStyle, StandardFonts, concatTransformationMatrix, degrees, popGraphicsState, pushGraphicsState, rgb, type Color, type PDFFont, type PDFPage } from "pdf-lib";
import { transformacionDe } from "./gtf-matricial-perfiles";
import { MARCA_LETRA_MM, MARCA_OPACIDAD, MARCA_PIE_MM, type HojaConFormato, type MarcaCopia } from "./gtf-matricial-print";
import { renglonesDeLaPagina } from "./gtf-salida-geometria";
import { PT_POR_MM, dibujarRenglones, nuevaPagina, nuevoDocumento, sanearParaFuente } from "./gtf-salida-pdf";
import type { PlantillaHoja, TrazoPlantilla } from "./gtf-talonario-plantilla";
import type { EstiloPlantilla } from "./gtf-talonario-plantilla-svg";

/** «#16759f» → color de pdf-lib; «none» (sin relleno) → undefined. */
function color(hex: string): Color | undefined {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return undefined;
  const v = parseInt(hex.slice(1), 16);
  return rgb(((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255);
}

interface Letras {
  normal: PDFFont;
  negrita: PDFFont;
  tiene: (cp: number) => boolean;
}

/** Un rectángulo de esquinas redondas en mm (el `rx` del SVG), para `drawSvgPath` con origen arriba a la izquierda. */
const rectRedondo = (x: number, y: number, w: number, h: number, r: number): string =>
  `M ${x + r} ${y} H ${x + w - r} A ${r} ${r} 0 0 1 ${x + w} ${y + r} V ${y + h - r} A ${r} ${r} 0 0 1 ${x + w - r} ${y + h} H ${x + r} A ${r} ${r} 0 0 1 ${x} ${y + h - r} V ${y + r} A ${r} ${r} 0 0 1 ${x + r} ${y} Z`;

/** Un trazo de la plantilla en la página (y del PDF desde abajo: `alto − y`). Mismas reglas que `trazoSvg`. */
function dibujarTrazo(page: PDFPage, altoMm: number, t: TrazoPlantilla, e: EstiloPlantilla, l: Letras): void {
  const X = (mm: number) => mm * PT_POR_MM;
  const Y = (mm: number) => (altoMm - mm) * PT_POR_MM;
  const tinta = color(e.tinta) ?? rgb(0, 0, 0);
  switch (t.t) {
    case "linea": {
      /* Las rayas finas (punteados y renglones de la tabla) van más claras: encima se lee el valor. */
      const fina = !!t.punteado || t.grosor <= 0.2;
      page.drawLine({
        start: { x: X(t.x1), y: Y(t.y1) },
        end: { x: X(t.x2), y: Y(t.y2) },
        thickness: X(t.punteado ? Math.max(t.grosor, 0.3) : t.grosor),
        color: fina ? (color(e.linea) ?? tinta) : tinta,
        ...(t.punteado && { dashArray: [X(0.4), X(0.5)], lineCap: LineCapStyle.Round }),
      });
      return;
    }
    case "rect": {
      const relleno = t.relleno ? color(e.franja) : undefined;
      if (t.radio) {
        /* `drawSvgPath` escala el trazo entero: el grosor va en mm, como el camino. */
        page.drawSvgPath(rectRedondo(t.x, t.y, t.w, t.h, t.radio), { x: 0, y: Y(0), scale: PT_POR_MM, borderColor: tinta, borderWidth: t.grosor, color: relleno });
        return;
      }
      page.drawRectangle({ x: X(t.x), y: Y(t.y + t.h), width: X(t.w), height: X(t.h), borderColor: tinta, borderWidth: X(t.grosor), color: relleno });
      return;
    }
    case "casilla":
      page.drawRectangle({ x: X(t.x), y: Y(t.y + t.h), width: X(t.w), height: X(t.h), borderColor: tinta, borderWidth: X(0.3) });
      return;
    case "texto": {
      const s = sanearParaFuente(t.s, l.tiene);
      if (!s.trim()) return;
      const font = (t.peso ?? 400) >= 600 ? l.negrita : l.normal;
      const ancho = font.widthOfTextAtSize(s, t.pt);
      /* Con `ancho`, estirado o encogido a su medida del papel, como el `textLength` del SVG. */
      const medida = t.ancho ? X(t.ancho) : ancho;
      const x0 = X(t.x) - (t.alinea === "centro" ? medida / 2 : t.alinea === "der" ? medida : 0);
      const tono = t.tinta === "folio" ? (color(e.folio) ?? tinta) : tinta;
      const sx = t.ancho && ancho > 0 ? medida / ancho : 1;
      if (sx === 1) {
        page.drawText(s, { x: x0, y: Y(t.y), size: t.pt, font, color: tono });
        return;
      }
      page.pushOperators(pushGraphicsState(), concatTransformationMatrix(sx, 0, 0, 1, x0, Y(t.y)));
      page.drawText(s, { x: 0, y: 0, size: t.pt, font, color: tono });
      page.pushOperators(popGraphicsState());
      return;
    }
  }
}

function dibujarPlantilla(page: PDFPage, altoMm: number, p: PlantillaHoja, e: EstiloPlantilla, l: Letras): void {
  for (const t of p.trazos) dibujarTrazo(page, altoMm, t, e, l);
}

/** La marca encima de todo, como `marcaSvg`: la palabra centrada en la hoja y cruzada por la diagonal, y su pie. */
function dibujarMarca(page: PDFPage, anchoMm: number, altoMm: number, m: MarcaCopia, e: EstiloPlantilla, l: Letras): void {
  const tinta = color(e.tinta) ?? rgb(0, 0, 0);
  const W = anchoMm * PT_POR_MM;
  const H = altoMm * PT_POR_MM;
  const grande = sanearParaFuente(m.grande, l.tiene);
  const size = MARCA_LETRA_MM * PT_POR_MM;
  const w = l.negrita.widthOfTextAtSize(grande, size);
  const alto = l.negrita.heightAtSize(size, { descender: false });
  const ang = Math.atan2(H, W);
  /* El centro de la palabra en el centro de la hoja: se arranca medio ancho atrás por la diagonal y media altura abajo. */
  const [ux, uy, vx, vy] = [Math.cos(ang), Math.sin(ang), -Math.sin(ang), Math.cos(ang)];
  page.drawText(grande, {
    x: W / 2 - (w / 2) * ux - (alto / 2) * vx,
    y: H / 2 - (w / 2) * uy - (alto / 2) * vy,
    size, font: l.negrita, color: tinta, opacity: MARCA_OPACIDAD, rotate: degrees((ang * 180) / Math.PI),
  });
  const pie = sanearParaFuente(m.pie, l.tiene);
  const letraPie = MARCA_PIE_MM.letra * PT_POR_MM;
  page.drawText(pie, { x: W / 2 - l.normal.widthOfTextAtSize(pie, letraPie) / 2, y: MARCA_PIE_MM.base * PT_POR_MM, size: letraPie, font: l.normal, color: tinta });
}

/** El PDF de «Con formato»: una página A4 por hoja, el formato debajo, los valores encima y, con `marca`, la copia. */
export async function pdfConFormato(hojas: HojaConFormato[], titulo: string, estilo: EstiloPlantilla, marca: MarcaCopia | null = null): Promise<Uint8Array> {
  const { doc, font, tiene } = await nuevoDocumento(titulo);
  doc.setSubject("La guía de transporte forestal con su formato completo, en hoja A4.");
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const negrita = await doc.embedFont(StandardFonts.HelveticaBold);
  const set = new Set(normal.getCharacterSet());
  const letras: Letras = { normal, negrita, tiene: (cp) => set.has(cp) };
  for (const h of hojas) {
    const page = nuevaPagina(doc, h.hoja);
    dibujarPlantilla(page, h.hoja.altoMm, h.plantilla, estilo, letras);
    dibujarRenglones(page, h.hoja, renglonesDeLaPagina(h.hoja, h.cat, h.pagina, transformacionDe(h.hoja, null)), font, tiene);
    if (marca) dibujarMarca(page, h.hoja.anchoMm, h.hoja.altoMm, marca, estilo, letras);
  }
  return doc.save({ useObjectStreams: false });
}
