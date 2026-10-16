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
 * que se ve es lo que cae en el papel. Renglones y letra de cada valor:
 * `encajarValor` (`gtf-salida-geometria`), el mismo del PDF y del ESC/P.
 * PURO salvo `imprimirEnMarco`.
 */

import { esc } from "./ctp-documento-print";
import { CRUZ_MM, type Alineacion, type CatalogoFormato, type DisposicionHoja } from "./gtf-matricial-disposicion";
import type { PaginaTalonario } from "./gtf-matricial-valores";
import { INTERLINEA } from "./gtf-matricial-edicion";
import { aplicarX, aplicarY, escalaPct, transformacionDe, type Transformacion } from "./gtf-matricial-perfiles";
import { encajarValor, type Encaje, type ModoValor } from "./gtf-salida-geometria";

/** Interlineado de los valores: el mismo en pantalla y en papel (vive con las cajas de `gtf-matricial-edicion`). */
export { INTERLINEA };

const ALINEA_CSS: Record<Alineacion, string> = { izq: "left", centro: "center", der: "right" };
export const alineaCss = (a: Alineacion): string => ALINEA_CSS[a];

/** mm con 2 decimales y sin ceros de más (el CSS no necesita 12,500000001). */
const n = (v: number): string => String(Math.round(v * 100) / 100);

interface Caja extends ModoValor {
  x: number;
  y: number;
  anchoMm: number;
  letraPt: number;
  alinea: Alineacion;
}

/**
 * Una caja con la letra de su renglón; el valor achicado va en un `<span>` con
 * su letra: el renglón lo sigue dando la de la caja (el «strut» de CSS), así
 * la base queda donde estaba y el texto no sube (la misma base que el PDF).
 */
function caja(c: Caja, e: Encaje): string {
  const ws = c.varias ? "white-space:pre-wrap;overflow-wrap:anywhere" : "white-space:nowrap";
  const texto = esc(c.varias ? e.lineas.join("\n") : e.lineas[0]);
  const valor = e.achicado ? `<span style="font-size:${n(e.letraPt)}pt">${texto}</span>` : texto;
  return `<div class="v" style="left:${n(c.x)}mm;top:${n(c.y)}mm;width:${n(c.anchoMm)}mm;font-size:${n(c.letraPt)}pt;text-align:${ALINEA_CSS[c.alinea]};${ws}">${valor}</div>`;
}

/**
 * Las cajas de una hoja, ya con el corrimiento (y la escala) de la impresora.
 * Sin `tr`: Oficina = el X/Y de la hoja. Lo vacío y lo oculto no salen. La
 * escala corre cada caja y su ancho; dentro de una caja de varios renglones el
 * interlineado es el de la letra (con 1 % de escala, 0,04 mm de diferencia
 * contra el PDF / ESC/P, que escalan cada renglón). La letra de cada valor se
 * decide sobre la caja SIN escala, como el PDF y el ESC/P: la misma en los tres.
 */
export function cajasDeLaPagina(hoja: DisposicionHoja, cat: CatalogoFormato, p: PaginaTalonario, tr: Transformacion = transformacionDe(hoja, null)): string[] {
  const out: string[] = [];
  const poner = (c: Caja, valor: string) =>
    out.push(caja({ ...c, x: aplicarX(tr, c.x), y: aplicarY(tr, c.y), anchoMm: c.anchoMm * tr.sx }, encajarValor(valor, c.anchoMm, c.letraPt, c)));
  for (const def of cat.campos) {
    const pos = hoja.campos[def.id];
    const valor = (p.campos[def.id] ?? "").trim();
    if (!pos?.visible || !valor) continue;
    poner(pos, valor);
  }
  const t = hoja.tabla;
  p.filas.slice(0, t.maxFilas).forEach((fila, i) => {
    for (const col of cat.columnas) {
      const pos = t.columnas[col.id];
      const valor = (fila[col.id] ?? "").trim();
      if (!pos?.visible || !valor) continue;
      poner({ x: pos.x, y: t.y + i * t.altoFilaMm, anchoMm: pos.anchoMm, letraPt: t.letraPt, alinea: pos.alinea, encajar: pos.encajar }, valor);
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
export function htmlTalonario(hoja: DisposicionHoja, cat: CatalogoFormato, paginas: PaginaTalonario[], titulo: string, tr?: Transformacion): string {
  return documento(hoja, titulo, paginas.map((p) => cajasDeLaPagina(hoja, cat, p, tr).join("")));
}

/** Distancia de las cruces de la prueba a cada borde (vive en la disposición: la usan también el PDF y el ESC/P). */
export { CRUZ_MM };

/**
 * La hoja de PRUEBA: cuadrícula de 10 mm (más gruesa cada 50), los mm
 * rotulados en los bordes y una cruz a 10 mm de cada esquina, todo con el
 * corrimiento aplicado. Se mide con regla del borde del papel al centro de
 * cada cruz: tiene que dar 10 mm. Con `pagina`, encima van los valores.
 * Con `tr`, la de esa impresora (sin él, Oficina = el X/Y de la hoja).
 */
export function htmlPruebaTalonario(
  hoja: DisposicionHoja,
  cat: CatalogoFormato,
  pagina: PaginaTalonario | null,
  titulo: string,
  tr: Transformacion = transformacionDe(hoja, null),
): string {
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
    <text x="${n(W / 2)}" y="${n(H / 2 + 16)}" text-anchor="middle" font-size="2.8">${esc(`Impresora: ${tr.perfil.nombre} · corrimiento usado: X ${n(tr.dx)} mm · Y ${n(tr.dy)} mm`)}${
      tr.sx !== 1 || tr.sy !== 1 ? ` · escala X ${escalaPct(tr.sx)} · Y ${escalaPct(tr.sy)}` : ""
    }</text>`;
  const escala = tr.sx !== 1 || tr.sy !== 1 ? ` scale(${tr.sx} ${tr.sy})` : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${n(W)}mm" height="${n(H)}mm" viewBox="0 0 ${n(W)} ${n(H)}"
    style="position:absolute;left:0;top:0" font-family="Courier New, monospace" font-weight="bold" font-size="2.2" fill="#000" stroke="#000">
    <g transform="translate(${n(tr.dx)} ${n(tr.dy)})${escala}"><g stroke="#000">${lineas.join("")}</g>${cruces}<g stroke="none">${leyenda}</g></g></svg>`;
  const valores = pagina ? cajasDeLaPagina(hoja, cat, pagina, tr).join("") : "";
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
