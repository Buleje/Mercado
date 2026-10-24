/**
 * La hoja A4 de una planilla de campo, como HTML listo para imprimir.
 *
 * Pensada para que la IA la lea bien después de la foto: casilleros grandes,
 * renglones numerados, la unidad en cada columna, lo calculado sombreado (no se
 * llena), una fila de ejemplo en gris claro marcada «Ej.» y el pie con el
 * nombre y la versión de la planilla — el prompt reconoce la hoja por ese pie.
 *
 * PURA y client-safe. Escapa todo lo que imprime (no reusa `ctp-print-shared`:
 * ese módulo es "use client" y esto también se llama desde el servidor). Los
 * colores van en hex: la ventana de impresión no tiene los tokens del panel.
 */

import type { PlanillaCampo } from "./tipos";

const esc = (s: string | number | null | undefined): string =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** mm de la hoja A4 menos los márgenes (10 mm por lado). */
const UTIL = { vertical: { ancho: 190, alto: 277 }, horizontal: { ancho: 277, alto: 190 } } as const;
const ANCHO_NUMERO_MM = 9;

/** Casilleros de la cabecera por línea. */
const casillerosPorLinea = (p: PlanillaCampo) => (p.orientacion === "horizontal" ? 4 : 3);

/**
 * Alto de cada renglón para que las `filasPorHoja` + la de ejemplo entren en
 * UNA hoja con la cabecera y el pie. Entre 6 y 10 mm: menos no se escribe a
 * mano; más, sobra papel.
 */
export function altoDeRenglonMm(p: PlanillaCampo): number {
  const lineasCabecera = Math.ceil(p.cabecera.length / casillerosPorLinea(p));
  const fijo = 15 /* título */ + lineasCabecera * 10 + 12 /* encabezado de la tabla */ + (p.metodo ? 18 : 12) /* pie */;
  const alto = (UTIL[p.orientacion].alto - fijo) / (p.filasPorHoja + 1);
  return Math.max(6, Math.min(10, Math.floor(alto * 10) / 10));
}

/** Lo que lleva la hoja de UNA cubicación guardada: su código (para buscarla) y el nombre del lote. */
export interface HojaDeCubicacion {
  codigo?: string;
  lote?: string;
}

function hoja(p: PlanillaCampo, negocio: string | undefined, ultima: boolean, de: HojaDeCubicacion): string {
  const total = ANCHO_NUMERO_MM + p.columnas.reduce((a, c) => a + c.anchoMm, 0);
  const pct = (mm: number) => `${((mm / total) * 100).toFixed(2)}%`;
  const alto = altoDeRenglonMm(p);

  const cols = [`<col style="width:${pct(ANCHO_NUMERO_MM)}">`, ...p.columnas.map((c) => `<col style="width:${pct(c.anchoMm)}">`)].join("");

  const encabezado = p.columnas
    .map((c) => {
      const unidad = c.unidad ? `<span class="u">(${esc(c.unidad)})</span>` : "";
      const nota = c.calculada ? `<span class="calc-nota">lo calcula el sistema</span>` : "";
      return `<th class="${c.calculada ? "calc" : ""}">${esc(c.titulo)}${unidad}${nota}</th>`;
    })
    .join("");

  const ejemplo = `<tr class="ej" style="height:${alto}mm"><td class="n">Ej.</td>${p.columnas
    .map((c) => `<td class="${c.calculada ? "calc" : ""}">${esc(c.ejemplo)}</td>`)
    .join("")}</tr>`;

  const vacias = Array.from(
    { length: p.filasPorHoja },
    (_, i) =>
      `<tr style="height:${alto}mm"><td class="n">${i + 1}</td>${p.columnas.map((c) => `<td class="${c.calculada ? "calc" : ""}"></td>`).join("")}</tr>`,
  ).join("");

  const casilleros = p.cabecera
    .map((c) => `<div class="casillero"><span class="etq">${esc(c.titulo)}</span></div>`)
    .join("");

  return `<section class="hoja${ultima ? "" : " corte"}">
  <header class="titulo">
    <div><h1>${esc(p.nombre)}</h1><p class="desc">${esc(p.descripcion)}</p>${de.lote ? `<p class="lote">Lote: ${esc(de.lote)}</p>` : ""}</div>
    <div class="derecha">${negocio ? `<div class="negocio">${esc(negocio)}</div>` : ""}${
      de.codigo ? `<div class="codigo"><span class="etq">Código de la hoja</span><b>${esc(de.codigo)}</b></div>` : ""
    }</div>
  </header>
  <div class="cabecera" style="grid-template-columns:repeat(${casillerosPorLinea(p)},1fr)">${casilleros}</div>
  <table class="filas"><colgroup>${cols}</colgroup>
    <thead><tr><th class="n">N°</th>${encabezado}</tr></thead>
    <tbody>${ejemplo}${vacias}</tbody>
  </table>
  <footer class="pie">
    ${p.metodo ? `<p class="metodo">Método: ${esc(p.metodo)}</p>` : ""}
    <div class="linea-pie"><span>Planilla ${esc(p.nombre)} · v${esc(p.versionPrompt)}${de.codigo ? ` · ${esc(de.codigo)}` : ""}</span><span>Hoja ____ de ____</span></div>
  </footer>
</section>`;
}

/**
 * El documento HTML completo. `copias` repite la hoja (1 a 20), cada una en su
 * página. `negocio` se imprime arriba a la derecha; `codigo` (la hoja de una
 * cubicación guardada, para encontrarla después con su papel) en un recuadro
 * debajo y al pie de cada hoja, y `lote` bajo el título.
 */
export function htmlDePlanilla(planilla: PlanillaCampo, opts: { negocio?: string; copias?: number } & HojaDeCubicacion = {}): string {
  const copias = Math.max(1, Math.min(20, Math.trunc(opts.copias ?? 1) || 1));
  const negocio = opts.negocio?.trim() || undefined;
  const de: HojaDeCubicacion = { codigo: opts.codigo?.trim().slice(0, 40) || undefined, lote: opts.lote?.trim().slice(0, 80) || undefined };
  const hojas = Array.from({ length: copias }, (_, i) => hoja(planilla, negocio, i === copias - 1, de)).join("\n");
  const tamano = planilla.orientacion === "horizontal" ? "A4 landscape" : "A4 portrait";
  const { ancho, alto } = UTIL[planilla.orientacion];

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<title>${esc(`Planilla ${planilla.nombre}`)}</title>
<style>
  @page { size: ${tamano}; margin: 10mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; color: #111827; font-family: Arial, Helvetica, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .hoja { width: ${ancho}mm; height: ${alto}mm; display: flex; flex-direction: column; overflow: hidden; }
  .corte { break-after: page; page-break-after: always; }
  .titulo { display: flex; justify-content: space-between; align-items: flex-start; gap: 6mm; height: 15mm; }
  h1 { font-size: 15pt; margin: 0; letter-spacing: .2pt; }
  .desc { font-size: 8pt; margin: 1mm 0 0; color: #4b5563; }
  .negocio { font-size: 10pt; font-weight: bold; text-align: right; max-width: 70mm; }
  .derecha { display: flex; flex-direction: column; align-items: flex-end; gap: 1mm; }
  .lote { font-size: 8.5pt; font-weight: bold; margin: 0.6mm 0 0; }
  .codigo { border: 0.45mm solid #111827; padding: 0.5mm 2mm; text-align: center; line-height: 1.1; }
  .codigo .etq { display: block; font-size: 5.5pt; }
  .codigo b { font: bold 12pt "Courier New", monospace; letter-spacing: .6pt; }
  .cabecera { display: grid; gap: 1.5mm; margin-bottom: 2mm; }
  .casillero { border: 0.35mm solid #111827; height: 8.5mm; padding: 0.6mm 1.2mm; }
  .etq { font-size: 6.5pt; color: #374151; text-transform: uppercase; letter-spacing: .3pt; }
  table.filas { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .filas th, .filas td { border: 0.3mm solid #111827; padding: 0 1.2mm; font-size: 9pt; overflow: hidden; white-space: nowrap; }
  .filas th { height: 12mm; font-size: 8.5pt; text-align: center; vertical-align: middle; background: #f3f4f6; line-height: 1.15; white-space: normal; }
  .filas th .u { display: block; font-weight: normal; font-size: 7.5pt; }
  .filas th .calc-nota { display: block; font-weight: normal; font-size: 6pt; color: #6b7280; font-style: italic; }
  .filas th.calc, .filas td.calc { background: #e5e7eb; }
  .filas td.n, .filas th.n { text-align: center; font-size: 8pt; color: #374151; }
  .filas tr.ej td { color: #9ca3af; font-style: italic; background: #f9fafb; }
  .filas tr.ej td.calc { background: #eef0f3; }
  .pie { margin-top: auto; padding-top: 2mm; font-size: 8pt; }
  .metodo { margin: 0 0 1.5mm; }
  .linea-pie { display: flex; justify-content: space-between; color: #374151; }
</style></head>
<body>
${hojas}
</body></html>`;
}
