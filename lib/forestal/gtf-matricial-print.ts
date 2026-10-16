/**
 * gtf-matricial-print — el HTML que va a la matricial: SÓLO los valores, cada
 * uno en sus milímetros, sobre el talonario preimpreso.
 *
 * Reglas del papel (no son estética):
 *   · `@page` del tamaño exacto del talonario y margen 0: cualquier margen del
 *     navegador corre todo y el corrimiento de la impresora ya lo mide la prueba;
 *   · Courier New en negrita, negro puro, sin fondos: una matricial de 9 o 24
 *     agujas imprime mejor la monoespaciada gruesa y no tiene grises;
 *   · una sola impresión: las 3 copias salen del papel autocopiativo;
 *   · el corrimiento X/Y se suma a TODO (la matricial corre la hoja entera).
 *
 * La pantalla del diseñador usa la misma geometría (`estiloCaja`), así que lo
 * que se ve es lo que cae en el papel. PURO salvo `imprimirEnMarco`.
 */

import { esc } from "./ctp-documento-print";
import type { Alineacion, CatalogoFormato, DisposicionHoja } from "./gtf-matricial-disposicion";
import type { PaginaTalonario } from "./gtf-matricial-valores";
import { INTERLINEA } from "./gtf-matricial-edicion";

/** Interlineado de los valores: el mismo en pantalla y en papel (vive con las cajas de `gtf-matricial-edicion`). */
export { INTERLINEA };

const ALINEA_CSS: Record<Alineacion, string> = { izq: "left", centro: "center", der: "right" };
export const alineaCss = (a: Alineacion): string => ALINEA_CSS[a];

/** mm con 2 decimales y sin ceros de más (el CSS no necesita 12,500000001). */
const n = (v: number): string => String(Math.round(v * 100) / 100);

interface Caja {
  x: number;
  y: number;
  anchoMm: number;
  letraPt: number;
  alinea: Alineacion;
  /** Las celdas de la tabla no parten renglón: invadirían la fila de abajo. */
  unaLinea?: boolean;
}

function caja(c: Caja, texto: string): string {
  const ws = c.unaLinea ? "white-space:nowrap" : "white-space:pre-wrap;overflow-wrap:anywhere";
  return `<div class="v" style="left:${n(c.x)}mm;top:${n(c.y)}mm;width:${n(c.anchoMm)}mm;font-size:${n(c.letraPt)}pt;text-align:${ALINEA_CSS[c.alinea]};${ws}">${esc(texto)}</div>`;
}

/** Las cajas de una hoja, ya con el corrimiento. Lo vacío y lo oculto no salen. */
export function cajasDeLaPagina(hoja: DisposicionHoja, cat: CatalogoFormato, p: PaginaTalonario): string[] {
  const dx = hoja.offsetXMm;
  const dy = hoja.offsetYMm;
  const out: string[] = [];
  for (const def of cat.campos) {
    const pos = hoja.campos[def.id];
    const valor = (p.campos[def.id] ?? "").trim();
    if (!pos?.visible || !valor) continue;
    out.push(caja({ ...pos, x: pos.x + dx, y: pos.y + dy }, valor));
  }
  const t = hoja.tabla;
  p.filas.slice(0, t.maxFilas).forEach((fila, i) => {
    for (const col of cat.columnas) {
      const pos = t.columnas[col.id];
      const valor = (fila[col.id] ?? "").trim();
      if (!pos?.visible || !valor) continue;
      out.push(caja({ x: pos.x + dx, y: t.y + i * t.altoFilaMm + dy, anchoMm: pos.anchoMm, letraPt: t.letraPt, alinea: pos.alinea, unaLinea: true }, valor));
    }
  });
  return out;
}

function documento(hoja: DisposicionHoja, titulo: string, hojas: string[]): string {
  const w = n(hoja.anchoMm);
  const h = n(hoja.altoMm);
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(titulo)}</title><style>
@page { size: ${w}mm ${h}mm; margin: 0; }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
html, body { margin: 0; padding: 0; background: #fff; }
.hoja { position: relative; width: ${w}mm; height: ${h}mm; overflow: hidden; break-after: page; page-break-after: always; }
.hoja:last-child { break-after: auto; page-break-after: auto; }
.v { position: absolute; margin: 0; padding: 0; font-family: "Courier New", Courier, monospace; font-weight: bold;
     color: #000; line-height: ${INTERLINEA}; }
</style></head><body>${hojas.map((c) => `<div class="hoja">${c}</div>`).join("")}</body></html>`;
}

/** El documento a imprimir: una hoja del talonario por página. */
export function htmlTalonario(hoja: DisposicionHoja, cat: CatalogoFormato, paginas: PaginaTalonario[], titulo: string): string {
  return documento(hoja, titulo, paginas.map((p) => cajasDeLaPagina(hoja, cat, p).join("")));
}

/** Distancia de las cruces de la prueba a cada borde. */
export const CRUZ_MM = 10;

/**
 * La hoja de PRUEBA: cuadrícula de 10 mm (más gruesa cada 50), los mm
 * rotulados en los bordes y una cruz a 10 mm de cada esquina, todo con el
 * corrimiento aplicado. Se mide con regla del borde del papel al centro de
 * cada cruz: tiene que dar 10 mm. Con `pagina`, encima van los valores.
 */
export function htmlPruebaTalonario(hoja: DisposicionHoja, cat: CatalogoFormato, pagina: PaginaTalonario | null, titulo: string): string {
  const W = hoja.anchoMm;
  const H = hoja.altoMm;
  const lineas: string[] = [];
  for (let x = 10; x < W; x += 10) {
    lineas.push(`<line x1="${x}" y1="0" x2="${x}" y2="${n(H)}" stroke-width="${x % 50 === 0 ? 0.3 : 0.12}"/>`);
    lineas.push(`<text x="${x + 0.6}" y="3.2">${x}</text>`);
  }
  for (let y = 10; y < H; y += 10) {
    lineas.push(`<line x1="0" y1="${y}" x2="${n(W)}" y2="${y}" stroke-width="${y % 50 === 0 ? 0.3 : 0.12}"/>`);
    lineas.push(`<text x="0.6" y="${y - 0.6}">${y}</text>`);
  }
  const cruz = (cx: number, cy: number) =>
    `<g stroke-width="0.35"><line x1="${n(cx - 6)}" y1="${n(cy)}" x2="${n(cx + 6)}" y2="${n(cy)}"/><line x1="${n(cx)}" y1="${n(cy - 6)}" x2="${n(cx)}" y2="${n(cy + 6)}"/><circle cx="${n(cx)}" cy="${n(cy)}" r="1.5" fill="none"/></g>`;
  const cruces = [
    cruz(CRUZ_MM, CRUZ_MM), cruz(W - CRUZ_MM, CRUZ_MM), cruz(CRUZ_MM, H - CRUZ_MM), cruz(W - CRUZ_MM, H - CRUZ_MM), cruz(W / 2, H / 2),
  ].join("");
  const leyenda = `<text x="${n(W / 2)}" y="${n(H / 2 - 9)}" text-anchor="middle" font-size="3.4">PRUEBA DE ALINEACIÓN · ${n(W)} × ${n(H)} mm</text>
    <text x="${n(W / 2)}" y="${n(H / 2 + 12)}" text-anchor="middle" font-size="2.8">Del borde del papel al centro de cada cruz debe dar ${CRUZ_MM} mm.</text>
    <text x="${n(W / 2)}" y="${n(H / 2 + 16)}" text-anchor="middle" font-size="2.8">Corrimiento usado: X ${n(hoja.offsetXMm)} mm · Y ${n(hoja.offsetYMm)} mm</text>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${n(W)}mm" height="${n(H)}mm" viewBox="0 0 ${n(W)} ${n(H)}"
    style="position:absolute;left:0;top:0" font-family="Courier New, monospace" font-weight="bold" font-size="2.2" fill="#000" stroke="#000">
    <g transform="translate(${n(hoja.offsetXMm)} ${n(hoja.offsetYMm)})"><g stroke="#000">${lineas.join("")}</g>${cruces}<g stroke="none">${leyenda}</g></g></svg>`;
  const valores = pagina ? cajasDeLaPagina(hoja, cat, pagina).join("") : "";
  return documento(hoja, titulo, [svg + valores]);
}

/** El marco de la última impresión: queda en el DOM hasta la siguiente (las pruebas leen su HTML). */
const MARCO_ID = "gtf-matricial-marco";

/** Imprime un HTML en un iframe oculto (sin ventana emergente). */
export function imprimirEnMarco(html: string): void {
  document.getElementById(MARCO_ID)?.remove();
  const iframe = document.createElement("iframe");
  iframe.id = MARCO_ID;
  iframe.title = "Impresión del talonario";
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  iframe.onload = () => {
    const win = iframe.contentWindow;
    if (!win) return;
    /* La fuente monoespaciada tiene que estar lista antes de fotografiar la hoja. */
    (win.document.fonts?.ready ?? Promise.resolve())
      .then(() => {
        win.focus();
        win.print();
      })
      .catch((err) => console.warn("[gtf-matricial] no se pudo imprimir", err));
  };
  iframe.srcdoc = html;
  document.body.appendChild(iframe);
}
