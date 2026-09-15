/**
 * documentos-print — vista de impresión de los editores del drive.
 *
 * Ctrl+P sobre el editor imprimía la interfaz entera (barras, pestañas,
 * encabezados de grilla). Acá se arma un documento LIMPIO en una ventana
 * nueva: la planilla como tabla con su formato real (colores, bordes,
 * combinadas, alineación) y el documento de texto como texto corrido.
 *
 * Mismas convenciones que `cotizacion-print.ts`: sin auto-print (el botón
 * "Imprimir / Guardar PDF" lo dispara el usuario — el PDF sale del diálogo
 * del navegador) y colores hex acá porque esto ES el documento final, no UI
 * del panel.
 */

import type { CeldaHoja, HojaFormato } from "./xlsx-formato";
import { numeroALetra } from "./xlsx-formato";
import type { BloqueTexto } from "./texto-docx";

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

const fechaHoy = () => new Date().toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric" });

function abrirVentana(html: string): void {
  const w = window.open("", "_blank", "width=980,height=1000");
  if (w) {
    w.document.write(html);
    w.document.close();
  }
}

function envoltura(titulo: string, cuerpo: string, extraCss = ""): string {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>${esc(titulo)}</title><style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Calibri,Arial,sans-serif;color:#1a1a1a;padding:28px;background:#fff}
    .cab{display:flex;justify-content:space-between;align-items:baseline;border-bottom:2px solid #00A0A0;padding-bottom:8px;margin-bottom:14px}
    .cab h1{font-size:16px} .cab .meta{color:#777;font-size:10px}
    .btn{position:fixed;top:12px;right:12px;background:#00A0A0;color:#fff;border:0;padding:8px 14px;border-radius:6px;font-weight:700;cursor:pointer}
    @media print{.btn{display:none} body{padding:0}}
    ${extraCss}
  </style></head><body>
  <button class="btn" onclick="window.print()">Imprimir / Guardar PDF</button>
  <div class="cab"><h1>${esc(titulo)}</h1><div class="meta">Impreso el ${fechaHoy()} · Buleje</div></div>
  ${cuerpo}
  </body></html>`;
}

/** Última fila/columna con contenido, para no imprimir el mar de celdas vacías. */
function limites(hoja: HojaFormato): { filas: number; cols: number } {
  let filas = 0, cols = 0;
  hoja.filas.forEach((fila, f) => {
    fila.forEach((c, i) => {
      if ((c.texto ?? "").trim() !== "" || c.estilo?.fondo) {
        filas = Math.max(filas, f + 1);
        cols = Math.max(cols, i + 1 + ((c.colspan ?? 1) - 1));
      }
    });
  });
  return { filas: Math.max(filas, 1), cols: Math.max(cols, 1) };
}

function estiloCeldaCss(c: CeldaHoja): string {
  const e = c.estilo;
  const partes: string[] = [];
  if (e?.negrita) partes.push("font-weight:700");
  if (e?.cursiva) partes.push("font-style:italic");
  if (e?.subrayado) partes.push("text-decoration:underline");
  if (e?.tamano) partes.push(`font-size:${e.tamano}pt`);
  if (e?.fondo) partes.push(`background:${e.fondo}`);
  if (e?.color && e.fondo) partes.push(`color:${e.color}`); // sin fondo manda la tinta del papel
  if (e?.alineacion) partes.push(`text-align:${e.alineacion}`);
  const borde = (lado: string, hay?: boolean) => { if (hay) partes.push(`border-${lado}:1px solid #555`); };
  borde("top", e?.bordes?.arriba);
  borde("bottom", e?.bordes?.abajo);
  borde("left", e?.bordes?.izq);
  borde("right", e?.bordes?.der);
  return partes.join(";");
}

/** Imprime la hoja activa como una tabla limpia con su formato. */
export function imprimirHoja(hoja: HojaFormato, nombreArchivo: string): void {
  const { filas, cols } = limites(hoja);
  const colgroup = Array.from({ length: cols }, (_, c) =>
    hoja.columnasOcultas[c] ? "" : `<col style="width:${Math.round((hoja.anchos[c] ?? 64) * 1.15)}px">`).join("");

  const cuerpo: string[] = [];
  for (let f = 0; f < filas; f++) {
    if (hoja.filasOcultas[f]) continue;
    const celdas: string[] = [];
    for (let c = 0; c < cols; c++) {
      const celda = hoja.filas[f]?.[c];
      if (!celda || celda.tapada || hoja.columnasOcultas[c]) continue;
      const attrs = celda.colspan && celda.colspan > 1 ? ` colspan="${Math.min(celda.colspan, cols - c)}"` : "";
      const css = estiloCeldaCss(celda);
      celdas.push(`<td${attrs}${css ? ` style="${css}"` : ""}>${esc(celda.texto ?? "")}</td>`);
    }
    cuerpo.push(`<tr style="height:${hoja.altos[f] ?? 20}px">${celdas.join("")}</tr>`);
  }

  const tabla = `<table><colgroup>${colgroup}</colgroup><tbody>${cuerpo.join("")}</tbody></table>
  <div class="pie">Hoja "${esc(hoja.nombre)}" · columnas A–${numeroALetra(cols)} · ${filas} filas</div>`;

  abrirVentana(envoltura(nombreArchivo, tabla, `
    table{border-collapse:collapse;table-layout:fixed;font-size:11px}
    td{border:1px solid #ddd;padding:2px 5px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;vertical-align:bottom}
    .pie{margin-top:10px;color:#999;font-size:9px}
    @page{size:landscape}
  `));
}

/** Imprime el documento de texto como texto corrido, sin la interfaz. */
export function imprimirTexto(bloques: BloqueTexto[], nombreArchivo: string): void {
  const partes: string[] = [];
  let lista: string[] = [];
  const cerrarLista = () => {
    if (lista.length > 0) {
      partes.push(`<ul>${lista.join("")}</ul>`);
      lista = [];
    }
  };
  for (const b of bloques) {
    const estilo = [b.negrita ? "font-weight:700" : "", b.cursiva ? "font-style:italic" : ""].filter(Boolean).join(";");
    const attr = estilo ? ` style="${estilo}"` : "";
    const texto = esc(b.texto).replace(/\n/g, "<br>");
    if (b.tipo === "lista") {
      lista.push(`<li${attr}>${texto}</li>`);
      continue;
    }
    cerrarLista();
    if (b.tipo === "titulo") partes.push(`<h2${attr}>${texto}</h2>`);
    else if (b.tipo === "subtitulo") partes.push(`<h3${attr}>${texto}</h3>`);
    else partes.push(`<p${attr}>${texto}</p>`);
  }
  cerrarLista();

  abrirVentana(envoltura(nombreArchivo, `<div class="doc">${partes.join("")}</div>`, `
    .doc{max-width:680px;margin:0 auto;font-size:12px;line-height:1.65}
    .doc h2{font-size:20px;margin:18px 0 8px} .doc h3{font-size:15px;margin:14px 0 6px}
    .doc p{margin:0 0 10px} .doc ul{margin:0 0 10px 22px}
  `));
}
