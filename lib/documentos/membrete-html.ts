/**
 * lib/documentos/membrete-html.ts — el mismo membrete de `membrete-pdf.ts` para
 * los documentos que se imprimen desde HTML (ventana nueva + «Imprimir / Guardar
 * PDF»). Devuelve tres trozos para meter en la página: `estilos` (va en
 * `<style>`), `cabecera` y `pie`. Todo lo que viene del negocio sale escapado;
 * el logo sólo si es un data URL de imagen, https o una ruta propia.
 *
 * El pie repite «Página X de Y» con los contadores de `@page` (Chrome 131+);
 * en un navegador que no los dibuje queda la línea con la fecha de emisión.
 */

import { emitidoEnLima, type DatosMembrete, PALETA, type Rgb } from "./membrete-pdf";

export function escaparHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** El `src` del logo si es seguro de poner en un `<img>`; `null` si no. */
export function srcSeguroDelLogo(src: string | null | undefined): string | null {
  const s = (src ?? "").trim();
  if (/^data:image\/(png|jpe?g|webp|gif);base64,[a-z0-9+/=\s]+$/i.test(s)) return s.replace(/\s+/g, "");
  if (/^https:\/\/[^\s"'<>]+$/i.test(s)) return s;
  if (/^\/(?!\/)[^\s"'<>]*$/.test(s)) return s;
  return null;
}

const rgb = (c: Rgb) => `rgb(${c[0]} ${c[1]} ${c[2]})`;

export interface MembreteHtml {
  estilos: string;
  cabecera: string;
  pie: string;
}

/** Los trozos HTML del membrete. `emitido` = la hora que dice el pie (por defecto, ahora). */
export function membreteHtml(m: DatosMembrete, o: { emitido?: Date } = {}): MembreteHtml {
  const src = srcSeguroDelLogo(m.logo?.dataUrl ?? m.logoUrl);
  const marca = src
    ? `<img class="mbr-logo" src="${escaparHtml(src)}" alt="">`
    : `<div class="mbr-mono" aria-hidden="true">${escaparHtml(m.monograma)}</div>`;
  const derecha = [
    `<div class="mbr-tipo">${escaparHtml(m.tipo)}</div>`,
    m.codigo ? `<div class="mbr-cod">${escaparHtml(m.codigo)}</div>` : "",
    m.fecha ? `<div class="mbr-fecha">${escaparHtml(m.fecha)}</div>` : "",
    m.extra ? `<div class="mbr-extra">${escaparHtml(m.extra)}</div>` : "",
  ].join("");
  const cabecera = `<header class="mbr-cab">${marca}<div class="mbr-txt"><div class="mbr-nombre">${escaparHtml(m.titulo)}</div>${
    m.razonSocial ? `<div class="mbr-rs">${escaparHtml(m.razonSocial)}</div>` : ""
  }${m.datos.length ? `<div class="mbr-datos">${m.datos.map(escaparHtml).join(" &middot; ")}</div>` : ""}</div><div class="mbr-doc">${derecha}</div></header>`;
  const emitido = `Emitido el ${emitidoEnLima(o.emitido ?? new Date())} (hora de Lima)`;
  const pie = `<footer class="mbr-pie"><span>${escaparHtml(emitido)}</span>${m.pie ? `<span class="mbr-pie-negocio">${escaparHtml(m.pie)}</span>` : ""}</footer>`;
  const a = rgb(m.acento);
  const estilos = `
.mbr-cab{display:flex;align-items:center;gap:4.5mm;padding-bottom:3.5mm;border-bottom:.5mm solid ${a};margin-bottom:7mm;font-family:Helvetica,Arial,sans-serif}
.mbr-logo{height:18mm;max-width:44mm;object-fit:contain}
.mbr-mono{width:18mm;height:18mm;border-radius:3.2mm;background:${a};color:rgb(255 255 255);display:flex;align-items:center;justify-content:center;font:700 22pt Helvetica,Arial,sans-serif}
.mbr-txt{flex:1;min-width:0}
.mbr-nombre{font-size:15pt;font-weight:700;color:${rgb(PALETA.tinta)};line-height:1.18}
.mbr-rs{font-size:8pt;color:${rgb(PALETA.secundario)};margin-top:1mm}
.mbr-datos{font-size:8pt;color:${rgb(PALETA.terciario)};margin-top:1mm}
.mbr-doc{text-align:right;max-width:42%}
.mbr-tipo{font-size:8.5pt;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:${a}}
.mbr-cod{font-size:13pt;font-weight:700;color:${rgb(PALETA.tinta)};margin-top:.6mm}
.mbr-fecha{font-size:8.5pt;color:${rgb(PALETA.secundario)};margin-top:.6mm}
.mbr-extra{font-size:8pt;color:${rgb(PALETA.terciario)};margin-top:.6mm}
.mbr-pie{display:flex;justify-content:space-between;gap:4mm;border-top:.2mm solid ${rgb(PALETA.regla)};padding-top:2mm;margin-top:8mm;font:7pt Helvetica,Arial,sans-serif;color:${rgb(PALETA.terciario)}}
.mbr-pie-negocio{color:${rgb(PALETA.secundario)}}
@page{@bottom-right{content:"Página " counter(page) " de " counter(pages);font:7pt Helvetica,Arial,sans-serif;color:${rgb(PALETA.terciario)}}}
`.trim();
  return { estilos, cabecera, pie };
}
