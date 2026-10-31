/**
 * lib/documentos/hoja-negocio.ts — lo que necesitan las hojas que se imprimen en
 * una ventana nueva (`window.open` + `document.write`) para salir con el logo y
 * el nombre del negocio (Brandon 23-10: «cualquier documento de la empresa en
 * cualquier pestaña saldrá con el logo y nombre en el título»).
 *
 * - `membreteParaHtml`: el membrete A4 común (`membrete-html.ts`) con el logo en
 *   PNG del mismo sitio, listo para una hoja.
 * - `cabeceraTicketHtml`: para tickets térmicos de 58/80 mm: sólo un logo chico y
 *   el nombre, sin pie paginado.
 * - `imprimirAlCargar`: imprime cuando el logo ya llegó (si no, sale en blanco).
 *
 * El membrete tiene que estar cargado ANTES del clic (`useMembrete()`): una
 * ventana que se abre después de un `await` la bloquea el navegador.
 */

import type { Membrete } from "@/lib/admin/membrete";
import { escaparHtml, membreteHtml, srcSeguroDelLogo, type MembreteHtml } from "./membrete-html";
import { datosDelMembrete, type DocumentoMembrete } from "./membrete-pdf";

type DeNegocio = Partial<Membrete> | null | undefined;

/** El logo para una hoja: el PNG que sirve el panel (absoluto: la ventana nueva es about:blank) o el original. */
export function logoParaHoja(m: DeNegocio): string | null {
  const src = srcSeguroDelLogo(m?.logoPngUrl) ?? srcSeguroDelLogo(m?.logoUrl);
  if (!src) return null;
  if (src.startsWith("/") && typeof window !== "undefined") return `${window.location.origin}${src}`;
  return src;
}

/** Cabecera, estilos y pie del membrete común para una hoja HTML (A4). */
export function membreteParaHtml(m: DeNegocio, documento: DocumentoMembrete): MembreteHtml {
  const logoUrl = logoParaHoja(m);
  return membreteHtml(datosDelMembrete({ ...m, logoUrl, logo: null }, documento));
}

/**
 * Logo chico + nombre, centrados, para un ticket de 58 u 80 mm. Sin RUC, sin
 * dirección y sin pie: en una cinta de 32 columnas todo eso es papel.
 */
export function cabeceraTicketHtml(m: DeNegocio, o: { ancho?: 58 | 80 } = {}): { estilos: string; cabecera: string } {
  const nombre = (m?.nombre ?? "").trim() || (m?.razonSocial ?? "").trim();
  const src = logoParaHoja(m);
  const chico = o.ancho === 58;
  const estilos = `.tkt-cab{text-align:center;margin:0 0 2mm;font-family:Helvetica,Arial,sans-serif}.tkt-logo{display:block;margin:0 auto 1mm;max-height:${chico ? 10 : 14}mm;max-width:${chico ? 30 : 42}mm;object-fit:contain}.tkt-nombre{font-size:${chico ? 10 : 12}pt;font-weight:700;line-height:1.15}`;
  const cabecera =
    src || nombre
      ? `<div class="tkt-cab">${src ? `<img class="tkt-logo" src="${escaparHtml(src)}" alt="">` : ""}${nombre ? `<div class="tkt-nombre">${escaparHtml(nombre)}</div>` : ""}</div>`
      : "";
  return { estilos, cabecera };
}

/** Imprime cuando las imágenes de la ventana cargaron (tope 2 s: un logo caído no deja la hoja sin imprimir). */
export function imprimirAlCargar(w: Window): void {
  const lanzar = () => {
    try {
      w.focus();
      w.print();
    } catch {
      /* la ventana se cerró */
    }
  };
  const imgs = Array.from(w.document.images).filter((i) => !i.complete);
  if (!imgs.length) return lanzar();
  let hecho = false;
  const una = () => {
    if (hecho) return;
    hecho = true;
    lanzar();
  };
  let faltan = imgs.length;
  const uno = () => {
    faltan -= 1;
    if (faltan <= 0) una();
  };
  for (const i of imgs) {
    i.addEventListener("load", uno, { once: true });
    i.addEventListener("error", uno, { once: true });
  }
  setTimeout(una, 2000);
}
